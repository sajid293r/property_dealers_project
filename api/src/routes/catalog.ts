import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, paging, parse } from "../http.js";
import { AppError } from "../errors.js";

const PROJECT_COLUMNS = `p.id, p.code, p.name, p.type, p.status, p.city, p.address, p.description, p.created_at as "createdAt",
  p.land_area_marla as "landAreaMarla", p.approved_budget as "approvedBudget", p.planned_start as "plannedStart", p.planned_end as "plannedEnd"`;

/** Projects (housing schemes, towers) and the property types a company sells. */
export function catalogRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/property-types", { preHandler: guards.inCompany("inventory.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(`select id, code, name, property_group as "group" from property_types where active order by name`);
      return r.rows;
    });
  });

  app.get("/v1/projects", { preHandler: guards.inCompany("inventory.view") }, async (req) => {
    const q = parse(paging, req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${PROJECT_COLUMNS},
                count(pr.id)::int as "propertyCount",
                count(pr.id) filter (where pr.status = 'available')::int as "availableCount"
           from projects p left join properties pr on pr.project_id = p.id and pr.deleted_at is null
          where p.deleted_at is null
          group by p.id order by p.created_at desc, p.id limit $1 offset $2`,
        [q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.get("/v1/projects/:id", { preHandler: guards.inCompany("inventory.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(`select ${PROJECT_COLUMNS} from projects p where p.id = $1 and p.deleted_at is null`, [id]);
      if (!r.rows[0]) throw new AppError(404, "not_found", "Project not found.");
      return r.rows[0];
    });
  });

  app.post("/v1/projects", { preHandler: guards.inCompany("inventory.create") }, async (req, reply) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(120),
        type: z.enum(["residential", "commercial", "mixed_use"]).default("residential"),
        city: z.string().trim().max(80).optional(),
        address: z.string().trim().max(300).optional(),
        description: z.string().trim().max(2000).optional(),
        landAreaMarla: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().positive().max(10_000_000)).optional(),
        approvedBudget: money.default("0"),
        plannedStart: isoDate.optional(),
        plannedEnd: isoDate.optional(),
      }),
      req.body,
    );
    if (body.plannedStart && body.plannedEnd && body.plannedEnd < body.plannedStart) {
      throw new AppError(400, "invalid_dates", "The planned end date cannot be before the start date.");
    }
    const ctx = ctxOf(req);
    const project = await db.inTenant(ctx, async (c) => {
      const code = (await c.query<{ n: string }>(`select app.next_doc_no($1, 'PRJ') as n`, [ctx.companyId])).rows[0]!.n;
      const r = await c.query(
        `insert into projects (company_id, code, name, type, city, address, description, land_area_marla, approved_budget, planned_start, planned_end)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
        [ctx.companyId, code, body.name, body.type, body.city ?? null, body.address ?? null, body.description ?? null,
         body.landAreaMarla ?? null, body.approvedBudget, body.plannedStart ?? null, body.plannedEnd ?? null],
      );
      const out = await c.query(`select ${PROJECT_COLUMNS}, 0 as "propertyCount", 0 as "availableCount" from projects p where p.id = $1`, [r.rows[0]!.id]);
      return out.rows[0];
    });
    return reply.code(201).send(project);
  });
}
