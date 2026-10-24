import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";
import { VOUCHER_TIER, requirePlan } from "../plans.js";

export const VOUCHER_TYPES = ["CPV", "CRV", "BPV", "BRV", "JV", "CV", "SV", "PIV", "CN", "DN"] as const;
type VoucherType = (typeof VOUCHER_TYPES)[number];
const STATUSES = ["draft", "pending", "approved", "rejected", "void"] as const;
const INSTRUMENTS = ["cheque", "online_transfer", "pay_order", "demand_draft", "cash_deposit", "other"] as const;

const line = z.object({
  accountId: uuid,
  debit: money.default("0"),
  credit: money.default("0"),
  partyId: uuid.nullish(),
  projectId: uuid.nullish(),
  costCenterId: uuid.nullish(),
  remarks: z.string().trim().max(300).nullish(),
});

const header = {
  date: isoDate,
  description: z.string().trim().max(500).nullish(),
  partyId: uuid.nullish(),
  controlAccountId: uuid.nullish(),
  bankAccountId: uuid.nullish(),
  instrumentType: z.enum(INSTRUMENTS).nullish(),
  instrumentNo: z.string().trim().max(60).nullish(),
  instrumentBank: z.string().trim().max(120).nullish(),
  chequeDate: isoDate.nullish(),
  reference: z.string().trim().max(120).nullish(),
  invoiceNo: z.string().trim().max(60).nullish(),
  dueDate: isoDate.nullish(),
  lines: z.array(line).min(1).max(200),
};
const createBody = z.object({ type: z.enum(VOUCHER_TYPES), ...header });
const updateBody = z.object(header);

const LIST_SELECT = `
  select v.id, v.voucher_type as "type", v.number, v.voucher_date as "date", v.status, v.description, v.party_id as "partyId", v.party_name as "partyName",
         v.bank_name as "bankName", v.bank_account_no as "bankAccountNo", v.total_amount as "total", v.line_count as "lineCount",
         v.instrument_type as "instrumentType", v.instrument_no as "instrumentNo", v.instrument_bank as "instrumentBank", v.cheque_date as "chequeDate",
         v.reference, v.invoice_no as "invoiceNo", v.due_date as "dueDate", v.created_at as "createdAt", v.created_by as "createdById",
         u.full_name as "createdBy", v.journal_entry_id as "journalEntryId"
    from v_vouchers v left join users u on u.id = v.created_by`;

/** Which account sits on the other side of the lines. Filled in for the person where it is obvious. */
async function controlAccount(c: Queryable, type: VoucherType, b: { controlAccountId?: string | null; bankAccountId?: string | null }): Promise<string | null> {
  if (type === "JV") return null;
  if (type === "BPV" || type === "BRV") {
    if (!b.bankAccountId) throw new AppError(400, "bank_account_required", "Choose the bank account.");
    const r = await c.query(`select gl_account_id from bank_accounts where id = $1 and active`, [b.bankAccountId]);
    if (!r.rows[0]) throw new AppError(404, "not_found", "That bank account was not found.");
    return r.rows[0].gl_account_id as string;
  }
  if (b.controlAccountId) return b.controlAccountId;
  if (type === "CV") throw new AppError(400, "from_account_required", "Choose the account the money moves from.");
  const code = type === "CPV" || type === "CRV" ? "03.01.01.0001" : type === "SV" || type === "CN" ? "03.01.02.0001" : "02.01.01.0001";
  const r = await c.query(`select id from gl_accounts where code = $1`, [code]);
  if (!r.rows[0]) throw new AppError(409, "chart_missing", "The standard account for this voucher is missing from your chart of accounts.");
  return r.rows[0].id as string;
}

async function loadVoucher(c: Queryable, id: string) {
  const h = (await c.query(`${LIST_SELECT} where v.id = $1`, [id])).rows[0];
  if (!h) throw new AppError(404, "not_found", "Voucher not found.");
  const extra = (
    await c.query(
      `select v.control_account_id as "controlAccountId", ca.code as "controlAccountCode", ca.name as "controlAccountName", v.bank_account_id as "bankAccountId",
              v.approved_by as "approvedById", ap.full_name as "approvedBy", v.approved_at as "approvedAt", v.approval_note as "approvalNote", v.statement_line_id as "statementLineId"
         from vouchers v left join gl_accounts ca on ca.id = v.control_account_id left join users ap on ap.id = v.approved_by where v.id = $1`,
      [id],
    )
  ).rows[0];
  const lines = (
    await c.query(
      `select l.id, l.line_no as "lineNo", l.account_id as "accountId", a.code as "accountCode", a.name as "accountName", l.debit, l.credit,
              l.party_id as "partyId", p.display_name as "partyName", l.project_id as "projectId", l.cost_center_id as "costCenterId", l.remarks
         from voucher_lines l join gl_accounts a on a.id = l.account_id left join parties p on p.id = l.party_id
        where l.voucher_id = $1 order by l.line_no`,
      [id],
    )
  ).rows;
  const journal = h.journalEntryId
    ? (
        await c.query(
          `select l.line_no as "lineNo", a.code as "accountCode", a.name as "accountName", l.debit, l.credit, p.display_name as "partyName", l.memo
             from journal_lines l join gl_accounts a on a.id = l.account_id left join parties p on p.id = l.party_id where l.entry_id = $1 order by l.line_no`,
          [h.journalEntryId],
        )
      ).rows
    : [];
  const next = (await c.query(`select to_state as "to", required_permission as "requiredPermission", description from app.allowed_transitions('voucher', $1)`, [h.status])).rows;
  return { ...h, ...extra, lines, journal, nextSteps: next };
}

async function insertLines(c: Queryable, companyId: string, voucherId: string, lines: z.infer<typeof line>[]) {
  let i = 0;
  for (const l of lines) {
    i += 1;
    await c.query(
      `insert into voucher_lines (company_id, voucher_id, line_no, account_id, debit, credit, party_id, project_id, cost_center_id, remarks)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [companyId, voucherId, i, l.accountId, l.debit, l.credit, l.partyId ?? null, l.projectId ?? null, l.costCenterId ?? null, l.remarks ?? null],
    );
  }
}

export function voucherRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/vouchers", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const q = parse(
      paging.extend({
        type: z.enum(VOUCHER_TYPES).optional(), status: z.enum(STATUSES).optional(), from: isoDate.optional(), to: isoDate.optional(),
        search: z.string().trim().min(1).max(80).optional(), partyId: uuid.optional(),
      }),
      req.query,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `${LIST_SELECT}
          where ($1::text is null or v.voucher_type = $1) and ($2::text is null or v.status = $2)
            and ($3::date is null or v.voucher_date >= $3) and ($4::date is null or v.voucher_date <= $4)
            and ($5::text is null or v.number ilike '%' || $5 || '%' or v.description ilike '%' || $5 || '%' or v.party_name ilike '%' || $5 || '%' or v.instrument_no ilike '%' || $5 || '%')
            and ($6::uuid is null or v.party_id = $6)
          order by v.voucher_date desc, v.number desc limit $7 offset $8`,
        [q.type ?? null, q.status ?? null, q.from ?? null, q.to ?? null, q.search ?? null, q.partyId ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.get("/v1/vouchers/:id", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => loadVoucher(c, id));
  });

  // Create a draft. The number (CPV-00001 ...) is given by the database.
  app.post("/v1/vouchers", { preHandler: guards.inCompany("accounts.create") }, async (req, reply) => {
    const b = parse(createBody, req.body);
    const ctx = ctxOf(req);
    const needed = VOUCHER_TIER[b.type];
    if (needed) requirePlan(ctx.plan, needed, `The ${b.type} voucher`);
    const voucher = await db.inTenant(ctx, async (c) => {
      const control = await controlAccount(c, b.type, b);
      const number = (await c.query<{ n: string }>(`select app.next_doc_no($1, $2) as n`, [ctx.companyId, b.type])).rows[0]!.n;
      const r = await c.query<{ id: string }>(
        `insert into vouchers (company_id, voucher_type, number, voucher_date, description, party_id, control_account_id, bank_account_id,
                               instrument_type, instrument_no, instrument_bank, cheque_date, reference, invoice_no, due_date, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
        [ctx.companyId, b.type, number, b.date, b.description ?? null, b.partyId ?? null, control, b.bankAccountId ?? null,
         b.instrumentType ?? null, b.instrumentNo ?? null, b.instrumentBank ?? null, b.chequeDate ?? null, b.reference ?? null, b.invoiceNo ?? null, b.dueDate ?? null, ctx.userId],
      );
      await insertLines(c, ctx.companyId, r.rows[0]!.id, b.lines);
      return loadVoucher(c, r.rows[0]!.id);
    });
    return reply.code(201).send(voucher);
  });

  // Edit a draft or a rejected voucher (the database refuses once it has been submitted).
  app.put("/v1/vouchers/:id", { preHandler: guards.inCompany("accounts.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(updateBody, req.body);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      const cur = (await c.query(`select voucher_type as "type" from vouchers where id = $1`, [id])).rows[0];
      if (!cur) throw new AppError(404, "not_found", "Voucher not found.");
      const control = await controlAccount(c, cur.type as VoucherType, b);
      await c.query(
        `update vouchers set voucher_date = $2, description = $3, party_id = $4, control_account_id = $5, bank_account_id = $6, instrument_type = $7, instrument_no = $8,
                instrument_bank = $9, cheque_date = $10, reference = $11, invoice_no = $12, due_date = $13 where id = $1`,
        [id, b.date, b.description ?? null, b.partyId ?? null, control, b.bankAccountId ?? null, b.instrumentType ?? null, b.instrumentNo ?? null, b.instrumentBank ?? null,
         b.chequeDate ?? null, b.reference ?? null, b.invoiceNo ?? null, b.dueDate ?? null],
      );
      await c.query(`delete from voucher_lines where voucher_id = $1`, [id]);
      await insertLines(c, ctx.companyId, id, b.lines);
      return loadVoucher(c, id);
    });
  });

  // Submit for approval: the database checks the voucher is complete and correct, and says exactly what is wrong if not.
  app.post("/v1/vouchers/:id/submit", { preHandler: guards.inCompany("accounts.create") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) => {
      await c.query(`update vouchers set status = 'pending' where id = $1`, [id]);
      return loadVoucher(c, id);
    });
  });

  app.post("/v1/vouchers/:id/recall", { preHandler: guards.inCompany("accounts.create") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) => {
      await c.query(`update vouchers set status = 'draft' where id = $1`, [id]);
      return loadVoucher(c, id);
    });
  });

  // Approving posts the voucher to the ledger in one step.
  app.post("/v1/vouchers/:id/approve", { preHandler: guards.inCompany("accounts.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ note: z.string().trim().max(300).optional() }), req.body ?? {});
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      // budgets: a "block" budget refuses spending that would go over it; a "warn" budget lets it through and says so
      const spend = await c.query<{ account_id: string; debit: string; project_id: string | null; voucher_date: string }>(
        `select l.account_id, l.debit, l.project_id, v.voucher_date::text as voucher_date from voucher_lines l join vouchers v on v.id = l.voucher_id where l.voucher_id = $1 and l.debit > 0`, [id]);
      const warnings: { accountId: string; overBy: string }[] = [];
      for (const s of spend.rows) {
        const chk = await c.query<{ decision: string; over_by: string }>(`select decision, over_by from app.check_budget($1, $2, null, $3::date, $4)`, [s.account_id, s.project_id, s.voucher_date, s.debit]);
        const d = chk.rows[0];
        if (d?.decision === "block") throw new AppError(422, "over_budget", `This would take spending ${Number(d.over_by).toLocaleString("en-PK")} over its approved budget. Revise the budget or reduce the amount.`, { overBy: d.over_by });
        if (d?.decision === "warn") warnings.push({ accountId: s.account_id, overBy: d.over_by });
      }
      await c.query(`select app.approve_voucher($1, $2, $3)`, [id, ctx.userId, b.note ?? null]);
      return { ...(await loadVoucher(c, id)), budgetWarnings: warnings };
    });
  });

  app.post("/v1/vouchers/:id/reject", { preHandler: guards.inCompany("accounts.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
    return db.inTenant(ctxOf(req), async (c) => {
      await c.query(`update vouchers set status = 'rejected', approval_note = $2 where id = $1`, [id, b.reason]);
      return loadVoucher(c, id);
    });
  });

  // An approved voucher is never deleted: voiding posts a reversing entry.
  app.post("/v1/vouchers/:id/void", { preHandler: guards.inCompany("accounts.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(300), date: isoDate.optional() }), req.body);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await c.query(`select app.void_voucher($1, $2, $3, coalesce($4::date, current_date))`, [id, ctx.userId, b.reason, b.date ?? null]);
      return loadVoucher(c, id);
    });
  });

  // Throw away a draft or rejected voucher.
  app.delete("/v1/vouchers/:id", { preHandler: guards.inCompany("accounts.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await db.inTenant(ctxOf(req), async (c) => {
      await c.query(`update vouchers set status = 'void' where id = $1`, [id]);
    });
    return reply.code(204).send();
  });
}
