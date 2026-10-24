import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

const BOOKING_COLUMNS = `b.id, b.booking_no as "bookingNo", b.property_id as "propertyId", b.customer_id as "customerId",
  b.booking_date as "bookingDate", b.list_price as "listPrice", b.discount, b.net_price as "netPrice",
  b.payment_type as "paymentType", b.status, b.created_by as "createdBy", b.created_at as "createdAt",
  b.cancel_reason as "cancelReason", b.dealer_id as "dealerId",
  p.code as "propertyCode", p.title as "propertyTitle", pr.name as "projectName", pr.id as "projectId", c.display_name as "customerName",
  (select coalesce(sum(i.paid_amount), 0) from installments i where i.booking_id = b.id) as "paidAmount",
  (select coalesce(sum(i.amount), 0) from installments i where i.booking_id = b.id) as "scheduledAmount",
  (select count(*)::int from installments i where i.booking_id = b.id) as "installmentCount",
  (select min(i.due_date) from installments i where i.booking_id = b.id and i.status in ('due','partial')) as "nextDueDate",
  (select coalesce(sum(i.amount - i.paid_amount), 0) from installments i
    where i.booking_id = b.id and i.status in ('due','partial') and i.due_date < current_date) as "overdueAmount"`;
const BOOKING_FROM = `bookings b join properties p on p.id = b.property_id join parties c on c.id = b.customer_id left join projects pr on pr.id = p.project_id`;

async function bookingWithDetail(c: Queryable, id: string) {
  // data scope: a role limited to "own" or "team" only sees the bookings its scope covers
  const b = await c.query(`select ${BOOKING_COLUMNS} from ${BOOKING_FROM} where b.id = $1 and app.user_in_scope('deals', b.created_by)`, [id]);
  const booking = b.rows[0];
  if (!booking) throw new AppError(404, "not_found", "Booking not found.");
  const inst = await c.query(
    `select id, seq, kind, due_date as "dueDate", amount, paid_amount as "paidAmount", status from installments where booking_id = $1 order by seq`,
    [id],
  );
  const next = await c.query<{ to_state: string; required_permission: string | null; description: string | null }>(
    `select to_state, required_permission, description from app.allowed_transitions('booking', $1)`,
    [booking.status],
  );
  return {
    ...booking,
    installments: inst.rows,
    nextSteps: next.rows.map((t) => ({ to: t.to_state, description: t.description, requiredPermission: t.required_permission })),
  };
}

export function bookingRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/bookings", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    const q = parse(paging.extend({ status: z.enum(["pending", "confirmed", "completed", "cancelled"]).optional(), propertyId: uuid.optional() }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${BOOKING_COLUMNS} from ${BOOKING_FROM}
          where app.user_in_scope('deals', b.created_by)
            and ($1::text is null or b.status = $1) and ($2::uuid is null or b.property_id = $2)
          order by b.created_at desc, b.id limit $3 offset $4`,
        [q.status ?? null, q.propertyId ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.get("/v1/bookings/:id", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => bookingWithDetail(c, id));
  });

  // Create a booking. Send an Idempotency-Key header and a retry returns the same booking instead of a second one.
  app.post("/v1/bookings", { preHandler: guards.inCompany("deals.create") }, async (req, reply) => {
    const body = parse(
      z.object({
        propertyId: uuid,
        customerId: uuid,
        paymentType: z.enum(["cash", "installment"]),
        listPrice: money.optional(),
        discount: money.default("0"),
        bookingDate: isoDate.optional(),
        dealerId: uuid.optional(),
      }),
      req.body,
    );
    const rawKey = req.headers["idempotency-key"];
    const key = typeof rawKey === "string" && rawKey.trim() ? rawKey.trim().slice(0, 120) : null;
    const ctx = ctxOf(req);
    const booking = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `select app.create_booking($1, $2, $3, $4, $5, $6, coalesce($7::date, current_date), null, $8, 'pending', $9) as id`,
        [body.propertyId, body.customerId, body.paymentType, ctx.userId, body.listPrice ?? null, body.discount, body.bookingDate ?? null, body.dealerId ?? null, key],
      );
      return bookingWithDetail(c, r.rows[0]!.id);
    });
    return reply.code(201).send(booking);
  });

  // Build the payment plan: down payment + equal installments (+ optional balloon). Always adds up to the price.
  app.post("/v1/bookings/:id/schedule", { preHandler: guards.inCompany("deals.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const body = parse(
      z.object({
        downPayment: money.default("0"),
        installments: z.number().int().min(0).max(600),
        firstDue: isoDate.optional(),
        intervalMonths: z.number().int().min(1).max(24).default(1),
        balloon: money.default("0"),
        balloonDue: isoDate.optional(),
      }),
      req.body,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      await c.query(`select app.build_schedule($1, $2, $3, $4::date, $5, $6, $7::date)`, [
        id, body.downPayment, body.installments, body.firstDue ?? null, body.intervalMonths, body.balloon, body.balloonDue ?? null,
      ]);
      return bookingWithDetail(c, id);
    });
  });

  // Move a booking along (confirm, complete, cancel). The DATABASE decides whether the move is legal, whether this
  // person's permissions allow it, and whether the payment schedule adds up: the API repeats none of those rules.
  app.post("/v1/bookings/:id/status", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ to: z.enum(["confirmed", "completed", "cancelled"]), reason: z.string().trim().min(3).max(300).optional() }), req.body);
    if (body.to === "cancelled" && !body.reason) throw new AppError(400, "reason_required", "Please say why the booking is being cancelled.");
    return db.inTenant(ctxOf(req), async (c) => {
      const seen = await c.query(`select 1 from bookings b where b.id = $1 and app.user_in_scope('deals', b.created_by)`, [id]);
      if (!seen.rows[0]) throw new AppError(404, "not_found", "Booking not found.");
      if (body.to === "cancelled") {
        await c.query(`update bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = $2 where id = $1`, [id, body.reason]);
      } else {
        await c.query(`update bookings set status = $2 where id = $1`, [id, body.to]);
      }
      return bookingWithDetail(c, id);
    });
  });
}
