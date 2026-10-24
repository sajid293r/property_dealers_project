import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

/** Everything about one booking that goes beyond its installments: late charges, refunds, transfers, commission. */
async function extras(c: Queryable, bookingId: string) {
  const exists = await c.query(`select 1 from bookings b where b.id = $1 and app.user_in_scope('deals', b.created_by)`, [bookingId]);
  if (!exists.rows[0]) throw new AppError(404, "not_found", "Booking not found.");
  const pen = await c.query(
    `select p.id, i.seq as "installmentSeq", i.id as "installmentId", p.amount, p.paid_amount as "paidAmount", p.status, p.reason, p.assessed_on as "assessedOn"
       from penalty_charges p join installments i on i.id = p.installment_id where i.booking_id = $1 order by p.created_at desc`,
    [bookingId],
  );
  const sug = await c.query(
    `select i.id as "installmentId", i.seq, i.due_date as "dueDate", app.suggested_penalty(i.id) as amount
       from installments i where i.booking_id = $1 and i.status in ('due','partial') and i.due_date < current_date order by i.seq`,
    [bookingId],
  );
  const ref = await c.query(
    `select r.id, r.refund_no as "refundNo", r.refund_amount as "refundAmount", r.deduction_amount as "deductionAmount", r.method, r.refund_date as "refundDate", r.note, r.status
       from booking_refunds r where r.booking_id = $1 order by r.created_at desc`,
    [bookingId],
  );
  const trf = await c.query(
    `select t.id, t.transfer_no as "transferNo", fp.display_name as "fromName", tp.display_name as "toName", t.transfer_date as "transferDate", t.amount_moved as "amountMoved", t.note
       from booking_transfers t join parties fp on fp.id = t.from_party_id join parties tp on tp.id = t.to_party_id where t.booking_id = $1 order by t.created_at desc`,
    [bookingId],
  );
  const com = await c.query(
    `select m.id, m.commission_no as "commissionNo", m.dealer_id as "dealerId", d.display_name as "dealerName", m.rate_pct as "ratePct", m.base_amount as "baseAmount", m.amount, m.status, m.accrued_on as "accruedOn"
       from dealer_commissions m join parties d on d.id = m.dealer_id where m.booking_id = $1 order by m.created_at desc`,
    [bookingId],
  );
  const b = await c.query(
    `select b.dealer_id as "dealerId", d.display_name as "dealerName", app.booking_refundable(b.id) as refundable,
            coalesce((select sum(amount) from receipts r where r.booking_id = b.id and r.status = 'posted'), 0) as received
       from bookings b left join parties d on d.id = b.dealer_id where b.id = $1`,
    [bookingId],
  );
  const settings = await c.query(
    `select coalesce((settings ->> 'penalty_rate_pct_month')::numeric, 0) as rate, coalesce((settings ->> 'penalty_grace_days')::int, 0) as grace from companies where id = app.current_company()`,
  );
  return {
    ...b.rows[0],
    penalties: pen.rows,
    penaltySuggestions: sug.rows.filter((s) => Number(s.amount) > 0),
    penaltyRule: { ratePctPerMonth: settings.rows[0].rate, graceDays: settings.rows[0].grace },
    refunds: ref.rows,
    transfers: trf.rows,
    commissions: com.rows,
  };
}

export function salesOpsRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/bookings/:id/extras", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => extras(c, id));
  });

  // ── late charges
  app.post("/v1/installments/:id/penalty", { preHandler: guards.inCompany("accounts.create") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ amount: money, reason: z.string().trim().max(200).optional() }), req.body);
    const ctx = ctxOf(req);
    await db.inTenant(ctx, async (c) => {
      const inst = await c.query(`select 1 from installments i join bookings b on b.id = i.booking_id where i.id = $1 and app.user_in_scope('deals', b.created_by)`, [id]);
      if (!inst.rows[0]) throw new AppError(404, "not_found", "Installment not found.");
      await c.query(`select app.assess_penalty($1, $2, $3, $4)`, [id, b.amount, b.reason ?? null, ctx.userId]);
    });
    return reply.code(201).send({ ok: true });
  });

  app.post("/v1/penalties/:id/waive", { preHandler: guards.inCompany("accounts.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
    const ctx = ctxOf(req);
    await db.inTenant(ctx, (c) => c.query(`select app.waive_penalty($1, $2, $3)`, [id, ctx.userId, b.reason]));
    return { ok: true };
  });

  // ── refund after cancellation
  app.post("/v1/bookings/:id/refund", { preHandler: guards.inCompany("accounts.approve") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(
      z.object({
        refundAmount: money.default("0"),
        deductionAmount: money.default("0"),
        method: z.enum(["cash", "cheque", "bank_transfer", "online", "pay_order"]).default("cash"),
        bankAccountId: uuid.optional(),
        date: isoDate.optional(),
        note: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    await db.inTenant(ctx, async (c) => {
      const seen = await c.query(`select 1 from bookings b where b.id = $1 and app.user_in_scope('deals', b.created_by)`, [id]);
      if (!seen.rows[0]) throw new AppError(404, "not_found", "Booking not found.");
      let from: string | null = null;
      if (Number(b.refundAmount) > 0) {
        if (b.bankAccountId) from = (await c.query<{ g: string }>(`select gl_account_id as g from bank_accounts where id = $1`, [b.bankAccountId])).rows[0]?.g ?? null;
        else if (b.method === "cash") from = (await c.query<{ id: string }>(`select id from gl_accounts where code = '03.01.01.0001' and not is_group`)).rows[0]?.id ?? null;
        if (!from) throw new AppError(422, "validation", "Choose the account the refund is paid from.");
      }
      await c.query(`select app.refund_booking($1,$2,$3,$4,$5,$6::date,$7,$8)`, [id, b.refundAmount, b.deductionAmount, b.method, from, b.date ?? null, b.note ?? null, ctx.userId]);
    });
    return reply.code(201).send({ ok: true });
  });

  app.post("/v1/refunds/:id/void", { preHandler: guards.inCompany("accounts.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
    const ctx = ctxOf(req);
    await db.inTenant(ctx, (c) => c.query(`select app.void_refund($1, $2, $3)`, [id, ctx.userId, b.reason]));
    return { ok: true };
  });

  // ── transfer to another customer
  app.post("/v1/bookings/:id/transfer", { preHandler: guards.inCompany("deals.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ toPartyId: uuid, fee: money.default("0"), date: isoDate.optional(), note: z.string().trim().max(300).optional() }), req.body);
    const ctx = ctxOf(req);
    await db.inTenant(ctx, async (c) => {
      const seen = await c.query(`select 1 from bookings b where b.id = $1 and app.user_in_scope('deals', b.created_by)`, [id]);
      if (!seen.rows[0]) throw new AppError(404, "not_found", "Booking not found.");
      await c.query(`select app.transfer_booking($1,$2,$3,$4::date,$5,$6)`, [id, b.toPartyId, b.fee, b.date ?? null, b.note ?? null, ctx.userId]);
    });
    return reply.code(201).send({ ok: true });
  });

  // ── dealer commission
  app.post("/v1/bookings/:id/commission", { preHandler: guards.inCompany("deals.approve") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ ratePct: z.number().gt(0).max(100) }), req.body);
    const ctx = ctxOf(req);
    await db.inTenant(ctx, async (c) => {
      const seen = await c.query(`select 1 from bookings b where b.id = $1 and app.user_in_scope('deals', b.created_by)`, [id]);
      if (!seen.rows[0]) throw new AppError(404, "not_found", "Booking not found.");
      await c.query(`select app.accrue_commission($1, $2, $3)`, [id, b.ratePct, ctx.userId]);
    });
    return reply.code(201).send({ ok: true });
  });

  app.post("/v1/commissions/:id/void", { preHandler: guards.inCompany("deals.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body);
    const ctx = ctxOf(req);
    await db.inTenant(ctx, (c) => c.query(`select app.void_commission($1, $2, $3)`, [id, ctx.userId, b.reason]));
    return { ok: true };
  });

  // every dealer with what they have earned and what is still owed (owed = credits less debits on their payable lines)
  app.get("/v1/commissions", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select m.id, m.commission_no as "commissionNo", m.booking_id as "bookingId", b.booking_no as "bookingNo", m.dealer_id as "dealerId", d.display_name as "dealerName",
                m.rate_pct as "ratePct", m.amount, m.status, m.accrued_on as "accruedOn"
           from dealer_commissions m join bookings b on b.id = m.booking_id join parties d on d.id = m.dealer_id order by m.created_at desc limit 200`,
      );
      const owed = await c.query(
        `select l.party_id as "dealerId", sum(l.credit - l.debit) as owed from journal_lines l join gl_accounts a on a.id = l.account_id where a.code = '02.01.01.0002' and l.party_id is not null group by l.party_id`,
      );
      return { rows: r.rows, owed: owed.rows };
    });
  });
}
