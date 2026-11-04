import type { Queryable } from "./db.js";
import { AppError } from "./errors.js";

/**
 * Data scope for everything that belongs to a booking. A Sales Agent has the scope "own" on Deals: they see and work
 * only the bookings they created. Every route that reads or writes something hanging off a booking (receipts,
 * schedule, refunds, transfers, reminders, commissions, late fees, cheques, attachments) asks the same question
 * through these helpers, so the rule cannot be forgotten on one screen. A record outside the scope answers 404,
 * exactly like one that does not exist.
 */

/** SQL: this booking row (alias `b`) is one the caller may work with. */
export const bookingInScope = (alias = "b") => `app.user_in_scope('deals', ${alias}.created_by)`;

/** SQL: the caller may see everything in Deals (company-wide scope), e.g. for company-wide totals. */
export const companyWideDeals = `app.user_in_scope('deals', null)`;

const notFound = () => new AppError(404, "not_found", "Booking not found.");

export async function requireBooking(c: Queryable, bookingId: string): Promise<void> {
  const r = await c.query(`select 1 from bookings b where b.id = $1 and ${bookingInScope()}`, [bookingId]);
  if (!r.rows[0]) throw notFound();
}

export async function requireInstallment(c: Queryable, installmentId: string): Promise<void> {
  const r = await c.query(`select 1 from installments i join bookings b on b.id = i.booking_id where i.id = $1 and ${bookingInScope()}`, [installmentId]);
  if (!r.rows[0]) throw new AppError(404, "not_found", "Installment not found.");
}

/** A refund, commission or late fee belongs to a booking; look the booking up through the child table. */
export async function requireBookingOf(c: Queryable, table: "booking_refunds" | "dealer_commissions", id: string, what: string): Promise<void> {
  const r = await c.query(`select 1 from ${table} x join bookings b on b.id = x.booking_id where x.id = $1 and ${bookingInScope()}`, [id]);
  if (!r.rows[0]) throw new AppError(404, "not_found", `${what} not found.`);
}

export async function requirePenalty(c: Queryable, penaltyId: string): Promise<void> {
  const r = await c.query(
    `select 1 from penalty_charges p join installments i on i.id = p.installment_id join bookings b on b.id = i.booking_id where p.id = $1 and ${bookingInScope()}`,
    [penaltyId],
  );
  if (!r.rows[0]) throw new AppError(404, "not_found", "Late fee not found.");
}

/** SQL for a row of v_receipts: a receipt on a booking follows the booking; one without a booking follows who made it. */
export const RECEIPT_IN_SCOPE = `(case when v_receipts.booking_id is not null
    then exists (select 1 from bookings b where b.id = v_receipts.booking_id and ${bookingInScope()})
    else app.user_in_scope('deals', v_receipts.created_by) end)`;
