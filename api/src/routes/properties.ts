import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, money, paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

const STATUSES = ["available", "reserved", "sold", "blocked", "rented", "cancelled"] as const;
const SIZE_UNITS = ["marla", "kanal", "sqft", "sqyd", "acre"] as const;

// What a property looks like to the screens: its type, project, block and size (as typed AND in square feet).
const PROPERTY_SELECT = `
  select p.id, p.code, p.title, p.status, p.list_price as "listPrice", p.installments_available as "installmentsAvailable",
         p.project_id as "projectId", pr.name as "project", pb.name as "block", pt.name as "type", pt.id as "typeId",
         d.size_value as "sizeValue", d.size_unit as "sizeUnit", d.size_sqft as "sizeSqft", p.created_at as "createdAt"
    from properties p
    join property_types pt on pt.id = p.type_id
    left join projects pr on pr.id = p.project_id
    left join project_blocks pb on pb.id = p.block_id
    left join property_dimensions d on d.property_id = p.id`;

export function propertyRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/properties", { preHandler: guards.inCompany("inventory.view") }, async (req) => {
    const q = parse(
      paging.extend({ status: z.enum(STATUSES).optional(), projectId: uuid.optional(), search: z.string().trim().min(1).max(80).optional() }),
      req.query,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `${PROPERTY_SELECT}
          where p.deleted_at is null
            and ($1::text is null or p.status = $1)
            and ($2::uuid is null or p.project_id = $2)
            and ($3::text is null or p.code ilike '%' || $3 || '%' or p.title ilike '%' || $3 || '%')
          order by p.code
          limit $4 offset $5`,
        [q.status ?? null, q.projectId ?? null, q.search ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  // One property: what it is, whether it is held or booked, and every status change it has had.
  app.get("/v1/properties/:id", { preHandler: guards.inCompany("inventory.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) => {
      const p = await c.query(`${PROPERTY_SELECT} where p.id = $1 and p.deleted_at is null`, [id]);
      if (!p.rows[0]) throw new AppError(404, "not_found", "Property not found.");
      const hold = await c.query(
        `select id, held_for_party_id as "heldForPartyId", held_by as "heldBy", held_at as "heldAt", expires_at as "expiresAt"
           from property_holds where property_id = $1 and released_at is null and expires_at > now()`,
        [id],
      );
      const history = await c.query(
        `select from_status as "from", to_status as "to", reason, changed_by as "changedBy", changed_at as "changedAt"
           from property_status_history where property_id = $1 order by changed_at desc, id desc limit 50`,
        [id],
      );
      return { ...p.rows[0], activeHold: hold.rows[0] ?? null, statusHistory: history.rows };
    });
  });

  // Add a property. The code (PRP-00001) is numbered by the database; a block name creates the block if it is new.
  app.post("/v1/properties", { preHandler: guards.inCompany("inventory.create") }, async (req, reply) => {
    const body = parse(
      z.object({
        title: z.string().trim().min(2).max(160),
        typeId: uuid,
        projectId: uuid.optional(),
        block: z.string().trim().min(1).max(60).optional(),
        listPrice: money,
        size: z.object({ value: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().positive().max(1_000_000)), unit: z.enum(SIZE_UNITS) }).optional(),
        installmentsAvailable: z.boolean().default(false),
      }),
      req.body,
    );
    if (body.block && !body.projectId) throw new AppError(400, "project_required", "A block belongs to a project; choose the project first.");
    const ctx = ctxOf(req);
    const created = await db.inTenant(ctx, async (c) => {
      const code = (await c.query<{ n: string }>(`select app.next_doc_no($1, 'PRP') as n`, [ctx.companyId])).rows[0]!.n;
      let blockId: string | null = null;
      if (body.block && body.projectId) {
        const b = await c.query<{ id: string }>(
          `insert into project_blocks (company_id, project_id, name) values ($1, $2, $3)
           on conflict (project_id, name) do update set name = excluded.name returning id`,
          [ctx.companyId, body.projectId, body.block],
        );
        blockId = b.rows[0]!.id;
      }
      const p = await c.query<{ id: string }>(
        `insert into properties (company_id, project_id, block_id, type_id, code, title, list_price, installments_available)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [ctx.companyId, body.projectId ?? null, blockId, body.typeId, code, body.title, body.listPrice, body.installmentsAvailable],
      );
      const id = p.rows[0]!.id;
      if (body.size) {
        await c.query(
          `insert into property_dimensions (company_id, property_id, size_value, size_unit, size_sqft)
           values ($1, $2, $3, $4, app.normalize_area($1, $3, $4))`,
          [ctx.companyId, id, body.size.value, body.size.unit],
        );
      }
      return (await c.query(`${PROPERTY_SELECT} where p.id = $1`, [id])).rows[0];
    });
    return reply.code(201).send(created);
  });

  // Reserve a property for a while. The database refuses if it is not available or someone else holds it.
  app.post("/v1/properties/:id/holds", { preHandler: guards.inCompany("deals.create") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ partyId: uuid.nullish(), minutes: z.number().int().min(5).max(60 * 24 * 14).default(24 * 60) }), req.body ?? {});
    const ctx = ctxOf(req);
    const holdId = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(`select app.place_hold($1, $2, $3, $4) as id`, [id, body.partyId ?? null, ctx.userId, body.minutes]);
      return r.rows[0]!.id;
    });
    return reply.code(201).send({ holdId });
  });

  app.delete("/v1/holds/:id", { preHandler: guards.inCompany("deals.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await db.inTenant(ctxOf(req), async (c) => {
      await c.query(`select app.release_hold($1, 'manual')`, [id]);
    });
    return reply.code(204).send();
  });
}
