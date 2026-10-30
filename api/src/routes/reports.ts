import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { isoDate, parse } from "../http.js";

/**
 * The management reports that sit beside the financial statements: cash flow, who owes the company (aging), sales by
 * project, collections and what the company owes suppliers. Money-in/out figures come from the ledger, so they can
 * never disagree with the trial balance; aging and sales come from the installment schedule.
 */
export function reportRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  const range = z.object({ from: isoDate, to: isoDate });

  // cash and bank movement by month, and by what caused it
  app.get("/v1/reports/cash-flow", { preHandler: guards.inCompany("reports.view") }, async (req) => {
    const q = parse(range, req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const base = `from journal_lines l join journal_entries e on e.id = l.entry_id join gl_accounts a on a.id = l.account_id where a.category in ('asset_cash','asset_bank')`;
      const opening = await c.query(`select coalesce(sum(l.debit - l.credit), 0) as v ${base} and e.entry_date < $1`, [q.from]);
      const months = await c.query(
        `select to_char(date_trunc('month', e.entry_date), 'YYYY-MM') as month, sum(l.debit) as inflow, sum(l.credit) as outflow ${base} and e.entry_date between $1 and $2 group by 1 order by 1`,
        [q.from, q.to],
      );
      const sources = await c.query(
        `select e.source_type as source, sum(l.debit) as inflow, sum(l.credit) as outflow ${base} and e.entry_date between $1 and $2 group by 1 order by sum(l.debit) + sum(l.credit) desc`,
        [q.from, q.to],
      );
      return { from: q.from, to: q.to, opening: opening.rows[0].v, months: months.rows, sources: sources.rows };
    });
  });

  // unpaid installments by how late they are, per customer
  app.get("/v1/reports/receivables-aging", { preHandler: guards.inCompany("reports.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select p.id as "partyId", p.display_name as "customerName", p.phone_e164 as phone,
                count(distinct b.id)::int as bookings,
                coalesce(sum(i.amount - i.paid_amount) filter (where i.due_date >= current_date), 0) as "notDue",
                coalesce(sum(i.amount - i.paid_amount) filter (where current_date - i.due_date between 1 and 30), 0) as "d30",
                coalesce(sum(i.amount - i.paid_amount) filter (where current_date - i.due_date between 31 and 60), 0) as "d60",
                coalesce(sum(i.amount - i.paid_amount) filter (where current_date - i.due_date between 61 and 90), 0) as "d90",
                coalesce(sum(i.amount - i.paid_amount) filter (where current_date - i.due_date > 90), 0) as "d90plus",
                sum(i.amount - i.paid_amount) as total,
                max(current_date - i.due_date) filter (where i.due_date < current_date) as "maxDaysLate"
           from installments i join bookings b on b.id = i.booking_id join parties p on p.id = b.customer_id
          where i.status in ('due','partial') and b.status <> 'cancelled' and app.user_in_scope('deals', b.created_by)
          group by p.id, p.display_name, p.phone_e164
          order by coalesce(sum(i.amount - i.paid_amount) filter (where i.due_date < current_date), 0) desc, sum(i.amount - i.paid_amount) desc`,
      );
      return { rows: r.rows };
    });
  });

  // per project: stock, what is booked, what is collected, what is still to come
  app.get("/v1/reports/sales-summary", { preHandler: guards.inCompany("reports.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select pr.id as "projectId", pr.code, pr.name,
                count(distinct x.id)::int as properties,
                count(distinct x.id) filter (where x.status = 'available')::int as available,
                count(distinct b.id)::int as booked,
                coalesce(sum(x.list_price) filter (where x.status = 'available'), 0) as "availableValue",
                coalesce(sum(b.net_price), 0) as "bookedValue",
                coalesce(sum(s.paid), 0) as received,
                coalesce(sum(s.due), 0) as outstanding
           from projects pr
           left join properties x on x.project_id = pr.id
           left join bookings b on b.property_id = x.id and b.status <> 'cancelled' and app.user_in_scope('deals', b.created_by)
           left join lateral (select sum(i.paid_amount) as paid, sum(i.amount - i.paid_amount) filter (where i.status in ('due','partial')) as due from installments i where i.booking_id = b.id) s on true
          group by pr.id, pr.code, pr.name
          order by pr.name`,
      );
      return { rows: r.rows };
    });
  });

  // money received from customers, by month and by how it was paid
  app.get("/v1/reports/collections", { preHandler: guards.inCompany("reports.view") }, async (req) => {
    const q = parse(range, req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const where = `where r.status = 'posted' and r.received_on between $1 and $2`;
      const months = await c.query(`select to_char(date_trunc('month', r.received_on), 'YYYY-MM') as month, count(*)::int as count, sum(r.amount) as amount from receipts r ${where} group by 1 order by 1`, [q.from, q.to]);
      const methods = await c.query(`select r.method, count(*)::int as count, sum(r.amount) as amount from receipts r ${where} group by 1 order by sum(r.amount) desc`, [q.from, q.to]);
      const top = await c.query(
        `select p.id as "partyId", p.display_name as "customerName", count(*)::int as count, sum(r.amount) as amount from receipts r join parties p on p.id = r.customer_id ${where} group by p.id, p.display_name order by sum(r.amount) desc limit 10`,
        [q.from, q.to],
      );
      return { from: q.from, to: q.to, months: months.rows, methods: methods.rows, topCustomers: top.rows };
    });
  });

  // what the company owes its suppliers, contractors and dealers, from the ledger
  app.get("/v1/reports/payables", { preHandler: guards.inCompany("reports.view") }, async (req) => {
    const q = parse(z.object({ asOf: isoDate }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select p.id as "partyId", p.display_name as "name", p.phone_e164 as phone,
                (select string_agg(distinct pr.role, ', ') from party_roles pr where pr.party_id = p.id and pr.role in ('vendor','contractor','dealer')) as roles,
                sum(l.credit) as billed, sum(l.debit) as paid, sum(l.credit - l.debit) as balance, max(e.entry_date) as "lastActivity"
           from journal_lines l join journal_entries e on e.id = l.entry_id join gl_accounts a on a.id = l.account_id join parties p on p.id = l.party_id
          where a.account_class = 'liability' and e.entry_date <= $1
            and exists (select 1 from party_roles pr where pr.party_id = p.id and pr.role in ('vendor','contractor','dealer'))
          group by p.id, p.display_name, p.phone_e164
         having sum(l.credit - l.debit) <> 0
          order by sum(l.credit - l.debit) desc`,
        [q.asOf],
      );
      return { asOf: q.asOf, rows: r.rows };
    });
  });
}
