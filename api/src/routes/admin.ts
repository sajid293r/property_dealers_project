import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";
import { MODULE_KEYS } from "../roles.js";
import { LANGUAGES } from "../languages.js";
import { FEATURES, PLAN_LIMITS, PLAN_NAME, PLAN_RANK, SEAT_PACKS, requirePlan } from "../plans.js";

const grantSchema = z.object({ view: z.boolean(), create: z.boolean(), edit: z.boolean(), delete: z.boolean(), approve: z.boolean() });
const roleBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  scope: z.enum(["own", "team", "branch", "company"]).default("company"),
  permissions: z.record(z.string(), grantSchema),
});

/** The roles this company's organization can use: its own and the standard ones. Roles are not row-isolated, so every query names the org. */
const ORG = `app.company_org(app.current_company())`;

async function listRoles(c: Queryable) {
  const roles = await c.query(
    `select r.id, r.name, r.description, r.is_system as "isSystem",
            (select count(*)::int from company_members m where m.role_id = r.id and m.company_id = app.current_company()) as "members"
       from roles r where r.org_id = ${ORG} or r.org_id is null order by r.is_system desc, r.name`,
  );
  const perms = await c.query(
    `select p.role_id as "roleId", p.module, p.can_view as view, p.can_create as create, p.can_edit as edit, p.can_delete as delete, p.can_approve as approve, p.data_scope as scope
       from role_permissions p join roles r on r.id = p.role_id where r.org_id = ${ORG} or r.org_id is null`,
  );
  return roles.rows.map((r) => {
    const mine = perms.rows.filter((p) => p.roleId === r.id);
    return {
      ...r,
      scope: mine[0]?.scope ?? "company",
      permissions: Object.fromEntries(mine.map((p) => [p.module, { view: p.view, create: p.create, edit: p.edit, delete: p.delete, approve: p.approve }])),
    };
  });
}

/** Seats the company may use: what its plan includes plus any packs bought. */
async function seatLimit(c: Queryable, plan: keyof typeof PLAN_LIMITS) {
  const r = await c.query<{ n: number }>(`select app.company_extra_seats(app.current_company()) as n`);
  const extra = Number(r.rows[0]?.n ?? 0);
  return { included: PLAN_LIMITS[plan].users, extra, total: PLAN_LIMITS[plan].users + extra };
}

async function seatUsage(c: Queryable) {
  const m = await c.query<{ n: number }>(`select count(*)::int as n from company_members where status in ('active','invited')`);
  const i = await c.query<{ n: number }>(`select count(*)::int as n from company_invites where status = 'pending'`);
  return { members: m.rows[0]!.n, invites: i.rows[0]!.n };
}

async function writePermissions(c: Queryable, roleId: string, scope: string, permissions: Record<string, z.infer<typeof grantSchema>>) {
  await c.query(`delete from role_permissions where role_id = $1`, [roleId]);
  for (const module of MODULE_KEYS) {
    const g = permissions[module] ?? { view: false, create: false, edit: false, delete: false, approve: false };
    await c.query(
      `insert into role_permissions (role_id, module, can_view, can_create, can_edit, can_delete, can_approve, data_scope) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [roleId, module, g.view, g.create, g.edit, g.delete, g.approve, scope],
    );
  }
}

export function adminRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  // ───────────────────────────── the company's profile and settings
  app.get("/v1/company", { preHandler: guards.inCompany() }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select id, name, short_name as "shortName", ntn, strn, city, province, address, phone, email, base_currency as "currency", fiscal_year_start as "fiscalYearStart",
                (settings ->> 'marla_sqft')::numeric as "marlaSqft", coalesce((settings ->> 'penalty_rate_pct_month')::numeric, 0) as "penaltyRatePctMonth", coalesce((settings ->> 'penalty_grace_days')::int, 0) as "penaltyGraceDays", coalesce((settings ->> 'voucher_self_approval')::boolean, true) as "voucherSelfApproval", settings ->> 'default_language' as "defaultLanguage"
           from companies where id = app.current_company()`,
      );
      return r.rows[0];
    });
  });

  app.patch("/v1/company", { preHandler: guards.inCompany("administration.edit") }, async (req) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(2).max(120).optional(),
        shortName: z.string().trim().max(40).nullable().optional(),
        ntn: z.string().trim().max(30).nullable().optional(),
        strn: z.string().trim().max(30).nullable().optional(),
        city: z.string().trim().max(60).nullable().optional(),
        province: z.string().trim().max(60).nullable().optional(),
        address: z.string().trim().max(300).nullable().optional(),
        phone: z.string().trim().max(30).nullable().optional(),
        email: z.string().trim().email().max(120).nullable().optional(),
        marlaSqft: z.number().min(100).max(500).optional(),
        voucherSelfApproval: z.boolean().optional(),
        penaltyRatePctMonth: z.number().min(0).max(20).optional(),
        penaltyGraceDays: z.number().int().min(0).max(120).optional(),
        defaultLanguage: z.enum(LANGUAGES).optional(),
      }),
      req.body,
    );
    const cols: Record<string, string> = { name: "name", shortName: "short_name", ntn: "ntn", strn: "strn", city: "city", province: "province", address: "address", phone: "phone", email: "email" };
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, col] of Object.entries(cols)) {
      const v = (b as Record<string, unknown>)[k];
      if (v === undefined) continue;
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
    // all settings travel in ONE assignment (a single UPDATE cannot assign the same column twice)
    const patch: Record<string, unknown> = {};
    if (b.marlaSqft !== undefined) patch.marla_sqft = b.marlaSqft;
    if (b.penaltyRatePctMonth !== undefined) patch.penalty_rate_pct_month = b.penaltyRatePctMonth;
    if (b.penaltyGraceDays !== undefined) patch.penalty_grace_days = b.penaltyGraceDays;
    if (b.defaultLanguage !== undefined) patch.default_language = b.defaultLanguage;
    if (b.voucherSelfApproval !== undefined) patch.voucher_self_approval = b.voucherSelfApproval;
    if (Object.keys(patch).length) { vals.push(JSON.stringify(patch)); sets.push(`settings = settings || $${vals.length}::jsonb`); }
    return db.inTenant(ctxOf(req), async (c) => {
      if (sets.length) await c.query(`update companies set ${sets.join(", ")} where id = app.current_company()`, vals);
      const r = await c.query(`select id, name, short_name as "shortName", ntn, strn, city, province, address, phone, email, settings ->> 'default_language' as "defaultLanguage" from companies where id = app.current_company()`);
      return r.rows[0];
    });
  });

  // ───────────────────────────── the plan: what is included, how many seats are used
  app.get("/v1/plan", { preHandler: guards.inCompany() }, async (req) => {
    const ctx = ctxOf(req);
    const { usage, seats } = await db.inTenant(ctx, async (c) => ({ usage: await seatUsage(c), seats: await seatLimit(c, ctx.plan) }));
    const limits = PLAN_LIMITS[ctx.plan];
    return {
      plan: ctx.plan,
      name: PLAN_NAME[ctx.plan],
      users: { used: usage.members, invited: usage.invites, limit: seats.total, included: seats.included, extra: seats.extra },
      seatPacks: SEAT_PACKS,
      customRoles: limits.customRoles,
      features: FEATURES.map((f) => ({ key: f.key, name: f.name, tier: f.tier, tierName: PLAN_NAME[f.tier], included: PLAN_RANK[ctx.plan] >= PLAN_RANK[f.tier] })),
    };
  });

  // ───────────────────────────── people
  app.get("/v1/members", { preHandler: guards.inCompany("administration.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => {
      const members = await c.query(
        `select u.id as "userId", u.full_name as "fullName", u.email, m.role_id as "roleId", r.name as "role", m.status, m.created_at as "joinedAt", u.last_login_at as "lastLoginAt"
           from company_members m join users u on u.id = m.user_id join roles r on r.id = m.role_id
          where m.company_id = app.current_company() order by u.full_name`,
      );
      const invites = await c.query(
        `select i.id, i.email, i.role_id as "roleId", r.name as "role", i.created_at as "invitedAt" from company_invites i join roles r on r.id = i.role_id where i.status = 'pending' order by i.created_at desc`,
      );
      return { members: members.rows, invites: invites.rows };
    });
  });

  app.post("/v1/invites", { preHandler: guards.inCompany("administration.create") }, async (req, reply) => {
    const b = parse(z.object({ email: z.string().trim().toLowerCase().email().max(120), roleId: uuid }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const seats = await seatLimit(c, ctx.plan);
      const limit = seats.total;
      const usage = await seatUsage(c);
      if (usage.members + usage.invites >= limit) {
        throw new AppError(403, "plan_limit", `All ${limit} user seats of your ${PLAN_NAME[ctx.plan]} plan are taken (including pending invitations). Buy extra seats, upgrade the plan, or remove someone.`, { limit });
      }
      const role = await c.query(`select id, name from roles where id = $1 and (org_id = ${ORG} or org_id is null)`, [b.roleId]);
      if (!role.rows[0]) throw new AppError(404, "not_found", "That role does not exist.");
      const exists = await c.query(`select 1 from company_members m join users u on u.id = m.user_id where lower(u.email) = $1`, [b.email]);
      if (exists.rows[0]) throw new AppError(409, "already_member", "This person is already part of the company.");
      // someone who already has a PropIQ sign-in joins at once; anyone else joins the first time they sign in
      const known = await c.query<{ id: string }>(`select id from users where lower(email) = $1`, [b.email]);
      if (known.rows[0]) {
        await c.query(`insert into company_members (company_id, user_id, role_id, status) values (app.current_company(), $1, $2, 'active')`, [known.rows[0].id, b.roleId]);
        return { email: b.email, role: role.rows[0].name };
      }
      await c.query(`insert into company_invites (company_id, email, role_id, invited_by) values (app.current_company(), $1, $2, $3)`, [b.email, b.roleId, ctx.userId]);
      return { email: b.email, role: role.rows[0].name };
    });
    return reply.code(201).send(out);
  });

  app.delete("/v1/invites/:id", { preHandler: guards.inCompany("administration.delete") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await db.inTenant(ctxOf(req), (c) => c.query(`update company_invites set status = 'revoked' where id = $1 and status = 'pending'`, [id]));
    return reply.code(204).send();
  });

  app.patch("/v1/members/:id", { preHandler: guards.inCompany("administration.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ roleId: uuid.optional(), status: z.enum(["active", "suspended"]).optional() }), req.body);
    const ctx = ctxOf(req);
    if (id === ctx.userId) throw new AppError(409, "self_change", "You cannot change your own role or access. Ask another administrator.");
    return db.inTenant(ctx, async (c) => {
      const cur = await c.query<{ role_id: string; status: string; owners: number; is_owner: boolean }>(
        `select m.role_id, m.status, r.name = 'Owner' as is_owner,
                (select count(*)::int from company_members x join roles xr on xr.id = x.role_id where x.company_id = m.company_id and xr.name = 'Owner' and x.status = 'active') as owners
           from company_members m join roles r on r.id = m.role_id where m.user_id = $1`,
        [id],
      );
      const m = cur.rows[0];
      if (!m) throw new AppError(404, "not_found", "That person is not part of this company.");
      const losesOwner = m.is_owner && m.status === "active" && (b.status === "suspended" || (b.roleId && b.roleId !== m.role_id));
      if (losesOwner && m.owners <= 1) throw new AppError(409, "last_owner", "The company must keep at least one active owner.");
      if (b.roleId) {
        const role = await c.query(`select 1 from roles where id = $1 and (org_id = ${ORG} or org_id is null)`, [b.roleId]);
        if (!role.rows[0]) throw new AppError(404, "not_found", "That role does not exist.");
      }
      await c.query(`update company_members set role_id = coalesce($2::uuid, role_id), status = coalesce($3::text, status) where user_id = $1`, [id, b.roleId ?? null, b.status ?? null]);
      return { ok: true };
    });
  });

  // ───────────────────────────── roles (the permission grid)
  app.get("/v1/roles", { preHandler: guards.inCompany("administration.view") }, async (req) => {
    return db.inTenant(ctxOf(req), listRoles);
  });

  app.post("/v1/roles", { preHandler: guards.inCompany("administration.create") }, async (req, reply) => {
    const ctx = ctxOf(req);
    if (!PLAN_LIMITS[ctx.plan].customRoles) requirePlan(ctx.plan, "moderate", "Custom roles");
    const b = parse(roleBody, req.body);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(`insert into roles (org_id, name, description, is_system) values (${ORG}, $1, $2, false) returning id`, [b.name, b.description ?? null]);
      await writePermissions(c, r.rows[0]!.id, b.scope, b.permissions);
      return (await listRoles(c)).find((x) => x.id === r.rows[0]!.id);
    });
    return reply.code(201).send(out);
  });

  app.put("/v1/roles/:id", { preHandler: guards.inCompany("administration.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const ctx = ctxOf(req);
    const b = parse(roleBody, req.body);
    return db.inTenant(ctx, async (c) => {
      const r = await c.query<{ is_system: boolean }>(`select is_system from roles where id = $1 and org_id = ${ORG}`, [id]);
      if (!r.rows[0]) throw new AppError(404, "not_found", "Role not found.");
      if (r.rows[0].is_system) throw new AppError(409, "system_role", "The standard roles cannot be changed. Make a copy as a new role.");
      await c.query(`update roles set name = $2, description = $3 where id = $1`, [id, b.name, b.description ?? null]);
      await writePermissions(c, id, b.scope, b.permissions);
      return (await listRoles(c)).find((x) => x.id === id);
    });
  });

  app.delete("/v1/roles/:id", { preHandler: guards.inCompany("administration.delete") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query<{ is_system: boolean }>(`select is_system from roles where id = $1 and org_id = ${ORG}`, [id]);
      if (!r.rows[0]) throw new AppError(404, "not_found", "Role not found.");
      if (r.rows[0].is_system) throw new AppError(409, "system_role", "The standard roles cannot be deleted.");
      const used = await c.query(`select 1 from company_members where role_id = $1 union all select 1 from company_invites where role_id = $1 and status = 'pending'`, [id]);
      if (used.rows[0]) throw new AppError(409, "role_in_use", "Move the people with this role to another role first.");
      await c.query(`delete from role_permissions where role_id = $1`, [id]);
      await c.query(`delete from roles where id = $1`, [id]);
    });
    return reply.code(204).send();
  });

  app.get("/v1/permission-modules", { preHandler: guards.inCompany() }, async () => MODULE_KEYS);
}
