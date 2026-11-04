import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";
import { idempotent, requestKey } from "../idempotency.js";
import { RECEIPT_IN_SCOPE, bookingInScope, requireBooking } from "../scope.js";

const RECEIPT_COLUMNS = `id, receipt_no as "receiptNo", received_on as "receivedOn", amount, method, instrument_ref as "instrumentRef", status,
  customer_id as "customerId", customer_name as "customerName", booking_id as "bookingId", booking_no as "bookingNo",
  deposit_account as "depositAccountId", deposit_account_code as "depositAccountCode", deposit_account_name as "depositAccountName",
  allocated_amount as "allocatedAmount", void_reason as "voidReason", created_at as "createdAt"`;

async function receiptDetail(c: Queryable, id: string) {
  const r = await c.query(`select ${RECEIPT_COLUMNS} from v_receipts where id = $1 and ${RECEIPT_IN_SCOPE}`, [id]);
  const receipt = r.rows[0];
  if (!receipt) throw new AppError(404, "not_found", "Receipt not found.");
  const alloc = await c.query(
    `select i.seq, i.kind, i.due_date as "dueDate", sum(a.amount) as amount
       from receipt_allocations a join installments i on i.id = a.installment_id
      where a.receipt_id = $1 group by i.seq, i.kind, i.due_date having sum(a.amount) <> 0 order by i.seq`,
    [id],
  );
  return { ...receipt, allocations: alloc.rows };
}

export function receiptRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/receipts", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    const q = parse(
      paging.extend({ bookingId: uuid.optional(), customerId: uuid.optional(), status: z.enum(["posted", "void"]).optional(), search: z.string().trim().max(80).optional() }),
      req.query,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${RECEIPT_COLUMNS} from v_receipts
          where ($1::uuid is null or booking_id = $1) and ($2::uuid is null or customer_id = $2) and ($3::text is null or status = $3) and ${RECEIPT_IN_SCOPE}
            and ($4::text is null or receipt_no ilike '%' || $4 || '%' or customer_name ilike '%' || $4 || '%' or booking_no ilike '%' || $4 || '%' or instrument_ref ilike '%' || $4 || '%')
          order by received_on desc, created_at desc limit $5 offset $6`,
        [q.bookingId ?? null, q.customerId ?? null, q.status ?? null, q.search ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.get("/v1/receipts/:id", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => receiptDetail(c, id));
  });

  // Record money received. It is posted straight away: the receipt, its ledger entry and the allocation to the
  // booking's installments all happen in one database transaction. Send an Idempotency-Key to make a retry safe.
  app.post("/v1/receipts", { preHandler: guards.inCompany("deals.create") }, async (req, reply) => {
    const b = parse(
      z.object({
        bookingId: uuid.optional(),
        customerId: uuid.optional(),
        amount: money,
        method: z.enum(["cash", "cheque", "bank_transfer", "online", "pay_order"]),
        depositAccountId: uuid.optional(),
        bankAccountId: uuid.optional(),
        receivedOn: isoDate.optional(),
        instrumentRef: z.string().trim().max(60).optional(),
        allocations: z.array(z.object({ installmentId: uuid, amount: money })).max(100).optional(),
      }),
      req.body,
    );
    if (!b.bookingId && !b.customerId) throw new AppError(400, "validation", "Choose the booking this money is for.");
    if (Number(b.amount) <= 0) throw new AppError(422, "validation", "Enter an amount greater than zero.");
    const ctx = ctxOf(req);
    const key = requestKey(req);
    let replayed = false;
    const out = await db.inTenant(ctx, async (c) => {
      const once = await idempotent(c, key, "receipt", b, async () => {
      // money can only be received on bookings the caller may work with (a Sales Agent: their own)
      if (b.bookingId) await requireBooking(c, b.bookingId);
      if (b.allocations?.length) {
        const ids = [...new Set(b.allocations.map((a) => a.installmentId))];
        const ok = await c.query(`select count(*)::int as n from installments i join bookings b on b.id = i.booking_id where i.id = any($1::uuid[]) and ${bookingInScope()}`, [ids]);
        if (ok.rows[0].n !== ids.length) throw new AppError(404, "not_found", "Installment not found.");
      }
      if (!b.bookingId && b.customerId) {
        // without a booking the money is spread over the customer's open dues: refuse if some of those are not the caller's
        const other = await c.query(
          `select 1 from installments i join bookings b on b.id = i.booking_id
            where b.customer_id = $1 and b.status <> 'cancelled' and i.status in ('due','partial') and not ${bookingInScope()} limit 1`,
          [b.customerId],
        );
        if (other.rows[0]) throw new AppError(403, "not_permitted", "This customer also has bookings that belong to a colleague. Choose the booking this money is for.");
      }
      let account = b.depositAccountId ?? null;
      if (!account && b.bankAccountId) {
        const ba = await c.query<{ gl_account_id: string }>(`select gl_account_id from bank_accounts where id = $1`, [b.bankAccountId]);
        account = ba.rows[0]?.gl_account_id ?? null;
        if (!account) throw new AppError(404, "not_found", "Bank account not found.");
      }
      if (!account) {
        // default: cash in hand for cash, otherwise the first bank account
        const d = await c.query<{ id: string }>(
          b.method === "cash"
            ? `select id from gl_accounts where code = '03.01.01.0001' and not is_group limit 1`
            : `select gl_account_id as id from bank_accounts where active order by created_at limit 1`,
        );
        account = d.rows[0]?.id ?? null;
      }
      if (!account) throw new AppError(422, "validation", "Choose the cash or bank account the money went into.");
      const r = await c.query<{ id: string }>(`select app.record_receipt($1, $2, $3, $4, $5::date, $6, $7, $8::jsonb, $9) as id`, [
        b.bookingId ?? null, b.amount, b.method, account, b.receivedOn ?? null, b.instrumentRef ?? null, ctx.userId,
        b.allocations ? JSON.stringify(b.allocations) : null, b.customerId ?? null,
      ]);
      return { id: r.rows[0]!.id, result: await receiptDetail(c, r.rows[0]!.id) };
      }, (id) => receiptDetail(c, id));
      replayed = once.replayed;
      return once.result;
    });
    if (replayed) void reply.header("idempotent-replayed", "true");
    return reply.code(201).send(out);
  });

  // Cancel a receipt: the ledger entry is reversed and the installments it paid become due again. Nothing is deleted.
  app.post("/v1/receipts/:id/void", { preHandler: guards.inCompany("accounts.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(300), date: isoDate.optional() }), req.body);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await receiptDetail(c, id); // 404 when the receipt is not in the caller's scope
      await c.query(`select app.void_receipt($1, $2, $3, coalesce($4::date, current_date))`, [id, ctx.userId, b.reason, b.date ?? null]);
      return receiptDetail(c, id);
    });
  });
}
