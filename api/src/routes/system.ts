import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { parse } from "../http.js";

const ENTITIES = ["booking", "installment", "receipt", "property", "voucher"] as const;

export function systemRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  // Is the process up / can it reach the database. No sign-in; used by the host's health checks.
  app.get("/health", async () => ({ ok: true }));
  app.get("/health/db", async () => ({ ok: await db.ping() }));

  // Who am I, and which companies can I enter? (needs sign-in only: this is what runs before a company is chosen)
  app.get("/v1/me", { preHandler: guards.signedIn }, async (req) => {
    const user = req.auth!;
    const companies = await db.asUser(user.userId, async (q) => {
      const r = await q.query(
        `select c.id as "companyId", c.name, c.short_name as "shortName", cm.status, r.name as "role", app.company_plan(c.id) as "plan"
           from company_members cm
           join companies c on c.id = cm.company_id
           join roles r on r.id = cm.role_id
          where cm.user_id = app.current_user_id()
          order by c.name`,
      );
      return r.rows;
    });
    const profile = await db.asUser(user.userId, async (q) => (await q.query<{ full_name: string }>(`select full_name from users where id = $1`, [user.userId])).rows[0]);
    return { user: { id: user.userId, email: user.email, fullName: profile?.full_name ?? user.fullName }, companies };
  });

  // Change my own display name (it is what colleagues see on records and in the users list).
  app.patch("/v1/me", { preHandler: guards.signedIn }, async (req) => {
    const user = req.auth!;
    const b = parse(z.object({ fullName: z.string().trim().min(2).max(80) }), req.body);
    await db.asUser(user.userId, (q) => q.query(`update users set full_name = $2 where id = $1`, [user.userId, b.fullName]));
    return { user: { id: user.userId, email: user.email, fullName: b.fullName } };
  });

  // What may the signed-in person do in this company? (the screens use it to hide buttons that would be refused)
  app.get("/v1/access", { preHandler: guards.inCompany() }, async (req) => {
    const ctx = ctxOf(req);
    return { companyId: ctx.companyId, permissions: ctx.permissions, plan: ctx.plan };
  });

  // What can this record do next, and which permission does each move need? (the UI uses this to show buttons)
  app.get("/v1/transitions/:entity/:from", { preHandler: guards.inCompany() }, async (req) => {
    const { entity, from } = parse(z.object({ entity: z.enum(ENTITIES), from: z.string().min(1).max(40) }), req.params);
    const ctx = ctxOf(req);
    const rows = await db.inTenant(ctx, async (q) => {
      const r = await q.query<{ to_state: string; required_permission: string | null; description: string | null }>(
        `select to_state, required_permission, description from app.allowed_transitions($1, $2)`,
        [entity, from],
      );
      return r.rows;
    });
    return rows.map((t) => ({
      to: t.to_state,
      description: t.description,
      requiredPermission: t.required_permission,
      allowedForYou: t.required_permission === null || ctx.permissions.includes(t.required_permission),
    }));
  });
}
