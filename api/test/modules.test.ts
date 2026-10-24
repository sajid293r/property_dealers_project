import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ID, startHarness, type Harness } from "./helpers.js";
import { MODULE_KEYS } from "../src/roles.js";

let h: Harness;
const A = ID.coA;
const owner = { as: ID.alice, company: A };

// a second, BASIC-plan organization with one company and its owner
const BASIC = { org: "00000000-0000-0000-0000-0000000000b1", co: "00000000-0000-0000-0000-0000000000b2", role: "b2000000-0000-0000-0000-0000000000b1", user: "a1000000-0000-0000-0000-0000000000b1" };
const basic = { as: BASIC.user, company: BASIC.co };

beforeAll(async () => {
  h = await startHarness();
  await h.admin(async (c) => {
    // the test owner role gets every module (the harness only grants a few)
    for (const m of MODULE_KEYS) {
      await c.query(`insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,$2,true,true,true,true,true,'company') on conflict (role_id,module) do update set can_view=true,can_create=true,can_edit=true,can_delete=true,can_approve=true`, [ID.roleOwner, m]);
    }
    await c.query(`update roles set is_system = true where id = $1`, [ID.roleOwner]);   // like a real standard role
    await c.query(`insert into organizations(id,name,slug,plan) values ($1,'Small Co Group','small-co','basic')`, [BASIC.org]);
    await c.query(`insert into companies(id,org_id,name) values ($1,$2,'Small Co')`, [BASIC.co, BASIC.org]);
    await c.query(`insert into users(id,email,full_name) values ($1,'zed@small.pk','Zed Owner')`, [BASIC.user]);
    await c.query(`insert into roles(id,org_id,name,is_system) values ($1,$2,'Owner',true)`, [BASIC.role, BASIC.org]);
    for (const m of MODULE_KEYS) await c.query(`insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,$2,true,true,true,true,true,'company')`, [BASIC.role, m]);
    await c.query(`insert into company_members(company_id,user_id,role_id) values ($1,$2,$3)`, [BASIC.co, BASIC.user, BASIC.role]);
    await c.query(`select app.seed_company_defaults($1)`, [BASIC.co]);
  });
});
afterAll(async () => {
  await h.close();
});

async function codes(company = A, as = ID.alice): Promise<Record<string, string>> {
  const r = await h.call("GET", "/v1/accounts", { as, company });
  return Object.fromEntries(r.body.map((a: { code: string; id: string }) => [a.code, a.id]));
}

describe("subscription plans are enforced by the server", () => {
  it("reports the plan, its seat limit and which features are included", async () => {
    const p = await h.call("GET", "/v1/plan", basic);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ plan: "basic", name: "Basic", customRoles: false });
    expect(p.body.users).toMatchObject({ used: 1, limit: 3 });
    expect(p.body.features.find((f: { key: string }) => f.key === "leads")).toMatchObject({ included: false, tierName: "Professional" });
    const adv = await h.call("GET", "/v1/plan", owner);
    expect(adv.body).toMatchObject({ plan: "premium", name: "Advanced" });
    expect(adv.body.users).toMatchObject({ limit: 20, included: 20, extra: 0 });
    expect(adv.body.seatPacks).toEqual([{ seats: 3, priceMonthlyPkr: 4000 }, { seats: 5, priceMonthlyPkr: 6000 }, { seats: 10, priceMonthlyPkr: 8000 }]);
  });

  it("refuses a Professional or Advanced feature on a Basic plan with a plain upgrade message", async () => {
    for (const path of ["/v1/leads", "/v1/quotations", "/v1/cheques", "/v1/contracts", "/v1/budgets", "/v1/employees", "/v1/payroll", "/v1/reconciliations/x"]) {
      const r = await h.call("GET", path, basic);
      expect(r.status, path).toBe(403);
      expect(r.body.error.code, path).toBe("plan_upgrade");
    }
    const leads = await h.call("GET", "/v1/leads", basic);
    expect(leads.body.error.message).toContain("Professional plan");
    expect((await h.call("GET", "/v1/budgets", basic)).body.error.message).toContain("Advanced plan");
  });

  it("lets a Basic company use cash and bank vouchers but not sales invoices", async () => {
    const acc = await codes(BASIC.co, BASIC.user);
    const cpv = await h.call("POST", "/v1/vouchers", { ...basic, body: { type: "CPV", date: "2026-10-01", lines: [{ accountId: acc["05.02.02.0001"], debit: "1000" }] } });
    expect(cpv.status).toBe(201);
    const sv = await h.call("POST", "/v1/vouchers", { ...basic, body: { type: "SV", date: "2026-10-01", lines: [{ accountId: acc["04.01.01.0001"], credit: "1000" }] } });
    expect(sv.status).toBe(403);
    expect(sv.body.error.code).toBe("plan_upgrade");
  });

  it("opens those features on the right plan", async () => {
    expect((await h.call("GET", "/v1/leads", owner)).status).toBe(200);
    expect((await h.call("GET", "/v1/budgets", owner)).status).toBe(200);
    expect((await h.call("GET", "/v1/payroll", owner)).status).toBe(200);
  });
});

describe("administration: people, roles, company profile", () => {
  it("invites a colleague by email; they join with that role the first time they sign in", async () => {
    const roles = await h.call("GET", "/v1/roles", owner);
    expect(roles.status).toBe(200);
    expect(roles.body.length).toBeGreaterThan(0);
    const inv = await h.call("POST", "/v1/invites", { ...owner, body: { email: "Newbie@A.pk", roleId: ID.roleViewer } });
    expect(inv.status).toBe(201);
    let m = await h.call("GET", "/v1/members", owner);
    expect(m.body.invites.some((i: { email: string }) => i.email === "newbie@a.pk")).toBe(true);
    expect((await h.call("POST", "/v1/invites", { ...owner, body: { email: "newbie@a.pk", roleId: ID.roleViewer } })).status).toBe(409);

    const NEW = "a1000000-0000-0000-0000-0000000000e1";
    const tok = await h.token(NEW, "newbie@a.pk");
    const me = await h.call("GET", "/v1/me", { headers: { authorization: `Bearer ${tok}` } });
    expect(me.status).toBe(200);
    expect(me.body.companies.map((c: { companyId: string }) => c.companyId)).toContain(A);
    expect(me.body.companies[0].plan).toBe("premium");
    m = await h.call("GET", "/v1/members", owner);
    expect(m.body.members.some((x: { email: string; role: string }) => x.email === "newbie@a.pk" && x.role === "Viewer")).toBe(true);
    expect(m.body.invites.some((i: { email: string }) => i.email === "newbie@a.pk")).toBe(false);
  });

  it("applies the plan's seat limit, counting pending invitations", async () => {
    const roleBasic = BASIC.role;
    expect((await h.call("POST", "/v1/invites", { ...basic, body: { email: "two@small.pk", roleId: roleBasic } })).status).toBe(201);
    expect((await h.call("POST", "/v1/invites", { ...basic, body: { email: "three@small.pk", roleId: roleBasic } })).status).toBe(201);
    const full = await h.call("POST", "/v1/invites", { ...basic, body: { email: "four@small.pk", roleId: roleBasic } });
    expect(full.status).toBe(403);
    expect(full.body.error.code).toBe("plan_limit");
    // buying a 3-seat pack (recorded by support) raises the limit by three
    await h.admin((c) => c.query(`update organizations set extra_seats = 3 where id = $1`, [BASIC.org]));
    const plan = await h.call("GET", "/v1/plan", basic);
    expect(plan.body.users).toMatchObject({ limit: 6, included: 3, extra: 3 });
    expect((await h.call("POST", "/v1/invites", { ...basic, body: { email: "four@small.pk", roleId: roleBasic } })).status).toBe(201);
    await h.admin((c) => c.query(`update organizations set extra_seats = 0 where id = $1`, [BASIC.org]));
  });

  it("changes a role, but never lets the last owner be demoted or a person edit themselves", async () => {
    expect((await h.call("PATCH", `/v1/members/${ID.bob}`, { ...owner, body: { roleId: ID.roleAgent } })).status).toBe(200);
    expect((await h.call("PATCH", `/v1/members/${ID.alice}`, { ...owner, body: { roleId: ID.roleViewer } })).body.error.code).toBe("self_change");
    expect((await h.call("PATCH", `/v1/members/${ID.bob}`, { as: ID.bob, company: A, body: { status: "suspended" } })).status).toBe(403);
  });

  it("builds custom roles on Professional+, not on Basic; standard roles are read-only", async () => {
    const perms = Object.fromEntries(MODULE_KEYS.map((k) => [k, { view: k === "deals", create: false, edit: false, delete: false, approve: false }]));
    const made = await h.call("POST", "/v1/roles", { ...owner, body: { name: "Deals viewer", permissions: perms, scope: "own" } });
    expect(made.status).toBe(201);
    expect(made.body.permissions.deals.view).toBe(true);
    expect(made.body.scope).toBe("own");
    expect((await h.call("POST", "/v1/roles", { ...basic, body: { name: "X role", permissions: perms } })).body.error.code).toBe("plan_upgrade");
    const std = (await h.call("GET", "/v1/roles", owner)).body.find((r: { name: string }) => r.name === "Owner");
    expect((await h.call("PUT", `/v1/roles/${std.id}`, { ...owner, body: { name: "Owner", permissions: perms } })).body.error.code).toBe("system_role");
    expect((await h.call("DELETE", `/v1/roles/${made.body.id}`, owner)).status).toBe(204);
  });

  it("edits the company profile and keeps other companies' profiles apart", async () => {
    const r = await h.call("PATCH", "/v1/company", { ...owner, body: { city: "Lahore", ntn: "1234567-8", voucherSelfApproval: false } });
    expect(r.body).toMatchObject({ city: "Lahore", ntn: "1234567-8" });
    const g = await h.call("GET", "/v1/company", owner);
    expect(g.body.voucherSelfApproval).toBe(false);
    expect((await h.call("GET", "/v1/company", { as: ID.carol, company: ID.coB })).body.city).not.toBe("Lahore");
    await h.call("PATCH", "/v1/company", { ...owner, body: { voucherSelfApproval: true } });
  });
});

describe("sales pipeline: leads → quotation → booking, cheques, service invoices, contracts", () => {
  it("takes a lead through the pipeline and turns an accepted quotation into a booking with its payment plan", async () => {
    const lead = await h.call("POST", "/v1/leads", { ...owner, body: { name: "Tariq Mehmood", phone: "0300-5551212", source: "walk_in", budgetMax: "3000000", interestProjectId: ID.prjA } });
    expect(lead.status).toBe(201);
    expect(lead.body.leadNo).toMatch(/^LEAD-/);
    expect(lead.body.phone).toBe("+923005551212");
    const call = await h.call("POST", `/v1/leads/${lead.body.id}/activities`, { ...owner, body: { kind: "call", note: "Interested in a corner plot", nextFollowup: "2026-10-25" } });
    expect(call.body.stage).toBe("contacted");
    expect((await h.call("POST", `/v1/leads/${lead.body.id}/stage`, { ...owner, body: { stage: "lost" } })).status).toBe(400);

    const q = await h.call("POST", "/v1/quotations", { ...owner, body: { leadId: lead.body.id, propertyId: ID.propA(5), validUntil: "2099-01-01", discount: "50000", downPayment: "200000", installments: 4, firstDue: "2099-02-01" } });
    expect(q.status).toBe(201);
    expect(q.body.netPrice).toBe("950000.00");
    const ok = await h.call("POST", `/v1/quotations/${q.body.id}/accept`, owner);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("accepted");
    const booking = await h.call("GET", `/v1/bookings/${ok.body.bookingId}`, owner);
    expect(booking.body.installments).toHaveLength(5);
    expect(booking.body.customerName).toBe("Tariq Mehmood");
    const after = await h.call("GET", `/v1/leads/${lead.body.id}`, owner);
    expect(after.body.stage).toBe("won");
    expect(after.body.partyId).toBeTruthy();
  });

  it("registers a received cheque, deposits it and records the receipt when it clears", async () => {
    const banks = await h.call("POST", "/v1/bank-accounts", { ...owner, body: { bankName: "Test Bank", accountTitle: "Company A", accountNo: "00112233" } });
    expect(banks.status).toBe(201);
    const bk = await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: ID.propA(4), customerId: ID.custA, paymentType: "installment" } });
    await h.call("POST", `/v1/bookings/${bk.body.id}/schedule`, { ...owner, body: { downPayment: "100000", installments: 2, firstDue: "2099-01-01" } });
    const ch = await h.call("POST", "/v1/cheques", { ...owner, body: { chequeNo: "445566", bankName: "HBL", partyId: ID.custA, bookingId: bk.body.id, amount: "100000", chequeDate: "2026-11-01" } });
    expect(ch.status).toBe(201);
    expect((await h.call("POST", `/v1/cheques/${ch.body.id}/clear`, owner)).status).toBe(409);
    const dep = await h.call("POST", `/v1/cheques/${ch.body.id}/deposit`, { ...owner, body: { bankAccountId: banks.body.id } });
    expect(dep.body.status).toBe("deposited");
    const clr = await h.call("POST", `/v1/cheques/${ch.body.id}/clear`, owner);
    expect(clr.body.status).toBe("cleared");
    expect(clr.body.receiptId).toBeTruthy();
    const paid = await h.call("GET", `/v1/bookings/${bk.body.id}`, owner);
    expect(Number(paid.body.paidAmount)).toBe(100000);
  });

  it("issues a service invoice, takes a part payment, and voids what is unpaid", async () => {
    const inv = await h.call("POST", "/v1/service-invoices", { ...owner, body: { customerId: ID.custA, periodLabel: "October 2026", dueDate: "2026-11-15", amount: "15000", description: "Maintenance" } });
    expect(inv.status).toBe(201);
    expect(inv.body.status).toBe("unpaid");
    const pay = await h.call("POST", `/v1/service-invoices/${inv.body.id}/payments`, { ...owner, body: { amount: "5000", method: "cash" } });
    expect(pay.body).toMatchObject({ status: "partial" });
    expect(Number(pay.body.balance)).toBe(10000);
    expect((await h.call("POST", `/v1/service-invoices/${inv.body.id}/payments`, { ...owner, body: { amount: "999999", method: "cash" } })).status).toBeGreaterThanOrEqual(400);
    expect((await h.call("POST", `/v1/service-invoices/${inv.body.id}/void`, { ...owner, body: { reason: "wrong" } })).status).toBeGreaterThanOrEqual(400);
    const other = await h.call("POST", "/v1/service-invoices", { ...owner, body: { customerId: ID.custA, dueDate: "2026-11-15", amount: "2000" } });
    expect((await h.call("POST", `/v1/service-invoices/${other.body.id}/void`, { ...owner, body: { reason: "Raised by mistake" } })).body.status).toBe("void");
  });

  it("keeps contracts and reads an overdue one as expired", async () => {
    const c = await h.call("POST", "/v1/contracts", { ...owner, body: { kind: "rent", title: "Shop 4 tenancy", partyId: ID.custA, startDate: "2025-01-01", endDate: "2025-12-31", signedOn: "2024-12-20", value: "600000" } });
    expect(c.status).toBe(201);
    expect(c.body.effectiveStatus).toBe("expired");
    const d = await h.call("POST", "/v1/contracts", { ...owner, body: { kind: "service", title: "Security services", startDate: "2026-10-01" } });
    expect(d.body.status).toBe("draft");
    expect((await h.call("POST", `/v1/contracts/${d.body.id}/sign`, owner)).body.status).toBe("active");
    expect((await h.call("POST", `/v1/contracts/${d.body.id}/terminate`, { ...owner, body: {} })).status).toBe(400);
    expect((await h.call("POST", `/v1/contracts/${d.body.id}/terminate`, { ...owner, body: { reason: "Service no longer needed" } })).body.status).toBe("terminated");
  });
});

describe("people and projects: staff, leave, payroll, contractors", () => {
  it("runs a month of payroll end to end and posts it to the books", async () => {
    const e1 = await h.call("POST", "/v1/employees", { ...owner, body: { fullName: "Sana Iqbal", joinDate: "2026-01-01", basicSalary: "90000", houseAllowance: "10000", incomeTax: "3000", designation: "Accountant" } });
    expect(e1.status).toBe(201);
    expect(e1.body.empNo).toMatch(/^EMP-/);
    expect(Number(e1.body.grossSalary)).toBe(100000);
    const types = await h.call("GET", "/v1/leave/types", owner);
    const annual = types.body.find((t: { code: string }) => t.code === "annual");
    const lv = await h.call("POST", "/v1/leave/requests", { ...owner, body: { employeeId: e1.body.id, leaveTypeId: annual.id, fromDate: "2026-09-07", toDate: "2026-09-09", reason: "Family" } });
    expect(lv.status).toBe(201);
    expect((await h.call("POST", "/v1/leave/requests", { ...owner, body: { employeeId: e1.body.id, leaveTypeId: annual.id, fromDate: "2026-09-08", toDate: "2026-09-10" } })).status).toBeGreaterThanOrEqual(400);
    expect((await h.call("POST", `/v1/leave/requests/${lv.body.id}/decide`, { ...owner, body: { approve: true } })).body.status).toBe("approved");
    const bal = await h.call("GET", "/v1/leave/balances", owner);
    expect(bal.body.find((b: { code: string; employeeId: string }) => b.code === "annual" && b.employeeId === e1.body.id)).toMatchObject({ taken: "3.0" });

    const run = await h.call("POST", "/v1/payroll", { ...owner, body: { month: "2026-10" } });
    expect(run.status).toBe(201);
    const line = run.body.lines.find((l: { employeeId: string }) => l.employeeId === e1.body.id);
    expect(Number(line.net)).toBe(97000);
    const withBonus = await h.call("PATCH", `/v1/payroll/${run.body.id}/lines/${line.id}`, { ...owner, body: { bonus: "5000" } });
    expect(Number(withBonus.body.lines.find((l: { id: string }) => l.id === line.id).net)).toBe(102000);
    const ap = await h.call("POST", `/v1/payroll/${run.body.id}/approve`, owner);
    expect(ap.body.status).toBe("approved");
    expect((await h.call("PATCH", `/v1/payroll/${run.body.id}/lines/${line.id}`, { ...owner, body: { bonus: "1" } })).status).toBe(409);
    expect((await h.call("DELETE", `/v1/payroll/${run.body.id}`, owner)).status).toBe(409);
    const paid = await h.call("POST", `/v1/payroll/${run.body.id}/pay`, owner);
    expect(paid.body.status).toBe("paid");
    const tb = await h.call("GET", "/v1/reports/trial-balance?from=2026-10-01&to=2026-10-31", owner);
    const salaries = tb.body.rows.find((r: { code: string }) => r.code === "05.02.04.0001");
    expect(Number(salaries.debit)).toBeGreaterThanOrEqual(105000);
  });

  it("bills a contractor against a contract: retention held, cost on the project, over-billing refused", async () => {
    const cp = await h.call("POST", "/v1/parties", { ...owner, body: { name: "Al-Madina Builders", roles: ["contractor"] } });
    const k = await h.call("POST", "/v1/construction/contracts", { ...owner, body: { contractorId: cp.body.id, projectId: ID.prjA, title: "Main boulevard", contractValue: "2000000", retentionPct: 10, startDate: "2026-10-01" } });
    expect(k.status).toBe(201);
    const b1 = await h.call("POST", `/v1/construction/contracts/${k.body.id}/bills`, { ...owner, body: { billDate: "2026-10-15", grossAmount: "500000", description: "Earthwork" } });
    expect(b1.status).toBe(201);
    const bill = b1.body.bills[0];
    expect(Number(bill.retentionAmount)).toBe(50000);
    const ap = await h.call("POST", `/v1/construction/bills/${bill.id}/approve`, owner);
    expect(Number(ap.body.billed)).toBe(500000);
    expect(Number(ap.body.retentionHeld)).toBe(50000);
    const big = await h.call("POST", `/v1/construction/contracts/${k.body.id}/bills`, { ...owner, body: { billDate: "2026-10-20", grossAmount: "1800000" } });
    const bigId = big.body.bills.find((x: { status: string }) => x.status === "draft").id;
    expect((await h.call("POST", `/v1/construction/bills/${bigId}/approve`, owner)).status).toBe(422);
    const list = await h.call("GET", "/v1/contractors", owner);
    const row = list.body.find((x: { id: string }) => x.id === cp.body.id);
    expect(Number(row.owed)).toBe(450000);
    expect(Number(row.retentionHeld)).toBe(50000);
    // the cost shows against the project, and paying the contractor is an ordinary payment voucher
    const acc = await codes();
    const pay = await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "CPV", date: "2026-10-28", partyId: cp.body.id, lines: [{ accountId: acc["02.01.01.0006"], debit: "200000", partyId: cp.body.id }] } });
    expect(pay.status).toBe(201);
    await h.call("POST", `/v1/vouchers/${pay.body.id}/submit`, owner);
    expect((await h.call("POST", `/v1/vouchers/${pay.body.id}/approve`, owner)).status).toBe(200);
    const after = (await h.call("GET", "/v1/contractors", owner)).body.find((x: { id: string }) => x.id === cp.body.id);
    expect(Number(after.owed)).toBe(250000);
  });
});

describe("budgets", () => {
  it("creates, submits and approves a budget, then blocks spending beyond it", async () => {
    const acc = await codes();
    const b = await h.call("POST", "/v1/budgets", {
      ...owner,
      body: { name: "Office FY26-27", kind: "operating", periodStart: "2026-07-01", periodEnd: "2027-06-30", controlMode: "block", lines: [{ category: "Printing", accountId: acc["05.02.01.0003"], amount: "10000" }] },
    });
    expect(b.status).toBe(201);
    expect(b.body.budgetNo).toMatch(/^BUD-/);
    expect(Number(b.body.totalAmount)).toBe(10000);
    expect((await h.call("POST", `/v1/budgets/${b.body.id}/approve`, owner)).status).toBeGreaterThanOrEqual(400);   // not submitted yet
    expect((await h.call("POST", `/v1/budgets/${b.body.id}/submit`, owner)).body.status).toBe("submitted");
    const ap = await h.call("POST", `/v1/budgets/${b.body.id}/approve`, owner);
    expect(ap.body.status).toBe("approved");
    expect((await h.call("PUT", `/v1/budgets/${b.body.id}/lines`, { ...owner, body: { lines: [] } })).status).toBe(409);

    const fits = await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "CPV", date: "2026-10-10", lines: [{ accountId: acc["05.02.01.0003"], debit: "4000" }] } });
    await h.call("POST", `/v1/vouchers/${fits.body.id}/submit`, owner);
    expect((await h.call("POST", `/v1/vouchers/${fits.body.id}/approve`, owner)).status).toBe(200);
    const over = await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "CPV", date: "2026-10-11", lines: [{ accountId: acc["05.02.01.0003"], debit: "9000" }] } });
    await h.call("POST", `/v1/vouchers/${over.body.id}/submit`, owner);
    const refused = await h.call("POST", `/v1/vouchers/${over.body.id}/approve`, owner);
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("over_budget");

    const detail = await h.call("GET", `/v1/budgets/${b.body.id}`, owner);
    expect(Number(detail.body.lines[0].actual)).toBe(4000);
    expect(Number(detail.body.lines[0].available)).toBe(6000);

    // more money through a revision (a second person, or the same one while the company allows self-approval)
    const rev = await h.call("POST", `/v1/budgets/${b.body.id}/revisions`, { ...owner, body: { type: "supplementary", reason: "Extra printing for the launch", lines: [{ budgetLineId: detail.body.lines[0].id, delta: "5000" }] } });
    expect(rev.status).toBe(201);
    const revId = rev.body.revisions[0].id;
    const done = await h.call("POST", `/v1/budget-revisions/${revId}/approve`, owner);
    expect(Number(done.body.totalAmount)).toBe(15000);
    expect((await h.call("POST", `/v1/vouchers/${over.body.id}/approve`, owner)).status).toBe(200);   // now it fits
  });
});
