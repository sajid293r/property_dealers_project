import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { isoDate, paging, parse, uuid } from "../http.js";

/** Columns that are bookkeeping noise, or must never be shown (encrypted / hashed identity numbers). */
const HIDDEN = /^(updated_at|created_at|version|company_id|id|idempotency_key)$|cnic_(enc|hash)/;

type Json = Record<string, unknown> | null;

function changes(action: string, before: Json, after: Json) {
  const a = after ?? {};
  const b = before ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: { field: string; from: unknown; to: unknown }[] = [];
  for (const k of keys) {
    if (HIDDEN.test(k)) continue;
    if (action !== "create" && action !== "delete" && JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
    out.push({ field: k, from: action === "create" ? undefined : b[k], to: action === "delete" ? undefined : a[k] });
  }
  return out.slice(0, 40);
}

/** Who changed what, and when. Written by the database itself (triggers), so no screen or script can skip it. */
export function auditRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/audit", { preHandler: guards.inCompany("administration.view") }, async (req) => {
    const q = parse(
      paging.extend({
        entityType: z.string().trim().max(60).optional(),
        entityId: uuid.optional(),
        userId: uuid.optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
      req.query,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query<{ id: string; occurred_at: string; user_id: string | null; user_name: string | null; action: string; entity_type: string; entity_id: string | null; before_data: Json; after_data: Json }>(
        `select a.id::text, a.occurred_at, a.user_id, u.full_name as user_name, a.action, a.entity_type, a.entity_id, a.before_data, a.after_data
           from audit_log a left join users u on u.id = a.user_id
          where a.company_id = app.current_company()
            and ($1::text is null or a.entity_type = $1) and ($2::uuid is null or a.entity_id = $2) and ($3::uuid is null or a.user_id = $3)
            and ($4::date is null or a.occurred_at >= $4) and ($5::date is null or a.occurred_at < $5::date + 1)
          order by a.occurred_at desc, a.id desc limit $6 offset $7`,
        [q.entityType ?? null, q.entityId ?? null, q.userId ?? null, q.from ?? null, q.to ?? null, q.limit, q.offset],
      );
      const types = await c.query<{ entity_type: string }>(`select distinct entity_type from audit_log where company_id = app.current_company() order by 1`);
      return {
        entityTypes: types.rows.map((t) => t.entity_type),
        rows: r.rows.map((x) => ({
          id: x.id,
          at: x.occurred_at,
          userId: x.user_id,
          userName: x.user_name,
          action: x.action,
          entityType: x.entity_type,
          entityId: x.entity_id,
          changes: changes(x.action, x.before_data, x.after_data),
        })),
      };
    });
  });
}
