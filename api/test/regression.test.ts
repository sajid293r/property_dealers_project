import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ID, startHarness, type Harness } from "./helpers.js";
import { MODULE_KEYS } from "../src/roles.js";

/**
 * Regression tests for the production QA findings (docs/QA_REPORT.md). One describe per bug, named after it.
 */
let h: Harness;
const A = ID.coA;
const B = ID.coB;
const owner = { as: ID.alice, company: A };

beforeAll(async () => {
  h = await startHarness();
  await h.admin(async (c) => {
    await c.query(`update roles set is_system = true where id = $1`, [ID.roleOwner]);
    for (const m of MODULE_KEYS) {
      await c.query(
        `insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,$2,true,true,true,true,true,'company')
         on conflict (role_id,module) do update set can_view=true,can_create=true,can_edit=true,can_delete=true,can_approve=true`,
        [ID.roleOwner, m],
      );
    }
  });
});
afterAll(async () => {
  await h.close();
});

async function leafAccounts(company = A, as = ID.alice) {
  const r = await h.call("GET", "/v1/accounts", { as, company });
  return r.body.filter((a: { isGroup?: boolean }) => !a.isGroup) as { id: string; code: string }[];
}

async function approvedVoucher(amount = "777.00") {
  const [a, b] = await leafAccounts();
  const v = (await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", description: "QA regression", lines: [{ accountId: a!.id, debit: amount }, { accountId: b!.id, credit: amount }] } })).body;
  await h.call("POST", `/v1/vouchers/${v.id}/submit`, owner);
  const ap = await h.call("POST", `/v1/vouchers/${v.id}/approve`, { ...owner, body: {} });
  expect(ap.status).toBe(200);
  return v as { id: string; number: string };
}
const tbDebit = async () => Number((await h.call("GET", "/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31", owner)).body.totals.debit);

describe("BUG-002: every reference between tenant tables is company-checked", () => {
  it("v_tenant_fk_gaps is empty: no single-column reference between tenant tables is left", async () => {
    const gaps = await h.admin(async (c) => (await c.query(`select child_table, child_column, parent_table from v_tenant_fk_gaps`)).rows);
    expect(gaps).toEqual([]);
  });

  it("a budget cannot name another company's project (the QA finding)", async () => {
    const r = await h.call("POST", "/v1/budgets", { ...owner, body: { name: "QA cross budget", kind: "project", projectId: ID.prjB } });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("unknown_reference");
    const own = await h.call("POST", "/v1/budgets", { ...owner, body: { name: "QA own budget", kind: "project", projectId: ID.prjA } });
    expect(own.status).toBe(201);
  });

  it("budget lines cannot use another company's account, and the database says so even without the API", async () => {
    const bAcc = (await leafAccounts(B, ID.carol))[0]!;
    const r = await h.call("POST", "/v1/budgets", { ...owner, body: { name: "QA cross line", kind: "operating", periodStart: "2026-07-01", periodEnd: "2027-06-30", lines: [{ category: "x", accountId: bAcc.id, amount: "5" }] } });
    expect(r.status).toBeGreaterThanOrEqual(400);
    const proj = (await h.call("POST", "/v1/projects", { ...owner, body: { name: "QA budget host project" } })).body;
    const host = await h.call("POST", "/v1/budgets", { ...owner, body: { name: "QA line host", kind: "project", projectId: proj.id } });
    expect(host.status).toBe(201);
    const own = host.body;
    await expect(h.admin((c) => c.query(`insert into budget_lines (company_id, budget_id, line_no, category, account_id, budget_amount) values ($1,$2,1,'x',$3,5)`, [A, own.id, bAcc.id]))).rejects.toThrow(/tenant_fk|foreign key/);
  });

  it("property ownership and encumbrance cannot name another company's party", async () => {
    const own = await h.call("POST", `/v1/properties/${ID.propA(1)}/ownership`, { ...owner, body: { ownerPartyId: ID.custB, acquisitionType: "purchase", fromDate: "2026-01-01" } });
    expect(own.status).toBe(422);
    const enc = await h.call("POST", `/v1/properties/${ID.propA(1)}/encumbrances`, { ...owner, body: { kind: "mortgage", holderPartyId: ID.custB, since: "2026-01-01" } });
    expect(enc.status).toBe(422);
    const ok = await h.call("POST", `/v1/properties/${ID.propA(1)}/ownership`, { ...owner, body: { ownerPartyId: ID.custA, acquisitionType: "purchase", fromDate: "2026-01-01" } });
    expect(ok.status).toBeLessThan(300);
  });

  it("an account heading cannot be put under another company's heading, and a booking cannot cross over", async () => {
    const bGroup = (await h.call("GET", "/v1/accounts", { as: ID.carol, company: B })).body.find((a: { isGroup?: boolean; code: string }) => a.isGroup && a.code.split(".").length === 3);
    const r = await h.call("POST", "/v1/accounts", { ...owner, body: { parentId: bGroup.id, name: "QA stray account" } });
    expect(r.status).toBe(404);
    const b = await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: ID.propB1, customerId: ID.custA, paymentType: "cash" } });
    expect(b.status).toBeGreaterThanOrEqual(400);
  });
});

describe("BUG-003: a Sales Agent (scope: own) cannot touch anything on someone else's booking", () => {
  // An agent with every Deals/Accounts permission but the scope "own" on Deals, so only the data scope can refuse.
  const AGENT = "a7000000-0000-0000-0000-000000000001";
  const ROLE = "b7000000-0000-0000-0000-000000000001";
  const agent = { as: AGENT, company: A };
  const cc: Record<string, any> = {};
  const call = async (method: any, url: string, who: { as: string; company: string }, body?: unknown) => h.call(method, url, { ...who, body });

  beforeAll(async () => {
    await h.admin(async (c) => {
      await c.query(`insert into users(id,email,full_name) values ($1,'agent@a.pk','Power Agent')`, [AGENT]);
      await c.query(`insert into roles(id,org_id,name) values ($1,$2,'Power Agent')`, [ROLE, ID.org]);
      await c.query(`insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,'deals',true,true,true,false,true,'own'),($1,'accounts',true,true,true,false,true,'company'),($1,'customers',true,true,true,false,false,'company'),($1,'inventory',true,true,true,false,false,'company'),($1,'crm',true,true,true,false,false,'own')`, [ROLE]);
      await c.query(`insert into company_members(company_id,user_id,role_id) values ($1,$2,$3)`, [A, AGENT, ROLE]);
    });
    // alice's booking with everything hanging off it
    const cust = (await h.call("POST", "/v1/parties", { ...owner, body: { name: "Scope Customer", roles: ["customer"], phone: "0300-7770001" } })).body;
    const dealer = (await h.call("POST", "/v1/parties", { ...owner, body: { name: "Scope Dealer", roles: ["dealer"] } })).body;
    const mk = async (title: string, extra: object = {}) => {
      const p = (await h.call("POST", "/v1/properties", { ...owner, body: { title, typeId: ID.typeA, projectId: ID.prjA, listPrice: "100000" } })).body;
      const b = (await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: p.id, customerId: cust.id, paymentType: "installment", ...extra } })).body;
      await h.call("POST", `/v1/bookings/${b.id}/schedule`, { ...owner, body: { downPayment: "10000", installments: 3, firstDue: "2020-01-01" } });
      return { p, b };
    };
    cc.cust = cust;
    const main = await mk("Scope plot 1", { dealerId: dealer.id });
    cc.booking = main.b.id;
    cc.inst = (await h.call("GET", `/v1/bookings/${main.b.id}`, owner)).body.installments;
    cc.receipt = (await h.call("POST", "/v1/receipts", { ...owner, body: { bookingId: main.b.id, amount: "500", method: "cash" } })).body.id;
    await h.call("POST", `/v1/installments/${cc.inst[1].id}/penalty`, { ...owner, body: { amount: "50" } });
    cc.penalty = (await h.call("GET", `/v1/bookings/${main.b.id}/extras`, owner)).body.penalties[0].id;
    cc.commission = (await h.call("POST", `/v1/bookings/${main.b.id}/commission`, { ...owner, body: { ratePct: 2 } })).status;
    cc.cheque = (await h.call("POST", "/v1/cheques", { ...owner, body: { chequeNo: "SC-1", bankName: "HBL", partyId: cust.id, bookingId: main.b.id, amount: "100", chequeDate: "2026-12-01" } })).body.id;
    cc.attachment = (await h.call("POST", "/v1/attachments", { ...owner, body: { entityType: "booking", entityId: main.b.id, fileName: "a.pdf", mime: "application/pdf", data: Buffer.from("%PDF-1.4 test").toString("base64") } })).body.id;
    await h.call("POST", "/v1/reminders", { ...owner, body: { bookingId: main.b.id, channel: "call" } });
    const gone = await mk("Scope plot 2");
    cc.cancelled = gone.b.id;
    await h.call("POST", `/v1/receipts`, { ...owner, body: { bookingId: gone.b.id, amount: "1000", method: "cash" } });
    await h.call("POST", `/v1/bookings/${gone.b.id}/status`, { ...owner, body: { to: "cancelled", reason: "scope test" } });
    await h.call("POST", `/v1/bookings/${gone.b.id}/refund`, { ...owner, body: { refundAmount: "500" } });
    cc.refund = (await h.call("GET", `/v1/bookings/${gone.b.id}/extras`, owner)).body.refunds[0].id;
    const hold = await h.call("POST", `/v1/properties/${ID.propA(5)}/holds`, { ...owner, body: {} });
    cc.hold = hold.body.holdId;
    // the agent's own booking, for the positive controls
    const own = await h.call("POST", "/v1/properties", { ...owner, body: { title: "Agent plot", typeId: ID.typeA, projectId: ID.prjA, listPrice: "50000" } });
    const mine = (await h.call("POST", "/v1/bookings", { ...agent, body: { propertyId: own.body.id, customerId: cust.id, paymentType: "installment" } })).body;
    await h.call("POST", `/v1/bookings/${mine.id}/schedule`, { ...agent, body: { downPayment: "5000", installments: 2, firstDue: "2027-01-01" } });
    cc.mine = mine.id;
    cc.mineInst = (await h.call("GET", `/v1/bookings/${mine.id}`, agent)).body.installments;
  });

  it("setup really made a commission, a refund and a late fee on the colleague's booking", () => {
    expect(cc.commission).toBe(201);
    expect(cc.refund).toBeTruthy();
    expect(cc.penalty).toBeTruthy();
    expect(cc.hold).toBeTruthy();
  });

  it("cannot see the booking, its receipts, extras, reminders, cheques or files", async () => {
    expect((await call("GET", `/v1/bookings/${cc.booking}`, agent)).status).toBe(404);
    expect((await call("GET", `/v1/bookings/${cc.booking}/extras`, agent)).status).toBe(404);
    expect((await call("GET", `/v1/receipts/${cc.receipt}`, agent)).status).toBe(404);
    expect((await call("GET", `/v1/receipts?bookingId=${cc.booking}`, agent)).body).toEqual([]);
    const all = (await call("GET", "/v1/receipts", agent)).body;
    expect(all.every((r: { bookingId: string }) => r.bookingId !== cc.booking && r.bookingId !== cc.cancelled)).toBe(true);
    expect((await call("GET", `/v1/reminders?bookingId=${cc.booking}`, agent)).status).toBe(404);
    const cheques = (await call("GET", "/v1/cheques", agent)).body;
    expect(cheques.some((x: { id: string }) => x.id === cc.cheque)).toBe(false);
    expect((await call("GET", `/v1/attachments?entityType=booking&entityId=${cc.booking}`, agent)).status).toBe(404);
    expect((await call("GET", `/v1/attachments/${cc.attachment}/file`, agent)).status).toBe(404);
    const com = (await call("GET", "/v1/commissions", agent)).body;
    expect(com.rows.length).toBe(0);
    expect(com.owed).toEqual([]);
  });

  it("cannot receive money on it, by booking, by installment or by customer", async () => {
    expect((await call("POST", "/v1/receipts", agent, { bookingId: cc.booking, amount: "1", method: "cash" })).status).toBe(404);
    expect((await call("POST", "/v1/receipts", agent, { bookingId: cc.mine, amount: "1", method: "cash", allocations: [{ installmentId: cc.inst[1].id, amount: "1" }] })).status).toBe(404);
    const byCustomer = await call("POST", "/v1/receipts", agent, { customerId: cc.cust.id, amount: "1", method: "cash" });
    expect(byCustomer.status).toBe(403);
    expect(byCustomer.body.error.message).toMatch(/colleague/);
    expect((await call("POST", `/v1/receipts/${cc.receipt}/void`, agent, { reason: "agent void" })).status).toBe(404);
  });

  it("cannot change its plan, status, owner, fees, refunds, commission or reminders", async () => {
    expect((await call("POST", `/v1/bookings/${cc.booking}/schedule`, agent, { downPayment: "1", installments: 2 })).status, "`/v1/bookings/${cc.booking}/schedule`").toBe(404);
    expect((await call("POST", `/v1/bookings/${cc.booking}/status`, agent, { to: "cancelled", reason: "agent cancel" })).status, "`/v1/bookings/${cc.booking}/status`").toBe(404);
    expect((await call("POST", `/v1/bookings/${cc.booking}/transfer`, agent, { toPartyId: cc.cust.id })).status, "`/v1/bookings/${cc.booking}/transfer`").toBe(404);
    expect((await call("POST", `/v1/bookings/${cc.cancelled}/refund`, agent, { refundAmount: "1" })).status, "`/v1/bookings/${cc.cancelled}/refund`").toBe(404);
    expect((await call("POST", `/v1/refunds/${cc.refund}/void`, agent, { reason: "agent void" })).status, "`/v1/refunds/${cc.refund}/void`").toBe(404);
    expect((await call("POST", `/v1/bookings/${cc.booking}/commission`, agent, { ratePct: 1 })).status, "`/v1/bookings/${cc.booking}/commission`").toBe(404);
    expect((await call("POST", `/v1/installments/${cc.inst[1].id}/penalty`, agent, { amount: "1" })).status, "`/v1/installments/${cc.inst[1].id}/penalty`").toBe(404);
    expect((await call("POST", `/v1/penalties/${cc.penalty}/waive`, agent, { reason: "agent waive" })).status, "`/v1/penalties/${cc.penalty}/waive`").toBe(404);
    expect((await call("POST", "/v1/reminders", agent, { bookingId: cc.booking, channel: "call" })).status, "\"/v1/reminders\"").toBe(404);
  });

  it("cannot use its cheque, add files to it, delete its files or release a colleague's hold", async () => {
    expect((await call("POST", "/v1/cheques", agent, { chequeNo: "AG-1", bankName: "HBL", partyId: cc.cust.id, bookingId: cc.booking, amount: "1", chequeDate: "2026-12-01" })).status).toBe(404);
    expect((await call("POST", `/v1/cheques/${cc.cheque}/deposit`, agent, {})).status).toBe(404);
    expect((await call("POST", "/v1/attachments", agent, { entityType: "booking", entityId: cc.booking, fileName: "x.pdf", mime: "application/pdf", data: "UEsDBA==" })).status).toBe(404);
    expect((await call("DELETE", `/v1/attachments/${cc.attachment}`, agent)).status).toBe(404);
    expect((await call("DELETE", `/v1/holds/${cc.hold}`, agent)).status).toBe(404);
    // nothing of the above happened
    const b = (await call("GET", `/v1/bookings/${cc.booking}`, owner)).body;
    expect(b.status).toBe("pending");
    expect(b.installments.length).toBe(4);
  });

  it("can do all of it on a booking of their own (positive control)", async () => {
    expect((await call("POST", "/v1/receipts", agent, { bookingId: cc.mine, amount: "100", method: "cash" })).status).toBe(201);
    const mine = (await call("GET", "/v1/receipts", agent)).body;
    expect(mine.length).toBe(1);
    expect((await call("POST", "/v1/receipts", agent, { bookingId: cc.mine, amount: "50", method: "cash", allocations: [{ installmentId: cc.mineInst[0].id, amount: "50" }] })).status).toBe(201);
    expect((await call("POST", "/v1/reminders", agent, { bookingId: cc.mine, channel: "call" })).status).toBe(201);
    expect((await call("GET", `/v1/reminders?bookingId=${cc.mine}`, agent)).status).toBe(200);
    expect((await call("POST", "/v1/cheques", agent, { chequeNo: "AG-2", bankName: "HBL", partyId: cc.cust.id, bookingId: cc.mine, amount: "10", chequeDate: "2026-12-01" })).status).toBe(201);
    expect((await call("POST", "/v1/attachments", agent, { entityType: "booking", entityId: cc.mine, fileName: "mine.pdf", mime: "application/pdf", data: Buffer.from("%PDF-1.4 mine").toString("base64") })).status).toBe(201);
    expect((await call("POST", `/v1/bookings/${cc.mine}/status`, agent, { to: "confirmed" })).status).toBe(200);
  });

  it("the owner (company-wide scope) still sees and does everything", async () => {
    expect((await call("GET", `/v1/receipts/${cc.receipt}`, owner)).status).toBe(200);
    expect((await call("GET", "/v1/commissions", owner)).body.rows.length).toBeGreaterThan(0);
    expect((await call("GET", `/v1/attachments?entityType=booking&entityId=${cc.booking}`, owner)).body.length).toBe(1);
  });
});

describe("BUG-006: a repeated request id does the work once", () => {
  const idem = (key: string) => ({ "idempotency-key": key });
  const post = (url: string, body: unknown, key?: string, who = owner) => h.call("POST", url, { ...who, body, headers: key ? idem(key) : undefined });
  let n = 0;
  const fresh = () => `qa-req-${Date.now()}-${++n}-abcdef`;
  async function installmentBooking(price = "100000", down = "10000") {
    const cust = (await h.call("POST", "/v1/parties", { ...owner, body: { name: `Idem Customer ${n}`, roles: ["customer"] } })).body;
    const p = (await h.call("POST", "/v1/properties", { ...owner, body: { title: `Idem plot ${++n}`, typeId: ID.typeA, projectId: ID.prjA, listPrice: price } })).body;
    const b = (await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: p.id, customerId: cust.id, paymentType: "installment" } })).body;
    await h.call("POST", `/v1/bookings/${b.id}/schedule`, { ...owner, body: { downPayment: down, installments: 3, firstDue: "2020-01-01" } });
    return b.id as string;
  }
  const receiptCount = async (bookingId: string) => (await h.call("GET", `/v1/receipts?bookingId=${bookingId}`, owner)).body.length as number;

  it("20 simultaneous receipts with one request id make exactly one receipt and one ledger entry", async () => {
    const bk = await installmentBooking();
    const key = fresh();
    const before = await tbDebit();
    const rs = await Promise.all(Array.from({ length: 20 }, () => post("/v1/receipts", { bookingId: bk, amount: "1000", method: "cash" }, key)));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => r.body.id)).size).toBe(1);
    expect(await receiptCount(bk)).toBe(1);
    expect(await tbDebit()).toBe(before + 1000);
  });

  it("a later repeat (a retry after a slow answer) returns the same receipt, flagged as a replay", async () => {
    const bk = await installmentBooking();
    const key = fresh();
    const first = await post("/v1/receipts", { bookingId: bk, amount: "250.50", method: "cash" }, key);
    const again = await h.app.inject({ method: "POST", url: "/v1/receipts", headers: { authorization: `Bearer ${await h.token(ID.alice, "alice@a.pk")}`, "x-company-id": A, "idempotency-key": key, "content-type": "application/json" }, payload: { bookingId: bk, amount: "250.50", method: "cash" } });
    expect(again.statusCode).toBe(201);
    expect(JSON.parse(again.body).id).toBe(first.body.id);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(await receiptCount(bk)).toBe(1);
  });

  it("without a request id nothing changes: two identical receipts are two receipts", async () => {
    const bk = await installmentBooking();
    await post("/v1/receipts", { bookingId: bk, amount: "10", method: "cash" });
    await post("/v1/receipts", { bookingId: bk, amount: "10", method: "cash" });
    expect(await receiptCount(bk)).toBe(2);
  });

  it("the same id with different details, or for another kind of request, is refused", async () => {
    const bk = await installmentBooking();
    const key = fresh();
    expect((await post("/v1/receipts", { bookingId: bk, amount: "100", method: "cash" }, key)).status).toBe(201);
    const changed = await post("/v1/receipts", { bookingId: bk, amount: "999", method: "cash" }, key);
    expect(changed.status).toBe(409);
    expect(changed.body.error.message).toMatch(/different details/);
    const [a, b] = await leafAccounts();
    const other = await post("/v1/vouchers", { type: "JV", date: "2026-09-20", lines: [{ accountId: a!.id, debit: "1" }, { accountId: b!.id, credit: "1" }] }, key);
    expect(other.status).toBe(409);
    expect(await receiptCount(bk)).toBe(1);
  });

  it("a request that fails leaves nothing behind, so the same id can be sent again", async () => {
    const bk = await installmentBooking();
    const key = fresh();
    const bad = await post("/v1/receipts", { bookingId: "11111111-1111-1111-1111-111111111111", amount: "100", method: "cash" }, key);
    expect(bad.status).toBe(404);
    // the failed attempt was rolled back with everything else, so its id is free again
    const retry = await post("/v1/receipts", { bookingId: bk, amount: "100", method: "cash" }, key);
    expect(retry.status).toBe(201);
    expect(await receiptCount(bk)).toBe(1);
  });

  it("a request id of the wrong length is refused plainly", async () => {
    const bk = await installmentBooking();
    const r = await post("/v1/receipts", { bookingId: bk, amount: "5", method: "cash" }, "short");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("invalid_request_id");
  });

  it("vouchers: simultaneous creates with one id make one voucher, one number", async () => {
    const [a, b] = await leafAccounts();
    const key = fresh();
    const body = { type: "JV", date: "2026-09-20", description: "Idem voucher", lines: [{ accountId: a!.id, debit: "3" }, { accountId: b!.id, credit: "3" }] };
    const rs = await Promise.all(Array.from({ length: 8 }, () => post("/v1/vouchers", body, key)));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => r.body.id)).size).toBe(1);
    const list = (await h.call("GET", "/v1/vouchers?search=Idem%20voucher", owner)).body;
    expect((Array.isArray(list) ? list : list.rows).filter((v: { description: string }) => v.description === "Idem voucher").length).toBe(1);
  });

  it("refunds: three simultaneous refunds with one id refund once", async () => {
    const bk = await installmentBooking();
    await post("/v1/receipts", { bookingId: bk, amount: "10000", method: "cash" });
    await h.call("POST", `/v1/bookings/${bk}/status`, { ...owner, body: { to: "cancelled", reason: "idem refund" } });
    const key = fresh();
    const rs = await Promise.all(Array.from({ length: 3 }, () => post(`/v1/bookings/${bk}/refund`, { refundAmount: "4000" }, key)));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    const ex = (await h.call("GET", `/v1/bookings/${bk}/extras`, owner)).body;
    expect(ex.refunds.length).toBe(1);
    expect(Number(ex.refundable)).toBe(6000);
  });

  it("late fees: the same id assesses one fee", async () => {
    const bk = await installmentBooking();
    const inst = (await h.call("GET", `/v1/bookings/${bk}`, owner)).body.installments[1].id;
    const key = fresh();
    await Promise.all(Array.from({ length: 4 }, () => post(`/v1/installments/${inst}/penalty`, { amount: "75" }, key)));
    expect((await h.call("GET", `/v1/bookings/${bk}/extras`, owner)).body.penalties.length).toBe(1);
  });

  it("cheques: the same id registers one cheque", async () => {
    const bk = await installmentBooking();
    const cust = (await h.call("GET", `/v1/bookings/${bk}`, owner)).body.customerId;
    const key = fresh();
    const rs = await Promise.all(Array.from({ length: 4 }, () => post("/v1/cheques", { chequeNo: `IDEM-${n}`, bankName: "HBL", partyId: cust, bookingId: bk, amount: "500", chequeDate: "2026-12-01" }, key)));
    expect(new Set(rs.map((r) => r.body.id)).size).toBe(1);
    const all = (await h.call("GET", "/v1/cheques", owner)).body;
    expect(all.filter((c: { chequeNo: string }) => c.chequeNo === `IDEM-${n}`).length).toBe(1);
  });

  it("payroll: the same id makes one run; service invoice payments are taken once", async () => {
    await h.call("POST", "/v1/employees", { ...owner, body: { fullName: "Idem Employee", joinDate: "2026-01-01", basicSalary: "1000" } });
    const key = fresh();
    const rs = await Promise.all(Array.from({ length: 3 }, () => post("/v1/payroll", { month: "2026-05" }, key)));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => r.body.id)).size).toBe(1);

    const cust = (await h.call("POST", "/v1/parties", { ...owner, body: { name: "Idem Invoice Customer", roles: ["customer"] } })).body;
    const inv = (await h.call("POST", "/v1/service-invoices", { ...owner, body: { customerId: cust.id, dueDate: "2026-12-01", amount: "5000" } })).body;
    const k2 = fresh();
    const pays = await Promise.all(Array.from({ length: 4 }, () => post(`/v1/service-invoices/${inv.id}/payments`, { amount: "1000", method: "cash" }, k2)));
    expect(pays.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    const row = (await h.call("GET", "/v1/service-invoices", owner)).body.find((x: { id: string }) => x.id === inv.id);
    expect(Number(row.paidAmount)).toBe(1000);
  });
});

describe("BUG-007/009: bad input gets a clear 4xx, and no internal names reach the client", () => {
  async function raw(method: "POST" | "PUT", url: string, payload: string | object, headers: Record<string, string> = {}) {
    const res = await h.app.inject({ method, url, payload: payload as string, headers: { authorization: `Bearer ${await h.token(ID.alice, "alice@a.pk")}`, "x-company-id": A, "content-type": "application/json", ...headers } });
    let body: any = null;
    try { body = JSON.parse(res.body); } catch { body = res.body; }
    return { status: res.statusCode, body };
  }

  it("a body over 1 MB is refused with 413 and a plain sentence (was 500)", async () => {
    const r = await raw("POST", "/v1/parties", JSON.stringify({ name: "x".repeat(1_200_000), roles: ["customer"] }));
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe("payload_too_large");
    expect(r.body.error.message).toMatch(/smaller file/);
  });

  it("JSON that cannot be read is a 400, not a 500", async () => {
    const r = await raw("POST", "/v1/parties", "{not json");
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("invalid_request");
  });

  it("an amount that is too big for the books is refused as invalid (was 500)", async () => {
    const [a, b] = await leafAccounts();
    const r = await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", lines: [{ accountId: a!.id, debit: "10000000000000000000" }, { accountId: b!.id, credit: "10000000000000000000" }] } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("invalid_request");
    const edge = await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", lines: [{ accountId: a!.id, debit: "9999999999999999.99" }, { accountId: b!.id, credit: "9999999999999999.99" }] } });
    expect(edge.status).toBe(201);
  });

  it("errors never carry table, column or constraint names", async () => {
    const [a, b] = await leafAccounts();
    const unknown = await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", lines: [{ accountId: "11111111-1111-1111-1111-111111111111", debit: "5" }, { accountId: b!.id, credit: "5" }] } });
    expect(unknown.status).toBe(422);
    expect(JSON.stringify(unknown.body)).not.toMatch(/constraint|_fkey|_check|_tenant_fk|voucher_lines/i);
    const dup = await h.call("POST", "/v1/parties", { ...owner, body: { name: "Dup CNIC A", roles: ["customer"], cnic: "35202-5555555-5" } });
    expect(dup.status).toBe(201);
    const again = await h.call("POST", "/v1/parties", { ...owner, body: { name: "Dup CNIC B", roles: ["customer"], cnic: "35202-5555555-5" } });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).not.toMatch(/constraint|_uq|parties_/i);
    void a;
  });

  it("a bank statement line with neither deposit nor withdrawal gets an explanation", async () => {
    const bank = (await h.call("POST", "/v1/bank-accounts", { ...owner, body: { accountTitle: "Regression Bank", accountNo: "REG-12345", bankName: "Meezan Bank" } })).body;
    const r = await h.call("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...owner, body: { periodFrom: "2026-11-01", periodTo: "2026-11-30", openingBalance: "0", closingBalance: "0", lines: [{ date: "2026-11-10", description: "nothing" }] } });
    expect(r.status).toBe(422);
    expect(r.body.error.message).toMatch(/deposit or a withdrawal/);
    expect(JSON.stringify(r.body)).not.toMatch(/constraint|_check/);
  });

  it("toProblem maps the database's own error codes to plain answers", async () => {
    const { toProblem } = await import("../src/errors.js");
    const pg = (code: string, extra: object = {}) => Object.assign(new Error("raw technical text with table_x"), { code, ...extra });
    expect(toProblem(pg("22003"))).toMatchObject({ status: 400, code: "number_too_large" });
    expect(toProblem(pg("22001"))).toMatchObject({ status: 400, code: "too_long" });
    expect(toProblem(pg("23P01", { constraint: "x_excl" }))).toMatchObject({ status: 409, code: "overlap", message: "This overlaps with something that is already recorded." });
    expect(toProblem(pg("23P01")).message).toBe("raw technical text with table_x"); // our own RAISE: already plain
    for (const code of ["23503", "23505", "23514"]) {
      const p = toProblem(pg(code, { constraint: "secret_constraint_name" }));
      expect(JSON.stringify(p)).not.toContain("secret_constraint_name");
      expect(p.details).toBeUndefined();
    }
    expect(toProblem(Object.assign(new Error("x"), { code: "FST_ERR_CTP_BODY_TOO_LARGE", statusCode: 413 })).status).toBe(413);
    expect(toProblem(Object.assign(new Error("x"), { code: "FST_ERR_CTP_INVALID_MEDIA_TYPE", statusCode: 415 })).code).toBe("unsupported_type");
    expect(toProblem(new Error("boom")).status).toBe(500);
  });
});

describe("BUG-008: overlapping leave is refused with a plain sentence", () => {
  it("answers 409 naming the person (was 500)", async () => {
    const e = (await h.call("POST", "/v1/employees", { ...owner, body: { fullName: "Leave Overlap Person", joinDate: "2026-01-01" } })).body;
    const lt = (await h.call("GET", "/v1/leave/types", owner)).body[0];
    const ok = await h.call("POST", "/v1/leave/requests", { ...owner, body: { employeeId: e.id, leaveTypeId: lt.id, fromDate: "2026-11-10", toDate: "2026-11-12" } });
    expect(ok.status).toBe(201);
    const clash = await h.call("POST", "/v1/leave/requests", { ...owner, body: { employeeId: e.id, leaveTypeId: lt.id, fromDate: "2026-11-11", toDate: "2026-11-13" } });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("overlap");
    expect(clash.body.error.message).toBe("Leave Overlap Person already has leave on some of these days");
    const next = await h.call("POST", "/v1/leave/requests", { ...owner, body: { employeeId: e.id, leaveTypeId: lt.id, fromDate: "2026-11-13", toDate: "2026-11-14" } });
    expect(next.status).toBe(201);
  });
});

describe("BUG-010: a journal cannot debit and credit the same account", () => {
  it("refuses to submit it, says which account, and allows a different project on one side", async () => {
    const [a, b] = await leafAccounts();
    const same = (await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", lines: [{ accountId: a!.id, debit: "10" }, { accountId: a!.id, credit: "10" }] } })).body;
    const sub = await h.call("POST", `/v1/vouchers/${same.id}/submit`, owner);
    expect(sub.status).toBe(422);
    expect(sub.body.error.message).toContain(a!.code);
    expect(sub.body.error.message).toMatch(/cancels itself out/);
    expect((await h.call("GET", `/v1/vouchers/${same.id}`, owner)).body.status).toBe("draft");
    // moving an amount between two projects inside one account is a real journal
    const moved = (await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", lines: [{ accountId: a!.id, debit: "10", projectId: ID.prjA }, { accountId: a!.id, credit: "10" }] } })).body;
    expect((await h.call("POST", `/v1/vouchers/${moved.id}/submit`, owner)).status).toBe(200);
    // an ordinary journal is untouched
    const plain = (await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", lines: [{ accountId: a!.id, debit: "10" }, { accountId: b!.id, credit: "10" }] } })).body;
    expect((await h.call("POST", `/v1/vouchers/${plain.id}/submit`, owner)).status).toBe(200);
  });
});

describe("BUG-011: a late fee is charged once at a time", () => {
  async function lateBooking() {
    const cust = (await h.call("POST", "/v1/parties", { ...owner, body: { name: `Late Fee Customer ${Date.now()}`, roles: ["customer"] } })).body;
    const p = (await h.call("POST", "/v1/properties", { ...owner, body: { title: `Late plot ${Date.now()}`, typeId: ID.typeA, projectId: ID.prjA, listPrice: "100000" } })).body;
    const b = (await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: p.id, customerId: cust.id, paymentType: "installment" } })).body;
    await h.call("POST", `/v1/bookings/${b.id}/schedule`, { ...owner, body: { downPayment: "10000", installments: 3, firstDue: "2020-01-01" } });
    const inst = (await h.call("GET", `/v1/bookings/${b.id}`, owner)).body.installments;
    return { booking: b.id as string, inst };
  }
  const penalties = async (booking: string) => (await h.call("GET", `/v1/bookings/${booking}/extras`, owner)).body.penalties as { id: string; status: string; amount: string }[];

  it("a second fee while one is open is refused with the open amount", async () => {
    const { booking, inst } = await lateBooking();
    expect((await h.call("POST", `/v1/installments/${inst[1].id}/penalty`, { ...owner, body: { amount: "500" } })).status).toBe(201);
    const again = await h.call("POST", `/v1/installments/${inst[1].id}/penalty`, { ...owner, body: { amount: "500" } });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/late fee of Rs 500\.00 is already open/);
    expect((await penalties(booking)).length).toBe(1);
    // another installment is its own matter
    expect((await h.call("POST", `/v1/installments/${inst[2].id}/penalty`, { ...owner, body: { amount: "300" } })).status).toBe(201);
  });

  it("after the first is waived a new one is accepted; a fee paid today is not charged again today", async () => {
    const { booking, inst } = await lateBooking();
    await h.call("POST", `/v1/installments/${inst[1].id}/penalty`, { ...owner, body: { amount: "200" } });
    const first = (await penalties(booking))[0]!;
    expect((await h.call("POST", `/v1/penalties/${first.id}/waive`, { ...owner, body: { reason: "goodwill" } })).status).toBe(200);
    expect((await h.call("POST", `/v1/installments/${inst[1].id}/penalty`, { ...owner, body: { amount: "250" } })).status).toBe(201);
    // pay it (late charges are paid before installments), then try to charge again the same day
    expect((await h.call("POST", "/v1/receipts", { ...owner, body: { bookingId: booking, amount: "250", method: "cash" } })).status).toBe(201);
    const list = await penalties(booking);
    expect(list.find((x) => x.status === "paid")).toBeTruthy();
    const today = await h.call("POST", `/v1/installments/${inst[1].id}/penalty`, { ...owner, body: { amount: "100" } });
    expect(today.status).toBe(409);
    expect(today.body.error.message).toMatch(/already charged and paid/);
  });
});

describe("BUG-012: bank statements", () => {
  it("the same statement cannot be imported twice; a changed one can", async () => {
    const bank = (await h.call("POST", "/v1/bank-accounts", { ...owner, body: { accountTitle: "Statement Bank", accountNo: "STM-12345", bankName: "Meezan Bank" } })).body;
    const body = { label: "Nov", periodFrom: "2026-11-01", periodTo: "2026-11-30", openingBalance: "100", closingBalance: "150.50", lines: [{ date: "2026-11-10", description: "in", reference: "R1", deposit: "100" }, { date: "2026-11-12", description: "fee", withdrawal: "49.50" }] };
    const first = await h.call("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...owner, body });
    expect(first.status).toBe(201);
    expect(first.body.linesAddUp).toBe(true);
    const again = await h.call("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...owner, body });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("This statement has already been imported for this bank account.");
    // same lines in another order are still the same statement
    const shuffled = await h.call("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...owner, body: { ...body, lines: [...body.lines].reverse() } });
    expect(shuffled.status).toBe(409);
    const other = await h.call("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...owner, body: { ...body, label: "Nov corrected", closingBalance: "151.50", lines: [{ ...body.lines[0]!, deposit: "101" }, body.lines[1]!] } });
    expect(other.status).toBe(201);
    const list = (await h.call("GET", `/v1/bank-accounts/${bank.id}/statements`, owner)).body;
    expect((Array.isArray(list) ? list : list.rows).length).toBe(2);
  });

  it("lines that do not lead to the closing balance are refused with the figures, unless the person insists", async () => {
    const bank = (await h.call("POST", "/v1/bank-accounts", { ...owner, body: { accountTitle: "Mismatch Bank", accountNo: "MIS-12345", bankName: "Meezan Bank" } })).body;
    const body = { periodFrom: "2026-10-01", periodTo: "2026-10-31", openingBalance: "0", closingBalance: "999", lines: [{ date: "2026-10-05", deposit: "100.10" }] };
    const bad = await h.call("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...owner, body });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("statement_mismatch");
    expect(bad.body.error.message).toContain("100.10");
    expect(bad.body.error.message).toContain("999");
    const forced = await h.call("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...owner, body: { ...body, allowMismatch: true } });
    expect(forced.status).toBe(201);
    expect(forced.body.linesAddUp).toBe(false);
  });

  it("a line with neither or both amounts is refused with a sentence", async () => {
    const bank = (await h.call("POST", "/v1/bank-accounts", { ...owner, body: { accountTitle: "Lines Bank", accountNo: "LIN-12345", bankName: "Meezan Bank" } })).body;
    const mk = (line: object) => h.call("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...owner, body: { periodFrom: "2026-09-01", periodTo: "2026-09-30", openingBalance: "0", closingBalance: "0", allowMismatch: true, lines: [line] } });
    for (const line of [{ date: "2026-09-02" }, { date: "2026-09-02", deposit: "5", withdrawal: "5" }]) {
      const r = await mk(line);
      expect(r.status).toBe(422);
      expect(r.body.error.message).toMatch(/deposit or a withdrawal/);
    }
  });
});

describe("BUG-018: the same cheque is on the register once", () => {
  it("refuses a duplicate number from the same bank for the same person, allows it for someone else", async () => {
    const mk = async (name: string) => (await h.call("POST", "/v1/parties", { ...owner, body: { name, roles: ["customer"] } })).body;
    const [p1, p2] = [await mk("Cheque Person One"), await mk("Cheque Person Two")];
    const body = (party: string, no: string, bank = "HBL") => ({ chequeNo: no, bankName: bank, partyId: party, amount: "500", chequeDate: "2026-12-01" });
    expect((await h.call("POST", "/v1/cheques", { ...owner, body: body(p1.id, "DUP-001") })).status).toBe(201);
    const dup = await h.call("POST", "/v1/cheques", { ...owner, body: body(p1.id, " DUP-001 ", "hbl") });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toMatch(/already on the register/);
    expect((await h.call("POST", "/v1/cheques", { ...owner, body: body(p2.id, "DUP-001") })).status).toBe(201);
    expect((await h.call("POST", "/v1/cheques", { ...owner, body: body(p1.id, "DUP-001", "UBL") })).status).toBe(201);
    expect((await h.call("POST", "/v1/cheques", { ...owner, body: body(p1.id, "DUP-002") })).status).toBe(201);
  });
});

describe("BUG-017: an uploaded file must really be what it claims to be", () => {
  const upload = (mime: string, bytes: Buffer, name = "file.bin") =>
    h.call("POST", "/v1/attachments", { ...owner, body: { entityType: "party", entityId: ID.custA, fileName: name, mime, data: bytes.toString("base64") } });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

  it("accepts a real file of each allowed type", async () => {
    const real: [string, Buffer][] = [
      ["application/pdf", Buffer.from("%PDF-1.4 real")],
      ["image/png", png],
      ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70])],
      ["image/webp", Buffer.concat([Buffer.from("RIFF"), Buffer.from([4, 0, 0, 0]), Buffer.from("WEBPVP8 ")])],
      ["image/heic", Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic")])],
      ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from([0x50, 0x4b, 3, 4, 20, 0])],
      ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from([0x50, 0x4b, 3, 4, 20, 0])],
      ["application/msword", Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])],
      ["text/plain", Buffer.from("Plain notes\nwith Urdu: محمد علی\n")],
      ["text/csv", Buffer.from("date,amount\n2026-01-01,100\n")],
      ["application/vnd.ms-excel", Buffer.from("date,amount\n2026-01-01,100\n")], // a CSV as Windows announces it
    ];
    for (const [mime, bytes] of real) expect((await upload(mime, bytes)).status, mime).toBe(201);
  });

  it("refuses a program renamed to .pdf, a page of HTML called .pdf, a photo called .pdf, and binary called text", async () => {
    const exe = await upload("application/pdf", Buffer.from("MZ\x90\x00\x03\x00\x00\x00 not a pdf"), "invoice.pdf");
    expect(exe.status).toBe(415);
    expect(exe.body.error.code).toBe("file_type");
    expect(exe.body.error.message).toMatch(/not what its name says/);
    expect((await upload("application/pdf", Buffer.from("<html><script>alert(1)</script></html>"), "page.pdf")).status).toBe(415);
    expect((await upload("application/pdf", png, "photo.pdf")).status).toBe(415);
    expect((await upload("image/png", Buffer.from("%PDF-1.4 hello"), "scan.png")).status).toBe(415);
    expect((await upload("text/plain", Buffer.from([0x4d, 0x5a, 0, 0, 1, 2, 3]), "notes.txt")).status).toBe(415);
    expect((await upload("application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("%PDF-1.4"), "x.docx")).status).toBe(415);
  });

  it("an empty file is still reported as empty, and nothing refused was stored", async () => {
    const empty = await upload("application/pdf", Buffer.alloc(0));
    expect(empty.status).toBe(400);
    const list = (await h.call("GET", `/v1/attachments?entityType=party&entityId=${ID.custA}`, owner)).body as { fileName: string }[];
    expect(list.some((a) => ["invoice.pdf", "page.pdf", "photo.pdf", "scan.png", "notes.txt", "x.docx"].includes(a.fileName))).toBe(false);
  });
});

describe("BUG-001: an approved voucher can never be deleted, only voided with its entry reversed", () => {
  it("refuses DELETE of an approved voucher and leaves the books untouched", async () => {
    const v = await approvedVoucher();
    const before = await tbDebit();
    const del = await h.call("DELETE", `/v1/vouchers/${v.id}`, owner);
    expect(del.status).toBe(409);
    expect(del.body.error.message).toMatch(/void it with a reason/i);
    expect((await h.call("GET", `/v1/vouchers/${v.id}`, owner)).body.status).toBe("approved");
    expect(await tbDebit()).toBe(before);
  });

  it("refuses the database shortcut too (status -> void by hand, and a physical delete)", async () => {
    const v = await approvedVoucher("12.00");
    await expect(h.admin((c) => c.query(`update vouchers set status = 'void' where id = $1`, [v.id]))).rejects.toThrow(/Void it with a reason/);
    await expect(h.admin((c) => c.query(`delete from vouchers where id = $1`, [v.id]))).rejects.toThrow(/cannot be deleted/);
  });

  it("the proper void still works, reverses the entry, and the self-check stays empty", async () => {
    const v = await approvedVoucher("33.00");
    const [acct] = await leafAccounts();
    const net = async () => { const r = (await h.call("GET", `/v1/accounts/${acct!.id}/ledger`, owner)).body.lines; return r.length ? r[r.length - 1].balance : "0"; };
    const netBefore = await net();
    const before = await tbDebit();
    const vo = await h.call("POST", `/v1/vouchers/${v.id}/void`, { ...owner, body: { reason: "QA proper void" } });
    expect(vo.status).toBe(200);
    expect(vo.body.status).toBe("void");
    expect(await tbDebit()).toBe(before + 33); // the reversing entry is posted ...
    expect(Number(await net())).toBe(Number(netBefore) - 33); // ... and takes the original out of the account
    const rec = await h.admin(async (c) => (await c.query(`select check_name from v_reconciliation where check_name in ('void_voucher_not_reversed','approved_voucher_without_entry','orphan_journal_source')`)).rows);
    expect(rec).toEqual([]);
  });

  it("still discards a draft and a rejected voucher, and answers 404 for an unknown id", async () => {
    const [a, b] = await leafAccounts();
    const lines = [{ accountId: a!.id, debit: "5" }, { accountId: b!.id, credit: "5" }];
    const d = (await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", lines } })).body;
    expect((await h.call("DELETE", `/v1/vouchers/${d.id}`, owner)).status).toBe(204);
    expect((await h.call("GET", `/v1/vouchers/${d.id}`, owner)).body.status).toBe("void");
    const r = (await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", lines } })).body;
    await h.call("POST", `/v1/vouchers/${r.id}/submit`, owner);
    await h.call("POST", `/v1/vouchers/${r.id}/reject`, { ...owner, body: { reason: "wrong account" } });
    expect((await h.call("DELETE", `/v1/vouchers/${r.id}`, owner)).status).toBe(204);
    expect((await h.call("DELETE", `/v1/vouchers/${ID.custA}`, owner)).status).toBe(404);
    const pending = (await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "JV", date: "2026-09-20", lines } })).body;
    await h.call("POST", `/v1/vouchers/${pending.id}/submit`, owner);
    expect((await h.call("DELETE", `/v1/vouchers/${pending.id}`, owner)).status).toBe(409);
  });

  it("v_reconciliation catches a voucher that was voided without a reversal (if the guard were bypassed)", async () => {
    const v = await approvedVoucher("44.00");
    await h.admin(async (c) => {
      await c.query(`alter table vouchers disable trigger vouchers_void_guard`);
      try {
        await c.query(`update vouchers set status = 'void' where id = $1`, [v.id]);
        const rec = await c.query(`select check_name, detail from v_reconciliation where check_name = 'void_voucher_not_reversed'`);
        expect(rec.rows.length).toBe(1);
        expect(rec.rows[0].detail).toContain(v.number);
        const sum = await c.query(`select problems from app.reconciliation_summary() where check_name = 'void_voucher_not_reversed'`);
        expect(Number(sum.rows[0].problems)).toBe(1);
      } finally {
        await c.query(`alter table vouchers enable trigger vouchers_void_guard`);
        await c.query(`delete from journal_lines where entry_id in (select journal_entry_id from vouchers where id = $1)`, [v.id]).catch(() => {});
      }
    });
  });
});
