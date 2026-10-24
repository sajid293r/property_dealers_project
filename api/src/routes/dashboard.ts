import type { FastifyInstance } from "fastify";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";

/**
 * One call for the owner's home screen. Every figure is computed from the records (bookings, installments,
 * receipts, the ledger), never stored. A section is only included when this person may see it, so a viewer limited
 * to inventory is not shown the bank balance.
 */
export function dashboardRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/dashboard", { preHandler: guards.inCompany() }, async (req) => {
    const ctx = ctxOf(req);
    const can = (p: string) => ctx.permissions.includes(p);
    return db.inTenant(ctx, async (c) => {
      const out: Record<string, unknown> = { permissions: { inventory: can("inventory.view"), sales: can("deals.view"), finance: can("accounts.view") } };

      if (can("inventory.view")) {
        const r = await c.query(`select status, count(*)::int as n, coalesce(sum(list_price), 0) as value from properties group by status`);
        const projects = await c.query(`select count(*)::int as n from projects`);
        out.inventory = { byStatus: r.rows, projects: projects.rows[0].n };
      }

      if (can("deals.view")) {
        const s = await c.query(`
          select count(*) filter (where b.status <> 'cancelled')::int as "activeBookings",
                 coalesce(sum(b.net_price) filter (where b.status <> 'cancelled'), 0) as "contractValue",
                 count(*) filter (where b.status = 'pending')::int as "pendingBookings"
            from bookings b where app.user_in_scope('deals', b.created_by)`);
        const m = await c.query(`
          select coalesce(sum(r.amount) filter (where date_trunc('month', r.received_on) = date_trunc('month', current_date)), 0) as "thisMonth",
                 coalesce(sum(r.amount) filter (where date_trunc('month', r.received_on) = date_trunc('month', current_date - interval '1 month')), 0) as "lastMonth",
                 coalesce(sum(r.amount), 0) as "allTime"
            from receipts r where r.status = 'posted'`);
        const due = await c.query(`
          select coalesce(sum(i.amount - i.paid_amount) filter (where i.due_date < current_date), 0) as "overdueAmount",
                 count(distinct i.booking_id) filter (where i.due_date < current_date)::int as "overdueBookings",
                 coalesce(sum(i.amount - i.paid_amount) filter (where i.due_date >= current_date and i.due_date < current_date + 30), 0) as "dueNext30",
                 coalesce(sum(i.amount - i.paid_amount), 0) as "totalReceivable"
            from installments i join bookings b on b.id = i.booking_id
           where i.status in ('due','partial') and b.status <> 'cancelled'`);
        const aging = await c.query(`
          select bucket, coalesce(sum(left_amount), 0) as amount from (
            select i.amount - i.paid_amount as left_amount,
                   case when current_date - i.due_date <= 30 then '1-30' when current_date - i.due_date <= 60 then '31-60'
                        when current_date - i.due_date <= 90 then '61-90' else '90+' end as bucket
              from installments i join bookings b on b.id = i.booking_id
             where i.status in ('due','partial') and i.due_date < current_date and b.status <> 'cancelled') x group by bucket`);
        const overdueList = await c.query(`
          select b.id as "bookingId", b.booking_no as "bookingNo", p.display_name as "customerName", min(i.due_date) as "oldestDue",
                 sum(i.amount - i.paid_amount) as amount
            from installments i join bookings b on b.id = i.booking_id join parties p on p.id = b.customer_id
           where i.status in ('due','partial') and i.due_date < current_date and b.status <> 'cancelled'
           group by b.id, b.booking_no, p.display_name order by min(i.due_date) limit 6`);
        const upcoming = await c.query(`
          select b.id as "bookingId", b.booking_no as "bookingNo", p.display_name as "customerName", i.due_date as "dueDate", i.seq, i.amount - i.paid_amount as amount
            from installments i join bookings b on b.id = i.booking_id join parties p on p.id = b.customer_id
           where i.status in ('due','partial') and i.due_date >= current_date and b.status <> 'cancelled'
           order by i.due_date, i.seq limit 6`);
        const recent = await c.query(
          `select id, receipt_no as "receiptNo", received_on as "receivedOn", amount, customer_name as "customerName", booking_id as "bookingId", booking_no as "bookingNo"
             from v_receipts where status = 'posted' order by received_on desc, created_at desc limit 6`,
        );
        const months = await c.query(`
          select to_char(date_trunc('month', r.received_on), 'YYYY-MM') as month, coalesce(sum(r.amount), 0) as amount
            from receipts r where r.status = 'posted' and r.received_on >= date_trunc('month', current_date) - interval '5 months'
           group by 1 order by 1`);
        out.sales = { ...s.rows[0], collections: m.rows[0], ...due.rows[0], aging: aging.rows, overdueList: overdueList.rows, upcoming: upcoming.rows, recentReceipts: recent.rows, collectionsByMonth: months.rows };
      }

      if (can("accounts.view")) {
        const cash = await c.query(`
          select a.category, coalesce(sum(l.debit - l.credit), 0) as balance
            from gl_accounts a left join journal_lines l on l.account_id = a.id
           where a.category in ('asset_cash','asset_bank') and not a.is_group group by a.category`);
        const pending = await c.query(`select count(*)::int as n from vouchers where status = 'pending'`);
        const month = await c.query(`
          select coalesce(sum(l.credit - l.debit) filter (where a.account_class = 'income'), 0) as income,
                 coalesce(sum(l.debit - l.credit) filter (where a.account_class = 'expense'), 0) as expense
            from journal_lines l join journal_entries e on e.id = l.entry_id join gl_accounts a on a.id = l.account_id
           where e.entry_date >= date_trunc('month', current_date) and e.entry_date < date_trunc('month', current_date) + interval '1 month'`);
        const unreconciled = await c.query(`select count(*)::int as n from bank_accounts ba where ba.active and exists (select 1 from v_bank_ledger v where v.bank_account_id = ba.id and not v.cleared)`);
        out.finance = {
          cashInHand: cash.rows.find((r) => r.category === "asset_cash")?.balance ?? "0",
          inBanks: cash.rows.find((r) => r.category === "asset_bank")?.balance ?? "0",
          vouchersPending: pending.rows[0].n,
          monthIncome: month.rows[0].income,
          monthExpense: month.rows[0].expense,
          bankAccountsToReconcile: unreconciled.rows[0].n,
        };
      }
      return out;
    });
  });
}
