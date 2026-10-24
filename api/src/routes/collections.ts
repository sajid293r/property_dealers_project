import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

/**
 * The chase list: every unpaid installment that is late or due soon, with the customer's phone and when they were last
 * reminded. Sending (WhatsApp / SMS) happens from the person's own phone or WhatsApp; this records that it was done.
 */
export function collectionRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/collections", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    const q = parse(paging.extend({ bucket: z.enum(["overdue", "week", "month", "all"]).default("overdue"), limit: z.coerce.number().int().min(1).max(200).default(200) }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select i.id as "installmentId", i.seq, i.kind, i.due_date as "dueDate", (i.amount - i.paid_amount) as outstanding, (current_date - i.due_date) as "daysLate",
                b.id as "bookingId", b.booking_no as "bookingNo", p.id as "partyId", p.display_name as "customerName", p.phone_e164 as phone,
                pr.code as "propertyCode", pr.title as "propertyTitle",
                (select max(l.sent_at) from reminder_log l where l.booking_id = b.id) as "lastReminderAt",
                (select count(*)::int from reminder_log l where l.booking_id = b.id) as "reminders"
           from installments i join bookings b on b.id = i.booking_id join parties p on p.id = b.customer_id join properties pr on pr.id = b.property_id
          where i.status in ('due','partial') and b.status <> 'cancelled' and app.user_in_scope('deals', b.created_by)
            and case $1 when 'overdue' then i.due_date < current_date
                        when 'week' then i.due_date >= current_date and i.due_date < current_date + 8
                        when 'month' then i.due_date >= current_date and i.due_date < current_date + 31
                        else true end
          order by i.due_date, b.booking_no limit $2 offset $3`,
        [q.bucket, q.limit, q.offset],
      );
      const tot = await c.query(
        `select count(*) filter (where i.due_date < current_date)::int as "overdueCount",
                coalesce(sum(i.amount - i.paid_amount) filter (where i.due_date < current_date), 0) as "overdueAmount",
                count(*) filter (where i.due_date >= current_date and i.due_date < current_date + 8)::int as "weekCount",
                coalesce(sum(i.amount - i.paid_amount) filter (where i.due_date >= current_date and i.due_date < current_date + 8), 0) as "weekAmount"
           from installments i join bookings b on b.id = i.booking_id
          where i.status in ('due','partial') and b.status <> 'cancelled' and app.user_in_scope('deals', b.created_by)`,
      );
      return { rows: r.rows, totals: tot.rows[0] };
    });
  });

  app.post("/v1/reminders", { preHandler: guards.inCompany("deals.create") }, async (req, reply) => {
    const b = parse(z.object({ bookingId: uuid, installmentId: uuid.optional(), channel: z.enum(["whatsapp", "sms", "call", "email", "visit"]), message: z.string().trim().max(1000).optional() }), req.body);
    const ctx = ctxOf(req);
    await db.inTenant(ctx, async (c) => {
      const bk = await c.query<{ customer_id: string }>(`select customer_id from bookings b where b.id = $1 and app.user_in_scope('deals', b.created_by)`, [b.bookingId]);
      if (!bk.rows[0]) throw new AppError(404, "not_found", "Booking not found.");
      await c.query(`insert into reminder_log (company_id, booking_id, installment_id, party_id, channel, message, sent_by) values ($1,$2,$3,$4,$5,$6,$7)`, [
        ctx.companyId, b.bookingId, b.installmentId ?? null, bk.rows[0].customer_id, b.channel, b.message ?? null, ctx.userId,
      ]);
    });
    return reply.code(201).send({ ok: true });
  });

  app.get("/v1/reminders", { preHandler: guards.inCompany("deals.view") }, async (req) => {
    const q = parse(z.object({ bookingId: uuid }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select l.id, l.channel, l.message, l.sent_at as "sentAt", u.full_name as "sentBy" from reminder_log l left join users u on u.id = l.sent_by where l.booking_id = $1 order by l.sent_at desc limit 50`,
        [q.bookingId],
      );
      return r.rows;
    });
  });
}
