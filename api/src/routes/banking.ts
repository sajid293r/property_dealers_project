import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, parse, signedMoney, uuid } from "../http.js";
import { AppError } from "../errors.js";

const BANK_ACCOUNT_SELECT = `
  select ba.id, ba.bank_id as "bankId", ba.bank_name as "bankName", b.short_name as "bankShortName", ba.branch_name as "branchName", ba.branch_code as "branchCode",
         ba.account_title as "accountTitle", ba.account_no as "accountNo", ba.iban, ba.currency, ba.active, ba.gl_account_id as "glAccountId", a.code as "glCode",
         coalesce(t.balance, 0) as "bookBalance", coalesce(t.uncleared, 0)::int as "unclearedCount",
         (select max(r.as_of) from bank_reconciliations r where r.bank_account_id = ba.id and r.status = 'finalized') as "lastReconciledOn",
         (select r.id from bank_reconciliations r where r.bank_account_id = ba.id and r.status = 'draft') as "openReconciliationId"
    from bank_accounts ba
    join gl_accounts a on a.id = ba.gl_account_id
    left join banks b on b.id = ba.bank_id
    left join lateral (select sum(amount) as balance, count(*) filter (where not cleared) as uncleared from v_bank_ledger where bank_account_id = ba.id) t on true`;

async function bankAccount(c: Queryable, id: string) {
  const r = (await c.query(`${BANK_ACCOUNT_SELECT} where ba.id = $1`, [id])).rows[0];
  if (!r) throw new AppError(404, "not_found", "Bank account not found.");
  return r;
}

const LEDGER_SELECT = `
  select journal_line_id as "journalLineId", entry_id as "entryId", entry_date as "date", entry_no as "number", description, party_name as "partyName",
         debit, credit, amount, cleared, cleared_on as "clearedOn", statement_line_id as "statementLineId", reconciliation_id as "reconciliationId",
         was_reversed as "wasReversed", is_reversal as "isReversal"
    from v_bank_ledger`;

const STATEMENT_LINE_SELECT = `
  select id, statement_id as "statementId", line_no as "lineNo", txn_date as "date", description, reference, deposit, withdrawal, balance, amount,
         matched_amount as "matchedAmount", match_status as "matchStatus"
    from v_bank_statement_lines`;

async function reconciliation(c: Queryable, id: string) {
  const r = (
    await c.query(
      `select r.id, r.bank_account_id as "bankAccountId", r.statement_id as "statementId", r.as_of as "asOf", r.statement_balance as "statementBalance", r.status,
              r.difference, r.finalized_at as "finalizedAt", fu.full_name as "finalizedBy", r.created_at as "createdAt"
         from bank_reconciliations r left join users fu on fu.id = r.finalized_by where r.id = $1`,
      [id],
    )
  ).rows[0];
  if (!r) throw new AppError(404, "not_found", "Reconciliation not found.");
  const rep = (await c.query(`select * from app.reconciliation_report($1, $2::date, $3)`, [r.bankAccountId, r.asOf, r.statementBalance])).rows[0];
  const items = (
    await c.query(`${LEDGER_SELECT} where bank_account_id = $1 and entry_date <= $2::date order by entry_date, entry_no`, [r.bankAccountId, r.asOf])
  ).rows;
  const outstanding = items.filter((i: { cleared: boolean; clearedOn: string }) => !(i.cleared && i.clearedOn <= r.asOf));
  return {
    ...r,
    report: {
      statementBalance: rep.statement_balance, depositsInTransit: rep.deposits_in_transit, outstandingPayments: rep.outstanding_payments,
      adjustedBankBalance: rep.adjusted_bank_balance, bookBalance: rep.book_balance, clearedBalance: rep.cleared_balance, difference: rep.difference,
    },
    items,
    outstandingDeposits: outstanding.filter((i: { amount: string }) => Number(i.amount) > 0),
    outstandingChequesAndPayments: outstanding.filter((i: { amount: string }) => Number(i.amount) < 0),
    canFinish: Number(rep.difference) === 0 && r.status === "draft",
  };
}

export function bankingRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  // ── the catalog of Pakistani banks, and the company's own bank accounts ────────────────────────────────
  app.get("/v1/banks", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => (await c.query(`select id, name, short_name as "shortName", kind from banks where active order by sort_order, name`)).rows);
  });

  app.get("/v1/bank-accounts", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => (await c.query(`${BANK_ACCOUNT_SELECT} order by ba.bank_name, ba.account_no`)).rows);
  });

  app.post("/v1/bank-accounts", { preHandler: guards.inCompany("accounts.create") }, async (req, reply) => {
    const b = parse(
      z.object({
        bankId: uuid.optional(), bankName: z.string().trim().max(120).optional(), branchName: z.string().trim().max(120).optional(), branchCode: z.string().trim().max(20).optional(),
        accountTitle: z.string().trim().min(2).max(160), accountNo: z.string().trim().min(3).max(40), iban: z.string().trim().max(34).optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    const created = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(`select app.create_bank_account($1,$2,$3,$4,$5,$6,$7,$8,$9) as id`,
        [ctx.companyId, b.bankId ?? null, b.bankName ?? null, b.branchName ?? null, b.branchCode ?? null, b.accountTitle, b.accountNo, b.iban ?? null, ctx.userId]);
      return bankAccount(c, r.rows[0]!.id);
    });
    return reply.code(201).send(created);
  });

  app.patch("/v1/bank-accounts/:id", { preHandler: guards.inCompany("accounts.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ active: z.boolean().optional(), accountTitle: z.string().trim().min(2).max(160).optional(), branchName: z.string().trim().max(120).optional() }), req.body);
    return db.inTenant(ctxOf(req), async (c) => {
      await bankAccount(c, id);
      await c.query(`update bank_accounts set active = coalesce($2, active), account_title = coalesce($3, account_title), branch_name = coalesce($4, branch_name) where id = $1`,
        [id, b.active ?? null, b.accountTitle ?? null, b.branchName ?? null]);
      return bankAccount(c, id);
    });
  });

  // The bank's side of the ledger, entry by entry, with what has cleared.
  app.get("/v1/bank-accounts/:id/ledger", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const q = parse(z.object({ uncleared: z.enum(["1", "0"]).optional(), to: isoDate.optional() }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      await bankAccount(c, id);
      return (
        await c.query(`${LEDGER_SELECT} where bank_account_id = $1 and ($2::boolean is not true or not cleared) and ($3::date is null or entry_date <= $3) order by entry_date, entry_no`,
          [id, q.uncleared === "1", q.to ?? null])
      ).rows;
    });
  });

  // ── statements ─────────────────────────────────────────────────────────────────────────────────────────
  app.get("/v1/bank-accounts/:id/statements", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) => {
      await bankAccount(c, id);
      return (
        await c.query(
          `select s.id, s.label, s.period_from as "periodFrom", s.period_to as "periodTo", s.opening_balance as "openingBalance", s.closing_balance as "closingBalance", s.source,
                  s.created_at as "createdAt", count(l.id)::int as "lineCount", count(l.id) filter (where l.match_status = 'matched')::int as "matchedCount"
             from bank_statements s left join v_bank_statement_lines l on l.statement_id = s.id where s.bank_account_id = $1
            group by s.id order by s.period_to desc, s.created_at desc`,
          [id],
        )
      ).rows;
    });
  });

  app.post("/v1/bank-accounts/:id/statements", { preHandler: guards.inCompany("accounts.create") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(
      z.object({
        label: z.string().trim().max(80).optional(), periodFrom: isoDate, periodTo: isoDate, openingBalance: signedMoney, closingBalance: signedMoney,
        source: z.enum(["manual", "csv", "pdf"]).default("manual"),
        lines: z.array(z.object({
          date: isoDate, description: z.string().trim().max(300).optional(), reference: z.string().trim().max(80).optional(),
          deposit: money.default("0"), withdrawal: money.default("0"), balance: signedMoney.optional(),
        })).min(1).max(2000),
      }),
      req.body,
    );
    if (b.periodTo < b.periodFrom) throw new AppError(400, "invalid_dates", "The statement's end date cannot be before its start date.");
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      await bankAccount(c, id);
      const s = await c.query<{ id: string }>(
        `insert into bank_statements (company_id, bank_account_id, label, period_from, period_to, opening_balance, closing_balance, source, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [ctx.companyId, id, b.label ?? null, b.periodFrom, b.periodTo, b.openingBalance, b.closingBalance, b.source, ctx.userId],
      );
      let n = 0;
      for (const l of [...b.lines].sort((x, y) => x.date.localeCompare(y.date))) {
        n += 1;
        await c.query(
          `insert into bank_statement_lines (company_id, statement_id, line_no, txn_date, description, reference, deposit, withdrawal, balance)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [ctx.companyId, s.rows[0]!.id, n, l.date, l.description ?? null, l.reference ?? null, l.deposit, l.withdrawal, l.balance ?? null],
        );
      }
      const lines = (await c.query<{ n: string }>(
        `select (s.opening_balance + coalesce(sum(l.deposit - l.withdrawal), 0))::text as n from bank_statements s left join bank_statement_lines l on l.statement_id = s.id where s.id = $1 group by s.id`,
        [s.rows[0]!.id],
      )).rows[0]!.n;
      return { id: s.rows[0]!.id, linesAddUp: Number(lines) === Number(b.closingBalance), computedClosing: lines };
    });
    return reply.code(201).send(out);
  });

  app.get("/v1/bank-statements/:id", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) => {
      const s = (
        await c.query(
          `select id, bank_account_id as "bankAccountId", label, period_from as "periodFrom", period_to as "periodTo", opening_balance as "openingBalance", closing_balance as "closingBalance", source
             from bank_statements where id = $1`,
          [id],
        )
      ).rows[0];
      if (!s) throw new AppError(404, "not_found", "Statement not found.");
      const lines = (await c.query(`${STATEMENT_LINE_SELECT} where statement_id = $1 order by line_no`, [id])).rows;
      const sum = lines.reduce((t: number, l: { amount: string }) => t + Number(l.amount), 0);
      return { ...s, lines, linesAddUp: Math.abs(Number(s.openingBalance) + sum - Number(s.closingBalance)) < 0.005 };
    });
  });

  app.delete("/v1/bank-statements/:id", { preHandler: guards.inCompany("accounts.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await db.inTenant(ctxOf(req), async (c) => {
      const used = (await c.query(`select 1 from bank_clearings cl join bank_statement_lines l on l.id = cl.statement_line_id where l.statement_id = $1 limit 1`, [id])).rows[0];
      if (used) throw new AppError(409, "statement_in_use", "Some of this statement's lines are matched. Un-match them first.");
      const rec = (await c.query(`select 1 from bank_reconciliations where statement_id = $1 limit 1`, [id])).rows[0];
      if (rec) throw new AppError(409, "statement_in_use", "A reconciliation uses this statement.");
      await c.query(`delete from vouchers where statement_line_id in (select id from bank_statement_lines where statement_id = $1) and status = 'draft'`, [id]);
      await c.query(`delete from bank_statement_lines where statement_id = $1`, [id]);
      await c.query(`delete from bank_statements where id = $1`, [id]);
    });
    return reply.code(204).send();
  });

  // ── matching ───────────────────────────────────────────────────────────────────────────────────────────
  app.get("/v1/bank-statements/:id/suggestions", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) =>
      (await c.query(`select statement_line_id as "statementLineId", journal_line_id as "journalLineId", score, reason from app.suggest_matches($1)`, [id])).rows,
    );
  });

  app.post("/v1/bank-statement-lines/:id/match", { preHandler: guards.inCompany("accounts.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ journalLineIds: z.array(uuid).min(1).max(50) }), req.body);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await c.query(`select app.match_statement_line($1, $2::uuid[], $3)`, [id, b.journalLineIds, ctx.userId]);
      return (await c.query(`${STATEMENT_LINE_SELECT} where id = $1`, [id])).rows[0];
    });
  });

  app.delete("/v1/bank-statement-lines/:id/match", { preHandler: guards.inCompany("accounts.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await db.inTenant(ctxOf(req), async (c) => {
      await c.query(`select app.unmatch_statement_line($1)`, [id]);
    });
    return reply.code(204).send();
  });

  // A bank charge, profit or transfer the books do not know about: draft its voucher straight from the statement line.
  app.post("/v1/bank-statement-lines/:id/draft-voucher", { preHandler: guards.inCompany("accounts.create") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ accountId: uuid }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(`select app.draft_voucher_from_statement_line($1, $2, $3) as id`, [id, b.accountId, ctx.userId]);
      const v = (await c.query(`select id, voucher_type as "type", number, status from vouchers where id = $1`, [r.rows[0]!.id])).rows[0];
      return v;
    });
    return reply.code(201).send(out);
  });

  // Mark a ledger entry as cleared by hand (the bank paid it), or take that back.
  app.post("/v1/ledger-lines/:id/clear", { preHandler: guards.inCompany("accounts.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ clearedOn: isoDate }), req.body);
    const ctx = ctxOf(req);
    await db.inTenant(ctx, async (c) => {
      await c.query(`select app.clear_ledger_line($1, $2::date, $3)`, [id, b.clearedOn, ctx.userId]);
    });
    return reply.code(204).send();
  });

  app.delete("/v1/ledger-lines/:id/clear", { preHandler: guards.inCompany("accounts.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await db.inTenant(ctxOf(req), async (c) => {
      await c.query(`select app.unclear_ledger_line($1)`, [id]);
    });
    return reply.code(204).send();
  });

  // ── reconciliations ────────────────────────────────────────────────────────────────────────────────────
  app.get("/v1/bank-accounts/:id/reconciliations", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) => {
      await bankAccount(c, id);
      return (
        await c.query(
          `select r.id, r.as_of as "asOf", r.statement_balance as "statementBalance", r.status, r.difference, r.finalized_at as "finalizedAt", fu.full_name as "finalizedBy", r.statement_id as "statementId"
             from bank_reconciliations r left join users fu on fu.id = r.finalized_by where r.bank_account_id = $1 order by r.as_of desc, r.created_at desc`,
          [id],
        )
      ).rows;
    });
  });

  app.post("/v1/bank-accounts/:id/reconciliations", { preHandler: guards.inCompany("accounts.create") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ statementId: uuid.nullish(), asOf: isoDate, statementBalance: signedMoney }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(`select app.start_reconciliation($1, $2, $3::date, $4, $5) as id`, [id, b.statementId ?? null, b.asOf, b.statementBalance, ctx.userId]);
      return reconciliation(c, r.rows[0]!.id);
    });
    return reply.code(201).send(out);
  });

  app.get("/v1/reconciliations/:id", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => reconciliation(c, id));
  });

  app.patch("/v1/reconciliations/:id", { preHandler: guards.inCompany("accounts.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ asOf: isoDate.optional(), statementBalance: signedMoney.optional() }), req.body);
    return db.inTenant(ctxOf(req), async (c) => {
      const cur = (await c.query(`select status from bank_reconciliations where id = $1`, [id])).rows[0];
      if (!cur) throw new AppError(404, "not_found", "Reconciliation not found.");
      if (cur.status !== "draft") throw new AppError(409, "wrong_state", "A finished reconciliation cannot be changed; re-open it first.");
      await c.query(`update bank_reconciliations set as_of = coalesce($2::date, as_of), statement_balance = coalesce($3, statement_balance) where id = $1`, [id, b.asOf ?? null, b.statementBalance ?? null]);
      return reconciliation(c, id);
    });
  });

  app.post("/v1/reconciliations/:id/finalize", { preHandler: guards.inCompany("accounts.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await c.query(`select app.finalize_reconciliation($1, $2)`, [id, ctx.userId]);
      return reconciliation(c, id);
    });
  });

  app.post("/v1/reconciliations/:id/reopen", { preHandler: guards.inCompany("accounts.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await c.query(`select app.reopen_reconciliation($1, $2)`, [id, ctx.userId]);
      return reconciliation(c, id);
    });
  });

  app.delete("/v1/reconciliations/:id", { preHandler: guards.inCompany("accounts.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(`delete from bank_reconciliations where id = $1 and status = 'draft'`, [id]);
      if (!r.rowCount) throw new AppError(409, "wrong_state", "Only an unfinished reconciliation can be deleted.");
    });
    return reply.code(204).send();
  });
}
