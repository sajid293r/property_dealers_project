import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

const ACCOUNT_SELECT = `
  select a.id, a.code, a.name, a.account_class as "class", a.category, a.parent_id as "parentId", a.is_group as "isGroup",
         a.is_system as "isSystem", a.requires_party as "requiresParty", a.active,
         ba.id as "bankAccountId", ba.bank_name as "bankName", ba.account_no as "bankAccountNo"
    from gl_accounts a left join bank_accounts ba on ba.gl_account_id = a.id`;

interface TbRow {
  account_id: string; code: string; name: string; account_class: string; category: string; parent_id: string | null;
  opening: string; debit: string; credit: string; closing: string;
}
interface AccountRow { id: string; code: string; name: string; account_class: string; is_group: boolean }

const n = (v: string | number) => Number(v);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Roll the posting accounts' figures up into their headings by code prefix ("03.01" covers "03.01.01.0001"). */
function rollUp(leaves: TbRow[], groups: AccountRow[]) {
  const nodes = new Map<string, { id: string; code: string; name: string; class: string; isGroup: boolean; opening: number; debit: number; credit: number; closing: number }>();
  for (const g of groups) nodes.set(g.code, { id: g.id, code: g.code, name: g.name, class: g.account_class, isGroup: true, opening: 0, debit: 0, credit: 0, closing: 0 });
  for (const l of leaves) {
    const leaf = { id: l.account_id, code: l.code, name: l.name, class: l.account_class, isGroup: false, opening: n(l.opening), debit: n(l.debit), credit: n(l.credit), closing: n(l.closing) };
    nodes.set(l.code, leaf);
    const parts = l.code.split(".");
    for (let i = parts.length - 1; i >= 1; i--) {
      const g = nodes.get(parts.slice(0, i).join("."));
      if (g) { g.opening += leaf.opening; g.debit += leaf.debit; g.credit += leaf.credit; g.closing += leaf.closing; }
    }
  }
  return [...nodes.values()].sort((a, b) => a.code.localeCompare(b.code)).map((x) => ({ ...x, opening: round2(x.opening), debit: round2(x.debit), credit: round2(x.credit), closing: round2(x.closing) }));
}

export function accountingRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  // ── the chart of accounts ──────────────────────────────────────────────────────────────────────────────
  app.get("/v1/accounts", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const q = parse(z.object({ postable: z.enum(["1", "0"]).optional(), cls: z.enum(["asset", "liability", "equity", "income", "expense"]).optional(), category: z.string().max(40).optional() }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `${ACCOUNT_SELECT} where ($1::text is null or (a.is_group = false) = ($1 = '1')) and ($2::text is null or a.account_class = $2) and ($3::text is null or a.category = $3)
          order by a.code`,
        [q.postable ?? null, q.cls ?? null, q.category ?? null],
      );
      return r.rows;
    });
  });

  // Add a heading (under a class or a group) or an account (under a third-level group). The code is numbered for you.
  app.post("/v1/accounts", { preHandler: guards.inCompany("accounts.create") }, async (req, reply) => {
    const body = parse(z.object({ parentId: uuid, name: z.string().trim().min(2).max(120), isGroup: z.boolean().default(false), requiresParty: z.boolean().default(false) }), req.body);
    const ctx = ctxOf(req);
    const created = await db.inTenant(ctx, async (c) => {
      const p = await c.query(`select id, code, account_class, category, is_group from gl_accounts where id = $1`, [body.parentId]);
      const parent = p.rows[0];
      if (!parent) throw new AppError(404, "not_found", "Parent account not found.");
      if (!parent.is_group) throw new AppError(400, "parent_not_a_group", "An account can only be added under a heading.");
      const depth = String(parent.code).split(".").length;
      if (body.isGroup && depth > 2) throw new AppError(400, "too_deep", "Headings go down three levels at most; add an account instead.");
      if (!body.isGroup && depth !== 3) throw new AppError(400, "wrong_level", "Accounts are added under a third-level heading (like 03.01.01 Cash & Bank).");
      const width = body.isGroup ? 2 : 4;
      const next = await c.query<{ n: number }>(
        `select coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 as n from gl_accounts where company_id = $1 and parent_id = $2`,
        [ctx.companyId, body.parentId],
      );
      const code = `${parent.code}.${String(next.rows[0]!.n).padStart(width, "0")}`;
      const r = await c.query<{ id: string }>(
        `insert into gl_accounts (company_id, code, name, account_class, category, parent_id, is_group, requires_party)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [ctx.companyId, code, body.name, parent.account_class, parent.category, parent.id, body.isGroup, body.requiresParty],
      );
      return (await c.query(`${ACCOUNT_SELECT} where a.id = $1`, [r.rows[0]!.id])).rows[0];
    });
    return reply.code(201).send(created);
  });

  app.patch("/v1/accounts/:id", { preHandler: guards.inCompany("accounts.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), active: z.boolean().optional() }), req.body);
    return db.inTenant(ctxOf(req), async (c) => {
      const a = (await c.query(`select is_system from gl_accounts where id = $1`, [id])).rows[0];
      if (!a) throw new AppError(404, "not_found", "Account not found.");
      if (a.is_system && body.active === false) throw new AppError(409, "system_account", "This account is used by the system and cannot be switched off.");
      await c.query(`update gl_accounts set name = coalesce($2, name), active = coalesce($3, active) where id = $1`, [id, body.name ?? null, body.active ?? null]);
      return (await c.query(`${ACCOUNT_SELECT} where a.id = $1`, [id])).rows[0];
    });
  });

  // ── one account's ledger, with a running balance ───────────────────────────────────────────────────────
  app.get("/v1/accounts/:id/ledger", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const q = parse(z.object({ from: isoDate.default("2000-01-01"), to: isoDate.default("2999-12-31") }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const account = (await c.query(`${ACCOUNT_SELECT} where a.id = $1`, [id])).rows[0];
      if (!account) throw new AppError(404, "not_found", "Account not found.");
      const opening = (await c.query(`select app.account_opening($1, $2::date) as o`, [id, q.from])).rows[0].o;
      const lines = await c.query(
        `select entry_date as "date", entry_no as "number", entry_id as "entryId", source_type as "sourceType", source_id as "sourceId", description, memo,
                party_id as "partyId", party_name as "partyName", debit, credit, running_balance as "balance"
           from app.account_ledger($1, $2::date, $3::date)`,
        [id, q.from, q.to],
      );
      return { account, from: q.from, to: q.to, openingBalance: opening, lines: lines.rows };
    });
  });

  // ── reports ────────────────────────────────────────────────────────────────────────────────────────────
  app.get("/v1/reports/trial-balance", { preHandler: guards.inCompany("reports.view") }, async (req) => {
    const q = parse(z.object({ from: isoDate, to: isoDate }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const leaves = (await c.query<TbRow>(`select * from app.trial_balance($1::date, $2::date)`, [q.from, q.to])).rows;
      const groups = (await c.query<AccountRow>(`select id, code, name, account_class, is_group from gl_accounts where is_group`)).rows;
      const rows = rollUp(leaves, groups);
      const top = rows.filter((r) => !r.isGroup);
      return {
        from: q.from, to: q.to, rows,
        totals: { debit: round2(top.reduce((t, r) => t + r.debit, 0)), credit: round2(top.reduce((t, r) => t + r.credit, 0)), closing: round2(top.reduce((t, r) => t + r.closing, 0)) },
      };
    });
  });

  app.get("/v1/reports/income-statement", { preHandler: guards.inCompany("reports.view") }, async (req) => {
    const q = parse(z.object({ from: isoDate, to: isoDate }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const leaves = (await c.query<TbRow>(`select * from app.trial_balance($1::date, $2::date)`, [q.from, q.to])).rows;
      const groups = (await c.query<AccountRow>(`select id, code, name, account_class, is_group from gl_accounts where is_group`)).rows;
      const rows = rollUp(leaves, groups);
      const section = (cls: "income" | "expense") =>
        rows.filter((r) => r.class === cls && r.code.split(".").length <= 3 && !(r.code.split(".").length === 1))
          .map((r) => ({ code: r.code, name: r.name, level: r.code.split(".").length, isGroup: r.isGroup, amount: round2(cls === "income" ? r.credit - r.debit : r.debit - r.credit) }))
          .filter((r) => r.amount !== 0 || r.level === 2);
      const income = rows.find((r) => r.code === "04");
      const expense = rows.find((r) => r.code === "05");
      const totalIncome = income ? round2(income.credit - income.debit) : 0;
      const totalExpense = expense ? round2(expense.debit - expense.credit) : 0;
      return { from: q.from, to: q.to, income: section("income"), expenses: section("expense"), totalIncome, totalExpense, netProfit: round2(totalIncome - totalExpense) };
    });
  });

  app.get("/v1/reports/balance-sheet", { preHandler: guards.inCompany("reports.view") }, async (req) => {
    const q = parse(z.object({ asOf: isoDate }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const leaves = (await c.query<TbRow>(`select * from app.trial_balance('1900-01-01'::date, $1::date)`, [q.asOf])).rows;
      const groups = (await c.query<AccountRow>(`select id, code, name, account_class, is_group from gl_accounts where is_group`)).rows;
      const rows = rollUp(leaves, groups);
      const side = (cls: string, sign: 1 | -1) =>
        rows.filter((r) => r.class === cls && r.code.split(".").length >= 2 && r.code.split(".").length <= 3)
          .map((r) => ({ code: r.code, name: r.name, level: r.code.split(".").length, amount: round2(sign * r.closing) }))
          .filter((r) => r.amount !== 0);
      const total = (code: string, sign: 1 | -1) => round2(sign * (rows.find((r) => r.code === code)?.closing ?? 0));
      const profit = round2(-(total("04", 1) + total("05", 1)));         // income (credit, negative) + expenses (debit): profit to date
      const assets = total("03", 1), liabilities = total("02", -1), equity = total("01", -1);
      return {
        asOf: q.asOf, assets: side("asset", 1), liabilities: side("liability", -1), equity: side("equity", -1),
        profitToDate: profit, totalAssets: assets, totalLiabilities: liabilities, totalEquity: round2(equity + profit),
        balanced: Math.abs(assets - (liabilities + equity + profit)) < 0.005,
      };
    });
  });
}
