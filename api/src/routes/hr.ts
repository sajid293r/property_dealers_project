import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

const EMP_COLUMNS = `id, emp_no as "empNo", full_name as "fullName", phone, email, cnic_last4 as "cnicLast4", designation, department, join_date as "joinDate",
  status, left_on as "leftOn", basic_salary as "basicSalary", house_allowance as "houseAllowance", transport_allowance as "transportAllowance",
  other_allowance as "otherAllowance", income_tax as "incomeTax", bank_account_no as "bankAccountNo", notes,
  (basic_salary + house_allowance + transport_allowance + other_allowance) as "grossSalary", created_at as "createdAt"`;

const empBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(120).optional(),
  cnicLast4: z.string().regex(/^[0-9]{4}$/).optional(),
  designation: z.string().trim().max(80).optional(),
  department: z.string().trim().max(80).optional(),
  joinDate: isoDate,
  basicSalary: money.default("0"),
  houseAllowance: money.default("0"),
  transportAllowance: money.default("0"),
  otherAllowance: money.default("0"),
  incomeTax: money.default("0"),
  bankAccountNo: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
});

async function runDetail(c: Queryable, id: string) {
  const r = await c.query(
    `select id, run_no as "runNo", month, status, total_gross as "totalGross", total_tax as "totalTax", total_net as "totalNet",
            paid_on as "paidOn", approved_at as "approvedAt", created_at as "createdAt" from payroll_runs where id = $1`,
    [id],
  );
  if (!r.rows[0]) throw new AppError(404, "not_found", "Payroll not found.");
  const lines = await c.query(
    `select l.id, l.employee_id as "employeeId", e.full_name as "fullName", e.emp_no as "empNo", e.designation, l.basic, l.allowances, l.bonus,
            l.unpaid_leave_days as "unpaidLeaveDays", l.unpaid_deduction as "unpaidDeduction", l.tax, l.net
       from payroll_lines l join employees e on e.id = l.employee_id where l.run_id = $1 order by e.emp_no`,
    [id],
  );
  return { ...r.rows[0], lines: lines.rows };
}

export function hrRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  // ───────────────────────────── staff
  app.get("/v1/employees", { preHandler: guards.inCompany("staff.view") }, async (req) => {
    const q = parse(paging.extend({ status: z.enum(["active", "resigned", "terminated"]).optional(), search: z.string().trim().max(80).optional(), limit: z.coerce.number().int().min(1).max(200).default(200) }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${EMP_COLUMNS} from employees
          where ($1::text is null or status = $1) and ($2::text is null or full_name ilike '%' || $2 || '%' or emp_no ilike '%' || $2 || '%' or coalesce(designation, '') ilike '%' || $2 || '%')
          order by status, emp_no limit $3 offset $4`,
        [q.status ?? null, q.search ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.post("/v1/employees", { preHandler: guards.inCompany("staff.create") }, async (req, reply) => {
    const b = parse(empBody, req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `insert into employees (company_id, emp_no, full_name, phone, email, cnic_last4, designation, department, join_date, basic_salary, house_allowance, transport_allowance, other_allowance, income_tax, bank_account_no, notes, created_by)
         values ($1, app.next_doc_no($1, 'EMP'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
        [ctx.companyId, b.fullName, b.phone ?? null, b.email ?? null, b.cnicLast4 ?? null, b.designation ?? null, b.department ?? null, b.joinDate, b.basicSalary, b.houseAllowance, b.transportAllowance, b.otherAllowance, b.incomeTax, b.bankAccountNo ?? null, b.notes ?? null, ctx.userId],
      );
      return (await c.query(`select ${EMP_COLUMNS} from employees where id = $1`, [r.rows[0]!.id])).rows[0];
    });
    return reply.code(201).send(out);
  });

  app.patch("/v1/employees/:id", { preHandler: guards.inCompany("staff.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(empBody.partial().extend({ status: z.enum(["active", "resigned", "terminated"]).optional(), leftOn: isoDate.optional() }), req.body);
    const cols: Record<string, string> = {
      fullName: "full_name", phone: "phone", email: "email", cnicLast4: "cnic_last4", designation: "designation", department: "department", joinDate: "join_date",
      basicSalary: "basic_salary", houseAllowance: "house_allowance", transportAllowance: "transport_allowance", otherAllowance: "other_allowance",
      incomeTax: "income_tax", bankAccountNo: "bank_account_no", notes: "notes", status: "status", leftOn: "left_on",
    };
    const sets: string[] = [];
    const vals: unknown[] = [id];
    for (const [k, col] of Object.entries(cols)) {
      const v = (b as Record<string, unknown>)[k];
      if (v === undefined) continue;
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
    return db.inTenant(ctxOf(req), async (c) => {
      if (sets.length) await c.query(`update employees set ${sets.join(", ")} where id = $1`, vals);
      const r = await c.query(`select ${EMP_COLUMNS} from employees where id = $1`, [id]);
      if (!r.rows[0]) throw new AppError(404, "not_found", "Employee not found.");
      return r.rows[0];
    });
  });

  // ───────────────────────────── leave
  app.get("/v1/leave/types", { preHandler: guards.inCompany("leave.view") }, async (req) => {
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await c.query(`select app.seed_leave_types($1)`, [ctx.companyId]);
      const r = await c.query(`select id, code, name, annual_days as "annualDays", paid from leave_types where active order by paid desc, name`);
      return r.rows;
    });
  });

  app.get("/v1/leave/balances", { preHandler: guards.inCompany("leave.view") }, async (req) => {
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await c.query(`select app.seed_leave_types($1)`, [ctx.companyId]);
      const r = await c.query(
        `select employee_id as "employeeId", full_name as "fullName", leave_type_id as "leaveTypeId", code, leave_type as "leaveType", paid, year, entitled, taken, pending, remaining from v_leave_balances order by full_name, paid desc, leave_type`,
      );
      return r.rows;
    });
  });

  const LEAVE_COLUMNS = `r.id, r.employee_id as "employeeId", e.full_name as "employeeName", e.designation, r.leave_type_id as "leaveTypeId", t.name as "leaveType", t.paid,
    r.from_date as "fromDate", r.to_date as "toDate", r.days, r.reason, r.status, r.decided_at as "decidedAt", u.full_name as "decidedBy", r.decision_note as "decisionNote", r.created_at as "createdAt"`;
  const LEAVE_FROM = `leave_requests r join employees e on e.id = r.employee_id join leave_types t on t.id = r.leave_type_id left join users u on u.id = r.decided_by`;

  app.get("/v1/leave/requests", { preHandler: guards.inCompany("leave.view") }, async (req) => {
    const q = parse(paging.extend({ status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(), employeeId: uuid.optional(), limit: z.coerce.number().int().min(1).max(200).default(200) }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${LEAVE_COLUMNS} from ${LEAVE_FROM} where ($1::text is null or r.status = $1) and ($2::uuid is null or r.employee_id = $2) order by r.from_date desc limit $3 offset $4`,
        [q.status ?? null, q.employeeId ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.post("/v1/leave/requests", { preHandler: guards.inCompany("leave.create") }, async (req, reply) => {
    const b = parse(z.object({ employeeId: uuid, leaveTypeId: uuid, fromDate: isoDate, toDate: isoDate, days: z.number().min(0.5).max(366).optional(), reason: z.string().trim().max(300).optional() }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(`select app.request_leave($1,$2,$3,$4,$5,$6,$7) as id`, [b.employeeId, b.leaveTypeId, b.fromDate, b.toDate, b.days ?? null, b.reason ?? null, ctx.userId]);
      return (await c.query(`select ${LEAVE_COLUMNS} from ${LEAVE_FROM} where r.id = $1`, [r.rows[0]!.id])).rows[0];
    });
    return reply.code(201).send(out);
  });

  app.post("/v1/leave/requests/:id/decide", { preHandler: guards.inCompany("leave.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() }), req.body);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await c.query(`select app.decide_leave($1, $2, $3, $4)`, [id, b.approve, b.note ?? null, ctx.userId]);
      return (await c.query(`select ${LEAVE_COLUMNS} from ${LEAVE_FROM} where r.id = $1`, [id])).rows[0];
    });
  });

  app.post("/v1/leave/requests/:id/cancel", { preHandler: guards.inCompany("leave.create") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(`update leave_requests set status = 'cancelled' where id = $1 and status in ('pending','approved') returning id`, [id]);
      if (!r.rows[0]) throw new AppError(409, "not_cancellable", "This request can no longer be cancelled.");
      return (await c.query(`select ${LEAVE_COLUMNS} from ${LEAVE_FROM} where r.id = $1`, [id])).rows[0];
    });
  });

  // ───────────────────────────── payroll
  app.get("/v1/payroll", { preHandler: guards.inCompany("payroll.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select id, run_no as "runNo", month, status, total_gross as "totalGross", total_tax as "totalTax", total_net as "totalNet", paid_on as "paidOn",
                (select count(*)::int from payroll_lines l where l.run_id = r.id) as "employees"
           from payroll_runs r order by month desc limit 60`,
      );
      return r.rows;
    });
  });

  app.get("/v1/payroll/:id", { preHandler: guards.inCompany("payroll.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => runDetail(c, id));
  });

  app.post("/v1/payroll", { preHandler: guards.inCompany("payroll.create") }, async (req, reply) => {
    const b = parse(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be a month like 2026-10") }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(`select app.create_payroll_run($1, $2, $3) as id`, [ctx.companyId, b.month, ctx.userId]);
      return runDetail(c, r.rows[0]!.id);
    });
    return reply.code(201).send(out);
  });

  // a bonus or a different tax amount for one person, while the payroll is still a draft
  app.patch("/v1/payroll/:id/lines/:lineId", { preHandler: guards.inCompany("payroll.edit") }, async (req) => {
    const p = parse(z.object({ id: uuid, lineId: uuid }), req.params);
    const b = parse(z.object({ bonus: money.optional(), tax: money.optional() }), req.body);
    return db.inTenant(ctxOf(req), async (c) => {
      const run = await c.query<{ status: string }>(`select status from payroll_runs where id = $1`, [p.id]);
      if (!run.rows[0]) throw new AppError(404, "not_found", "Payroll not found.");
      if (run.rows[0].status !== "draft") throw new AppError(409, "not_draft", "Only a draft payroll can be changed.");
      await c.query(`update payroll_lines set bonus = coalesce($3::numeric, bonus), tax = coalesce($4::numeric, tax) where id = $2 and run_id = $1`, [p.id, p.lineId, b.bonus ?? null, b.tax ?? null]);
      return runDetail(c, p.id);
    });
  });

  app.post("/v1/payroll/:id/approve", { preHandler: guards.inCompany("payroll.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      await c.query(`select app.approve_payroll($1, $2)`, [id, ctx.userId]);
      return runDetail(c, id);
    });
  });

  app.post("/v1/payroll/:id/pay", { preHandler: guards.inCompany("payroll.approve") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ bankAccountId: uuid.optional(), date: isoDate.optional() }), req.body ?? {});
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      let account: string | null = null;
      if (b.bankAccountId) account = (await c.query<{ g: string }>(`select gl_account_id as g from bank_accounts where id = $1`, [b.bankAccountId])).rows[0]?.g ?? null;
      else account = (await c.query<{ id: string }>(`select id from gl_accounts where code = '03.01.01.0001' and not is_group`)).rows[0]?.id ?? null;
      if (!account) throw new AppError(422, "validation", "Choose the account the salaries are paid from.");
      await c.query(`select app.pay_payroll($1, $2, $3::date, $4)`, [id, account, b.date ?? null, ctx.userId]);
      return runDetail(c, id);
    });
  });

  app.delete("/v1/payroll/:id", { preHandler: guards.inCompany("payroll.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    await db.inTenant(ctxOf(req), (c) => c.query(`select app.discard_payroll($1)`, [id]));
    return reply.code(204).send();
  });
}
