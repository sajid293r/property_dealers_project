import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

const BUDGET_COLUMNS = `b.id, b.budget_no as "budgetNo", b.name, b.kind, b.project_id as "projectId", p.name as "projectName", b.period_start as "periodStart", b.period_end as "periodEnd",
  b.status, b.control_mode as "controlMode", b.version_no as "versionNo", b.total_amount as "totalAmount", b.created_at as "createdAt", b.approved_at as "approvedAt",
  coalesce((select sum(s.committed_amount) from v_budget_line_status s where s.budget_id = b.id), 0) as committed,
  coalesce((select sum(s.actual_amount) from v_budget_line_status s where s.budget_id = b.id), 0) as actual`;
const BUDGET_FROM = `budgets b left join projects p on p.id = b.project_id`;

const lineSchema = z.object({ category: z.string().trim().min(2).max(80), accountId: uuid, amount: money, description: z.string().trim().max(200).optional() });

async function budgetDetail(c: Queryable, id: string) {
  const b = await c.query(`select ${BUDGET_COLUMNS} from ${BUDGET_FROM} where b.id = $1`, [id]);
  if (!b.rows[0]) throw new AppError(404, "not_found", "Budget not found.");
  const lines = await c.query(
    `select l.id, l.line_no as "lineNo", l.category, l.description, l.account_id as "accountId", a.code as "accountCode", a.name as "accountName", l.budget_amount as "budgetAmount",
            s.committed_amount as committed, s.actual_amount as actual, s.available_amount as available, s.utilization_pct as "utilizationPct"
       from budget_lines l join gl_accounts a on a.id = l.account_id join v_budget_line_status s on s.budget_line_id = l.id
      where l.budget_id = $1 order by l.line_no`,
    [id],
  );
  const revisions = await c.query(
    `select r.id, r.revision_no as "revisionNo", r.type, r.reason, r.delta_amount as "deltaAmount", r.status
       from budget_revisions r where r.budget_id = $1 order by r.revision_no desc`,
    [id],
  );
  const revLines = await c.query(
    `select rl.revision_id as "revisionId", rl.budget_line_id as "budgetLineId", l.category, rl.delta_amount as "deltaAmount"
       from budget_revision_lines rl join budget_lines l on l.id = rl.budget_line_id where rl.revision_id in (select id from budget_revisions where budget_id = $1)`,
    [id],
  );
  return {
    ...b.rows[0],
    lines: lines.rows,
    revisions: revisions.rows.map((r) => ({ ...r, lines: revLines.rows.filter((x) => x.revisionId === r.id) })),
  };
}

async function writeLines(c: Queryable, companyId: string, budgetId: string, lines: z.infer<typeof lineSchema>[]) {
  await c.query(`delete from budget_lines where budget_id = $1`, [budgetId]);
  let n = 0;
  for (const l of lines) {
    n++;
    await c.query(
      `insert into budget_lines (company_id, budget_id, line_no, category, description, account_id, budget_amount) values ($1,$2,$3,$4,$5,$6,$7)`,
      [companyId, budgetId, n, l.category, l.description ?? null, l.accountId, l.amount],
    );
  }
}

export function budgetRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/budgets", { preHandler: guards.inCompany("budgets.view") }, async (req) => {
    const q = parse(paging.extend({ status: z.enum(["draft", "submitted", "approved", "locked", "closed"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(200) }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(`select ${BUDGET_COLUMNS} from ${BUDGET_FROM} where ($1::text is null or b.status = $1) order by b.created_at desc limit $2 offset $3`, [q.status ?? null, q.limit, q.offset]);
      return r.rows;
    });
  });

  app.get("/v1/budgets/:id", { preHandler: guards.inCompany("budgets.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => budgetDetail(c, id));
  });

  app.post("/v1/budgets", { preHandler: guards.inCompany("budgets.create") }, async (req, reply) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(3).max(120),
        kind: z.enum(["project", "operating", "capex"]),
        projectId: uuid.optional(),
        periodStart: isoDate.optional(),
        periodEnd: isoDate.optional(),
        controlMode: z.enum(["none", "warn", "block"]).default("warn"),
        lines: z.array(lineSchema).max(200).default([]),
      }),
      req.body,
    );
    if (b.kind === "project" && !b.projectId) throw new AppError(400, "validation", "Choose the project this budget is for.");
    if (b.kind !== "project" && (!b.periodStart || !b.periodEnd)) throw new AppError(400, "validation", "Choose the period (start and end dates) this budget covers.");
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `insert into budgets (company_id, budget_no, name, kind, project_id, period_start, period_end, control_mode, created_by)
         values ($1, app.next_doc_no($1, 'BUD'), $2,$3,$4,$5,$6,$7,$8) returning id`,
        [ctx.companyId, b.name, b.kind, b.projectId ?? null, b.periodStart ?? null, b.periodEnd ?? null, b.controlMode, ctx.userId],
      );
      await writeLines(c, ctx.companyId, r.rows[0]!.id, b.lines);
      return budgetDetail(c, r.rows[0]!.id);
    });
    return reply.code(201).send(out);
  });

  // lines of a draft budget (a submitted or approved one changes only through revisions)
  app.put("/v1/budgets/:id/lines", { preHandler: guards.inCompany("budgets.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ lines: z.array(lineSchema).max(200), controlMode: z.enum(["none", "warn", "block"]).optional() }), req.body);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      const cur = await c.query<{ status: string }>(`select status from budgets where id = $1`, [id]);
      if (!cur.rows[0]) throw new AppError(404, "not_found", "Budget not found.");
      if (cur.rows[0].status !== "draft") throw new AppError(409, "not_draft", "Only a draft budget can be edited. Use a revision to change an approved one.");
      await writeLines(c, ctx.companyId, id, b.lines);
      if (b.controlMode) await c.query(`update budgets set control_mode = $2 where id = $1`, [id, b.controlMode]);
      return budgetDetail(c, id);
    });
  });

  app.patch("/v1/budgets/:id", { preHandler: guards.inCompany("budgets.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ controlMode: z.enum(["none", "warn", "block"]) }), req.body);
    return db.inTenant(ctxOf(req), async (c) => {
      await c.query(`update budgets set control_mode = $2 where id = $1 and status <> 'closed'`, [id, b.controlMode]);
      return budgetDetail(c, id);
    });
  });

  // submit / recall / approve / lock / close — the database checks each step is legal
  app.post("/v1/budgets/:id/:action", { preHandler: guards.inCompany("budgets.view") }, async (req) => {
    const { id, action } = parse(z.object({ id: uuid, action: z.enum(["submit", "recall", "approve", "lock", "unlock", "close"]) }), req.params);
    const ctx = ctxOf(req);
    const need = { submit: "budgets.edit", recall: "budgets.edit", approve: "budgets.approve", lock: "budgets.approve", unlock: "budgets.approve", close: "budgets.approve" }[action];
    if (!ctx.permissions.includes(need)) throw new AppError(403, "not_permitted", `Your role does not allow this (${need}).`);
    return db.inTenant(ctx, async (c) => {
      if (action === "approve") await c.query(`select app.approve_budget($1, $2)`, [id, ctx.userId]);
      else {
        const to = { submit: "submitted", recall: "draft", lock: "locked", unlock: "approved", close: "closed" }[action];
        await c.query(`update budgets set status = $2 where id = $1`, [id, to]);
      }
      return budgetDetail(c, id);
    });
  });

  // changing an approved budget: supplementary (more money), reallocation (move between lines) or reforecast
  app.post("/v1/budgets/:id/revisions", { preHandler: guards.inCompany("budgets.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(
      z.object({
        type: z.enum(["supplementary", "reallocation", "reforecast"]),
        reason: z.string().trim().min(3).max(300),
        lines: z.array(z.object({ budgetLineId: uuid, delta: z.union([z.number(), z.string()]).transform((v) => String(v).trim()).pipe(z.string().regex(/^-?\d+(\.\d{1,2})?$/)) })).min(1).max(50),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const cur = await c.query<{ status: string }>(`select status from budgets where id = $1`, [id]);
      if (!cur.rows[0]) throw new AppError(404, "not_found", "Budget not found.");
      if (!["approved", "locked"].includes(cur.rows[0].status)) throw new AppError(409, "not_approved", "Revisions are for approved budgets. Edit a draft directly.");
      const no = (await c.query<{ n: number }>(`select coalesce(max(revision_no), 0) + 1 as n from budget_revisions where budget_id = $1`, [id])).rows[0]!.n;
      const r = await c.query<{ id: string }>(
        `insert into budget_revisions (company_id, budget_id, revision_no, type, reason, requested_by) values ($1,$2,$3,$4,$5,$6) returning id`,
        [ctx.companyId, id, no, b.type, b.reason, ctx.userId],
      );
      for (const l of b.lines) {
        if (Number(l.delta) === 0) continue;
        await c.query(`insert into budget_revision_lines (company_id, revision_id, budget_line_id, delta_amount) values ($1,$2,$3,$4)`, [ctx.companyId, r.rows[0]!.id, l.budgetLineId, l.delta]);
      }
      return budgetDetail(c, id);
    });
    return reply.code(201).send(out);
  });

  app.post("/v1/budget-revisions/:id/:action", { preHandler: guards.inCompany("budgets.approve") }, async (req) => {
    const { id, action } = parse(z.object({ id: uuid, action: z.enum(["approve", "reject"]) }), req.params);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      const rev = await c.query<{ budget_id: string }>(`select budget_id from budget_revisions where id = $1`, [id]);
      if (!rev.rows[0]) throw new AppError(404, "not_found", "Revision not found.");
      if (action === "approve") await c.query(`select app.approve_budget_revision($1, $2)`, [id, ctx.userId]);
      else await c.query(`update budget_revisions set status = 'rejected' where id = $1 and status = 'pending'`, [id]);
      return budgetDetail(c, rev.rows[0].budget_id);
    });
  });

  // Would this spend fit the budgets? The voucher screens call it before approving; "block" budgets refuse, "warn" ones warn.
  app.post("/v1/budget-check", { preHandler: guards.inCompany("budgets.view") }, async (req) => {
    const b = parse(z.object({ accountId: uuid, projectId: uuid.optional(), date: isoDate.optional(), amount: money }), req.body);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(`select decision, available, over_by as "overBy", control_mode as "controlMode" from app.check_budget($1, $2, null, coalesce($3::date, current_date), $4)`, [b.accountId, b.projectId ?? null, b.date ?? null, b.amount]);
      return r.rows[0] ?? { decision: "allow", available: null, overBy: "0", controlMode: null };
    });
  });
}
