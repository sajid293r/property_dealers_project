import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { isoDate, parse } from "../http.js";

/**
 * Expenses are not a separate record: they are the postings on expense accounts, whichever voucher made them
 * (cash payment, bank payment, purchase invoice, journal). This lists them straight from the ledger, so the
 * figures here can never disagree with the trial balance or the profit-and-loss report.
 */
export function expenseRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/expenses", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const q = parse(
      z.object({ from: isoDate.default("2000-01-01"), to: isoDate.default("2999-12-31"), search: z.string().trim().max(80).optional(), accountId: z.guid().optional() }),
      req.query,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      const where = `a.account_class = 'expense' and not a.is_group and e.entry_date between $1 and $2
        and ($3::text is null or a.name ilike '%' || $3 || '%' or e.entry_no ilike '%' || $3 || '%' or coalesce(p.display_name, '') ilike '%' || $3 || '%' or coalesce(l.memo, e.description, '') ilike '%' || $3 || '%')
        and ($4::uuid is null or a.id = $4)`;
      const base = `from journal_lines l join journal_entries e on e.id = l.entry_id join gl_accounts a on a.id = l.account_id left join parties p on p.id = l.party_id where ${where}`;
      const args = [q.from, q.to, q.search ?? null, q.accountId ?? null];
      const rows = await c.query(
        `select l.id, e.entry_date as "date", e.entry_no as "number", e.source_type as "sourceType", e.source_id as "sourceId",
                a.id as "accountId", a.code as "accountCode", a.name as "accountName", l.party_id as "partyId", p.display_name as "partyName",
                coalesce(nullif(l.memo, ''), e.description) as description, (l.debit - l.credit) as amount
           ${base} order by e.entry_date desc, e.entry_no desc, l.line_no limit 500`,
        args,
      );
      const by = await c.query(
        `select a.id as "accountId", a.code as "accountCode", a.name as "accountName", sum(l.debit - l.credit) as amount ${base} group by a.id, a.code, a.name order by sum(l.debit - l.credit) desc`,
        args,
      );
      const total = by.rows.reduce((s, r) => s + Number(r.amount), 0);
      return { rows: rows.rows, byAccount: by.rows, total: total.toFixed(2) };
    });
  });
}
