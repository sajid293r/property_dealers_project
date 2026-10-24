import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

const CHEQUE_COLUMNS = `c.id, c.direction, c.cheque_no as "chequeNo", c.bank_name as "bankName", c.party_id as "partyId", p.display_name as "partyName",
  c.booking_id as "bookingId", b.booking_no as "bookingNo", c.amount, c.cheque_date as "chequeDate", c.received_on as "receivedOn", c.status,
  c.bank_account_id as "bankAccountId", ba.bank_name as "depositBank", ba.account_no as "depositAccountNo", c.deposited_on as "depositedOn",
  c.cleared_on as "clearedOn", c.bounced_on as "bouncedOn", c.bounce_reason as "bounceReason", c.receipt_id as "receiptId", c.notes, c.created_at as "createdAt"`;
const CHEQUE_FROM = `cheques c join parties p on p.id = c.party_id left join bookings b on b.id = c.booking_id left join bank_accounts ba on ba.id = c.bank_account_id`;

const CONTRACT_KINDS = ["sale_agreement", "rent", "service", "construction", "employment", "other"] as const;

async function chequeRow(c: Queryable, id: string) {
  const r = await c.query(`select ${CHEQUE_COLUMNS} from ${CHEQUE_FROM} where c.id = $1`, [id]);
  if (!r.rows[0]) throw new AppError(404, "not_found", "Cheque not found.");
  return r.rows[0];
}

export function billingRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  // ───────────────────────────── post-dated cheque register
  app.get("/v1/cheques", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    const q = parse(
      paging.extend({
        direction: z.enum(["received", "issued"]).optional(),
        status: z.enum(["in_hand", "deposited", "cleared", "bounced", "returned", "cancelled"]).optional(),
        search: z.string().trim().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(200),
      }),
      req.query,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${CHEQUE_COLUMNS} from ${CHEQUE_FROM}
          where ($1::text is null or c.direction = $1) and ($2::text is null or c.status = $2)
            and ($3::text is null or c.cheque_no ilike '%' || $3 || '%' or p.display_name ilike '%' || $3 || '%' or c.bank_name ilike '%' || $3 || '%')
          order by c.cheque_date, c.created_at limit $4 offset $5`,
        [q.direction ?? null, q.status ?? null, q.search ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.post("/v1/cheques", { preHandler: guards.inCompany("deals.create") }, async (req, reply) => {
    const b = parse(
      z.object({
        direction: z.enum(["received", "issued"]).default("received"),
        chequeNo: z.string().trim().min(1).max(40),
        bankName: z.string().trim().min(2).max(80),
        partyId: uuid,
        bookingId: uuid.optional(),
        amount: money,
        chequeDate: isoDate,
        receivedOn: isoDate.optional(),
        notes: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `insert into cheques (company_id, direction, cheque_no, bank_name, party_id, booking_id, amount, cheque_date, received_on, notes, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9::date, current_date),$10,$11) returning id`,
        [ctx.companyId, b.direction, b.chequeNo, b.bankName, b.partyId, b.bookingId ?? null, b.amount, b.chequeDate, b.receivedOn ?? null, b.notes ?? null, ctx.userId],
      );
      return chequeRow(c, r.rows[0]!.id);
    });
    return reply.code(201).send(out);
  });

  // deposit / clear / bounce / return: the database decides what is legal and posts the receipt when a cheque clears
  app.post("/v1/cheques/:id/:action", { preHandler: guards.inCompany("deals.edit") }, async (req) => {
    const { id, action } = parse(z.object({ id: uuid, action: z.enum(["deposit", "clear", "bounce", "return"]) }), req.params);
    const ctx = ctxOf(req);
    const b = parse(z.object({ bankAccountId: uuid.optional(), date: isoDate.optional(), reason: z.string().trim().max(300).optional() }), req.body ?? {});
    return db.inTenant(ctx, async (c) => {
      if (action === "deposit") await c.query(`select app.deposit_cheque($1, $2, $3::date, $4)`, [id, b.bankAccountId ?? null, b.date ?? null, ctx.userId]);
      else if (action === "clear") await c.query(`select app.clear_cheque($1, $2::date, $3)`, [id, b.date ?? null, ctx.userId]);
      else if (action === "bounce") await c.query(`select app.bounce_cheque($1, $2::date, $3, $4)`, [id, b.date ?? null, b.reason ?? null, ctx.userId]);
      else await c.query(`select app.return_cheque($1, $2)`, [id, ctx.userId]);
      return chequeRow(c, id);
    });
  });

  // ───────────────────────────── service invoices
  const SI_COLUMNS = `id, number, customer_id as "customerId", customer_name as "customerName", property_id as "propertyId", property_code as "propertyCode",
    property_title as "propertyTitle", period_label as "periodLabel", issue_date as "issueDate", due_date as "dueDate", amount, paid_amount as "paidAmount",
    balance, status, description, overdue, created_at as "createdAt"`;

  app.get("/v1/service-invoices", { preHandler: guards.inCompany("accounts.view") }, async (req) => {
    const q = parse(
      paging.extend({ status: z.enum(["unpaid", "partial", "paid", "void"]).optional(), customerId: uuid.optional(), search: z.string().trim().max(80).optional(), limit: z.coerce.number().int().min(1).max(200).default(200) }),
      req.query,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${SI_COLUMNS} from v_service_invoices
          where ($1::text is null or status = $1) and ($2::uuid is null or customer_id = $2)
            and ($3::text is null or number ilike '%' || $3 || '%' or customer_name ilike '%' || $3 || '%' or coalesce(period_label, '') ilike '%' || $3 || '%')
          order by issue_date desc, number desc limit $4 offset $5`,
        [q.status ?? null, q.customerId ?? null, q.search ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.post("/v1/service-invoices", { preHandler: guards.inCompany("accounts.create") }, async (req, reply) => {
    const b = parse(
      z.object({
        customerId: uuid,
        propertyId: uuid.optional(),
        periodLabel: z.string().trim().max(60).optional(),
        issueDate: isoDate.optional(),
        dueDate: isoDate,
        amount: money,
        revenueAccountId: uuid.optional(),
        description: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(`select app.issue_service_invoice($1,$2,$3,coalesce($4::date, current_date),$5,$6,$7,$8,$9) as id`, [
        b.customerId, b.propertyId ?? null, b.periodLabel ?? null, b.issueDate ?? null, b.dueDate, b.amount, b.revenueAccountId ?? null, b.description ?? null, ctx.userId,
      ]);
      return (await c.query(`select ${SI_COLUMNS} from v_service_invoices where id = $1`, [r.rows[0]!.id])).rows[0];
    });
    return reply.code(201).send(out);
  });

  app.post("/v1/service-invoices/:id/payments", { preHandler: guards.inCompany("accounts.create") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(
      z.object({
        amount: money,
        method: z.enum(["cash", "cheque", "bank_transfer", "online", "pay_order"]),
        bankAccountId: uuid.optional(),
        date: isoDate.optional(),
        reference: z.string().trim().max(60).optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      let account: string | null = null;
      if (b.bankAccountId) {
        account = (await c.query<{ g: string }>(`select gl_account_id as g from bank_accounts where id = $1`, [b.bankAccountId])).rows[0]?.g ?? null;
        if (!account) throw new AppError(404, "not_found", "Bank account not found.");
      } else if (b.method === "cash") {
        account = (await c.query<{ id: string }>(`select id from gl_accounts where code = '03.01.01.0001' and not is_group`)).rows[0]?.id ?? null;
      }
      if (!account) throw new AppError(422, "validation", "Choose the bank account the money went into.");
      await c.query(`select app.pay_service_invoice($1,$2,$3,$4,$5::date,$6,$7)`, [id, b.amount, b.method, account, b.date ?? null, b.reference ?? null, ctx.userId]);
      return (await c.query(`select ${SI_COLUMNS} from v_service_invoices where id = $1`, [id])).rows[0];
    });
  });

  app.post("/v1/service-invoices/:id/void", { preHandler: guards.inCompany("accounts.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(300), date: isoDate.optional() }), req.body);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await c.query(`select app.void_service_invoice($1, $2, $3, coalesce($4::date, current_date))`, [id, ctx.userId, b.reason, b.date ?? null]);
      return (await c.query(`select ${SI_COLUMNS} from v_service_invoices where id = $1`, [id])).rows[0];
    });
  });

  // ───────────────────────────── contracts
  const CONTRACT_COLUMNS = `id, contract_no as "contractNo", kind, title, party_id as "partyId", party_name as "partyName", booking_id as "bookingId", booking_no as "bookingNo",
    property_id as "propertyId", property_code as "propertyCode", project_id as "projectId", start_date as "startDate", end_date as "endDate", value,
    status, effective_status as "effectiveStatus", days_left as "daysLeft", signed_on as "signedOn", terms, terminated_on as "terminatedOn",
    termination_reason as "terminationReason", renewal_of as "renewalOf", created_at as "createdAt"`;

  app.get("/v1/contracts", { preHandler: guards.inCompany("contracts.view") }, async (req) => {
    const q = parse(
      paging.extend({ kind: z.enum(CONTRACT_KINDS).optional(), search: z.string().trim().max(80).optional(), limit: z.coerce.number().int().min(1).max(200).default(200) }),
      req.query,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${CONTRACT_COLUMNS} from v_contracts
          where ($1::text is null or kind = $1)
            and ($2::text is null or contract_no ilike '%' || $2 || '%' or title ilike '%' || $2 || '%' or coalesce(party_name, '') ilike '%' || $2 || '%')
          order by created_at desc limit $3 offset $4`,
        [q.kind ?? null, q.search ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.post("/v1/contracts", { preHandler: guards.inCompany("contracts.create") }, async (req, reply) => {
    const b = parse(
      z.object({
        kind: z.enum(CONTRACT_KINDS),
        title: z.string().trim().min(3).max(160),
        partyId: uuid.optional(),
        bookingId: uuid.optional(),
        propertyId: uuid.optional(),
        projectId: uuid.optional(),
        startDate: isoDate,
        endDate: isoDate.optional(),
        value: money.default("0"),
        terms: z.string().trim().max(4000).optional(),
        signedOn: isoDate.optional(),
        renewalOf: uuid.optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `insert into contracts (company_id, contract_no, kind, title, party_id, booking_id, property_id, project_id, start_date, end_date, value, terms, signed_on, status, renewal_of, created_by)
         values ($1, app.next_doc_no($1, 'CTR'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, case when $12::date is null then 'draft' else 'active' end, $13, $14) returning id`,
        [ctx.companyId, b.kind, b.title, b.partyId ?? null, b.bookingId ?? null, b.propertyId ?? null, b.projectId ?? null, b.startDate, b.endDate ?? null, b.value, b.terms ?? null, b.signedOn ?? null, b.renewalOf ?? null, ctx.userId],
      );
      return (await c.query(`select ${CONTRACT_COLUMNS} from v_contracts where id = $1`, [r.rows[0]!.id])).rows[0];
    });
    return reply.code(201).send(out);
  });

  // sign (draft → active) or terminate (needs a reason)
  app.post("/v1/contracts/:id/:action", { preHandler: guards.inCompany("contracts.edit") }, async (req) => {
    const { id, action } = parse(z.object({ id: uuid, action: z.enum(["sign", "terminate"]) }), req.params);
    const b = parse(z.object({ date: isoDate.optional(), reason: z.string().trim().min(3).max(300).optional() }), req.body ?? {});
    return db.inTenant(ctxOf(req), async (c) => {
      const cur = await c.query<{ status: string }>(`select status from contracts where id = $1`, [id]);
      if (!cur.rows[0]) throw new AppError(404, "not_found", "Contract not found.");
      if (action === "sign") {
        if (cur.rows[0].status !== "draft") throw new AppError(409, "not_draft", "Only a draft contract can be signed.");
        await c.query(`update contracts set status = 'active', signed_on = coalesce($2::date, current_date) where id = $1`, [id, b.date ?? null]);
      } else {
        if (cur.rows[0].status === "terminated") throw new AppError(409, "already_terminated", "This contract is already terminated.");
        if (!b.reason) throw new AppError(400, "reason_required", "Please say why the contract is being terminated.");
        await c.query(`update contracts set status = 'terminated', terminated_on = coalesce($2::date, current_date), termination_reason = $3 where id = $1`, [id, b.date ?? null, b.reason]);
      }
      return (await c.query(`select ${CONTRACT_COLUMNS} from v_contracts where id = $1`, [id])).rows[0];
    });
  });
}
