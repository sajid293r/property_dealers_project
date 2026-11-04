// QA run 1 (scratch, not part of the product): plans, permissions, isolation, validation, money, state machines.
// Runs the real API over an in-memory Postgres using the test harness. Prints one JSON line per check.
import { ID, startHarness, type Harness } from "../test/helpers.js";
import { MODULE_KEYS } from "../src/roles.js";

const out: { id: string; name: string; ok: boolean; note: string }[] = [];
async function t(id: string, name: string, fn: () => Promise<[boolean, string?]>) {
  try {
    const [ok, note] = await fn();
    out.push({ id, name, ok, note: note ?? "" });
  } catch (e) {
    out.push({ id, name, ok: false, note: "THREW " + (e as Error).message });
  }
  const r = out[out.length - 1]!;
  console.log(JSON.stringify(r));
}
const U = (n: number) => `a2000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ORG_B = "00000000-0000-0000-0000-0000000000b1", ORG_P = "00000000-0000-0000-0000-0000000000b2";
const CO_B = "00000000-0000-0000-0000-0000000000d1", CO_P = "00000000-0000-0000-0000-0000000000d2";
const ROLE_B = "b3000000-0000-0000-0000-000000000001", ROLE_P = "b3000000-0000-0000-0000-000000000002";
const OWN_B = U(1), OWN_P = U(2), OUTSIDER = U(3);
const emails: Record<string, string> = { [OWN_B]: "basic@x.pk", [OWN_P]: "pro@x.pk", [OUTSIDER]: "out@x.pk" };

const h: Harness = await startHarness();
await h.admin(async (c) => {
  await c.query(`
    insert into organizations(id,name,slug,plan,extra_seats) values ('${ORG_B}','Basic Org','basic-org','basic',0),('${ORG_P}','Pro Org','pro-org','moderate',0);
    insert into companies(id,org_id,name) values ('${CO_B}','${ORG_B}','Basic Co'),('${CO_P}','${ORG_P}','Pro Co');
    insert into users(id,email,full_name) values ('${OWN_B}','basic@x.pk','Basic Owner'),('${OWN_P}','pro@x.pk','Pro Owner'),('${OUTSIDER}','out@x.pk','Outsider');
    insert into roles(id,org_id,name,is_system) values ('${ROLE_B}','${ORG_B}','Owner',true),('${ROLE_P}','${ORG_P}','Owner',true);
    insert into company_members(company_id,user_id,role_id) values ('${CO_B}','${OWN_B}','${ROLE_B}'),('${CO_P}','${OWN_P}','${ROLE_P}');
  `);
  for (const role of [ID.roleOwner, ROLE_B, ROLE_P])
    for (const m of MODULE_KEYS)
      await c.query(`insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,$2,true,true,true,true,true,'company') on conflict (role_id,module) do update set can_view=true,can_create=true,can_edit=true,can_delete=true,can_approve=true`, [role, m]);
  await c.query(`select app.seed_company_defaults('${CO_B}'), app.seed_company_defaults('${CO_P}')`);
});
const call = (method: any, url: string, as: string, company: string | null, body?: unknown, headers?: Record<string, string>) => h.call(method, url, { as, company, body, headers });
// h.call only knows e-mails of the harness users; patch by passing our own token
async function raw(method: string, url: string, userId: string | null, company: string | null, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (userId) headers.authorization = `Bearer ${await h.token(userId, emails[userId] ?? "alice@a.pk")}`;
  if (company) headers["x-company-id"] = company;
  const res = await h.app.inject({ method: method as any, url, headers, ...(body !== undefined ? { payload: body as object } : {}) });
  let b: any = null;
  try { b = res.body ? JSON.parse(res.body) : null; } catch { b = res.body; }
  return { status: res.statusCode, body: b, headers: res.headers };
}
const A = ID.coA, alice = ID.alice;

const accts = (await raw("GET", "/v1/accounts", alice, A)).body;
const leaf = accts.filter((a: any) => !(a.isGroup ?? a.is_group));
const expAcc = accts.find((a: any) => !(a.isGroup ?? a.is_group) && (a.accountClass ?? a.account_class) === "expense") ?? leaf[5];
const mkCust = async (n: string, co = A, as = alice) => (await raw("POST", "/v1/parties", as, co, { name: n, roles: ["customer"] })).body;
const mkProp = async (title: string, price = "100000", co = A, as = alice, typeId = ID.typeA, projectId: string | undefined = ID.prjA) => (await raw("POST", "/v1/properties", as, co, { title, typeId, projectId, listPrice: price })).body;
const mkBooking = async (cust: string, price = "100000", inst = 4, down = "10000", first = "2026-12-01", as = alice, co = A) => {
  const p = await mkProp("QA p " + Math.random().toString(36).slice(2, 7), price, co, as, co === A ? ID.typeA : ID.typeB, co === A ? ID.prjA : ID.prjB);
  const b = (await raw("POST", "/v1/bookings", as, co, { propertyId: p.id, customerId: cust, paymentType: "installment" })).body;
  await raw("POST", `/v1/bookings/${b.id}/schedule`, as, co, { downPayment: down, installments: inst, firstDue: first });
  return { p, b };
};
const tb = async (co = A, as = alice) => (await raw("GET", `/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31`, as, co)).body.totals;

// ── A7 / A8 invites and seats
await t("A8", "Basic plan: 3 seats incl. pending invites; extra seats raise the limit; cancelling frees a seat", async () => {
  const roles = (await raw("GET", "/v1/roles", OWN_B, CO_B)).body; const rid = (roles.rows ?? roles)[0]?.id ?? ROLE_B;
  const inv = async (e: string) => raw("POST", "/v1/invites", OWN_B, CO_B, { email: e, roleId: ROLE_B });
  const a = await inv("one@x.pk"), b = await inv("two@x.pk"), c = await inv("three@x.pk");
  const plan1 = (await raw("GET", "/v1/plan", OWN_B, CO_B)).body;
  await h.admin(async (cl) => { await cl.query(`update organizations set extra_seats = 3 where id = '${ORG_B}'`); });
  const d = await inv("three@x.pk");
  const list = (await raw("GET", "/v1/members", OWN_B, CO_B)).body;
  const pend = (list.invites ?? [])[0];
  const rev = pend ? await raw("DELETE", `/v1/invites/${pend.id}`, OWN_B, CO_B) : null;
  const dupe = await inv("two@x.pk");
  return [a.status === 201 && b.status === 201 && c.status === 403 && d.status === 201, `invites 1,2,3 → ${a.status},${b.status},${c.status} ${c.body?.error?.code}; usage ${JSON.stringify(plan1.users)}; after +3 extra seats: ${d.status}; revoke ${rev?.status}; duplicate pending invite ${dupe.status} ${dupe.body?.error?.code ?? ""}`];
});
await t("A7", "Invite of a known user joins at once; invalid email; unknown role; resend (duplicate)", async () => {
  const bad = []; const known = await raw("POST", "/v1/invites", alice, A, { email: "bob@a.pk", roleId: ID.roleViewer }); // already a member
  const ne = await raw("POST", "/v1/invites", alice, A, { email: "not-an-email", roleId: ID.roleViewer }); const nr = await raw("POST", "/v1/invites", alice, A, { email: "x@y.pk", roleId: "11111111-1111-1111-1111-111111111111" });
  const other = await raw("POST", "/v1/invites", alice, A, { email: "x@y.pk", roleId: ROLE_P }); // role of another org
  return [known.status === 409 && ne.status === 400 && nr.status === 404 && other.status >= 400, `already member ${known.status}; bad email ${ne.status}; unknown role ${nr.status}; role from ANOTHER organisation ${other.status} ${other.body?.error?.code ?? ""}`];
});
// ── B3 roles
await t("B3b", "Sales agent: sells, cannot cancel/approve, sees only own bookings", async () => {
  const bad: string[] = []; const dave = ID.dave;
  const c = await mkCust("QA dave cust"); const p = await mkProp("QA dave plot");
  const own = await raw("POST", "/v1/bookings", dave, A, { propertyId: p.id, customerId: c.id, paymentType: "cash" });
  if (own.status !== 201) bad.push(`agent could not book ${own.status} ${JSON.stringify(own.body).slice(0, 100)}`);
  const cx = await raw("POST", `/v1/bookings/${own.body?.id}/status`, dave, A, { to: "cancelled", reason: "agent cancel" }); if (cx.status < 400) bad.push("agent cancelled a booking");
  const al = await mkBooking(c.id); const lst = (await raw("GET", "/v1/bookings", dave, A)).body; const rows = Array.isArray(lst) ? lst : lst.rows;
  if (rows.some((r: any) => r.id === al.b.id)) bad.push("agent sees owner's booking");
  const direct = await raw("GET", `/v1/bookings/${al.b.id}`, dave, A); if (direct.status === 200) bad.push("agent opened owner's booking by id");
  const rcp = await raw("POST", "/v1/receipts", dave, A, { bookingId: al.b.id, amount: "5", method: "cash" }); if (rcp.status < 400) bad.push("agent received money on someone else's booking");
  const vo = await raw("POST", "/v1/receipts/11111111-1111-1111-1111-111111111111/void", dave, A, { reason: "agent void" }); if (vo.status !== 403) bad.push(`agent void→${vo.status}`);
  return [bad.length === 0, bad.join(" | ") + ` agent sees ${rows.length} bookings; direct id ${direct.status}; receipt on others ${rcp.status}`];
});
await t("B3c", "Accountant: prepares voucher, cannot approve; cannot book", async () => {
  const bad: string[] = []; const f = ID.frank;
  const v = await raw("POST", "/v1/vouchers", f, A, { type: "JV", date: "2026-11-03", lines: [{ accountId: leaf[0].id, debit: "9" }, { accountId: leaf[1].id, credit: "9" }] });
  const s = await raw("POST", `/v1/vouchers/${v.body?.id}/submit`, f, A); const ap = await raw("POST", `/v1/vouchers/${v.body?.id}/approve`, f, A, {}); if (ap.status !== 403) bad.push(`accountant approve→${ap.status}`);
  const bk = await raw("POST", "/v1/bookings", f, A, { propertyId: ID.propA(2), customerId: ID.custA, paymentType: "cash" }); if (bk.status !== 403) bad.push(`accountant book→${bk.status}`);
  const rp = await raw("POST", "/v1/receipts", f, A, { customerId: ID.custA, amount: "1", method: "cash" }); if (rp.status !== 403) bad.push(`accountant receipt→${rp.status}`);
  return [bad.length === 0 && v.status === 201 && s.status === 200, bad.join(" | ") + ` create ${v.status} submit ${s.status} approve ${ap.status}`];
});
await t("B4", "Custom role: create, assign, grant, then remove permission mid-session", async () => {
  const bad: string[] = []; const clerk = U(60); emails[clerk] = "clerk@x.pk";
  await h.admin(async (c) => { await c.query(`insert into users(id,email,full_name) values ('${clerk}','clerk@x.pk','Clerk')`); });
  const perms = (g: any) => ({ deals: g, customers: { view: true, create: true, edit: false, delete: false, approve: false } });
  const mk = await raw("POST", "/v1/roles", OWN_P, CO_P, { name: "QA Clerk", scope: "company", permissions: perms({ view: true, create: false, edit: false, delete: false, approve: false }) });
  if (mk.status !== 201) return [false, `create role ${mk.status} ${JSON.stringify(mk.body).slice(0, 150)}`];
  await h.admin(async (c) => { await c.query(`insert into company_members(company_id,user_id,role_id) values ('${CO_P}','${clerk}','${mk.body.id}')`); });
  const prj = (await raw("POST", "/v1/projects", OWN_P, CO_P, { name: "QA Pro Project" })).body;
  const ty = (await raw("GET", "/v1/property-types", OWN_P, CO_P)).body; const typeId = (ty.rows ?? ty)[0].id;
  const pr = (await raw("POST", "/v1/properties", OWN_P, CO_P, { title: "QA pro plot", typeId, listPrice: "1000" })).body;
  const pc = (await raw("POST", "/v1/parties", OWN_P, CO_P, { name: "QA pro cust", roles: ["customer"] })).body;
  const attempt = () => raw("POST", "/v1/bookings", clerk, CO_P, { propertyId: pr.id, customerId: pc.id, paymentType: "cash" });
  const a1 = await attempt(); if (a1.status !== 403) bad.push(`view-only clerk booked ${a1.status}`);
  const up = await raw("PUT", `/v1/roles/${mk.body.id}`, OWN_P, CO_P, { name: "QA Clerk", scope: "company", permissions: perms({ view: true, create: true, edit: false, delete: false, approve: false }) });
  const a2 = await attempt(); if (a2.status !== 201) bad.push(`after grant ${a2.status} ${JSON.stringify(a2.body).slice(0, 100)}`);
  await raw("PUT", `/v1/roles/${mk.body.id}`, OWN_P, CO_P, { name: "QA Clerk", scope: "company", permissions: perms({ view: false, create: false, edit: false, delete: false, approve: false }) });
  const a3 = await raw("GET", "/v1/bookings", clerk, CO_P); if (a3.status !== 403) bad.push(`after removal still sees bookings ${a3.status}`);
  const delInUse = await raw("DELETE", `/v1/roles/${mk.body.id}`, OWN_P, CO_P);
  return [bad.length === 0, bad.join(" | ") + ` update ${up.status}; delete role in use → ${delInUse.status} ${delInUse.body?.error?.message ?? ""}`];
});
await t("L2", "System roles protected", async () => {
  const r1 = await raw("DELETE", `/v1/roles/${ROLE_P}`, OWN_P, CO_P); const r2 = await raw("PUT", `/v1/roles/${ROLE_P}`, OWN_P, CO_P, { name: "Hacked", scope: "company", permissions: {} });
  const r3 = await raw("DELETE", `/v1/roles/${ID.roleOwner}`, OWN_P, CO_P);
  return [r1.status >= 400 && r2.status >= 400 && r3.status >= 400, `delete own system role ${r1.status} ${r1.body?.error?.code}; edit ${r2.status} ${r2.body?.error?.code}; delete role of another org ${r3.status}`];
});
// ── B5 maker-checker
await t("B5", "Voucher self-approval setting on/off", async () => {
  const bad: string[] = [];
  const mk = async (as: string) => { const v = (await raw("POST", "/v1/vouchers", as, A, { type: "JV", date: "2026-11-03", lines: [{ accountId: leaf[0].id, debit: "12" }, { accountId: leaf[1].id, credit: "12" }] })).body; await raw("POST", `/v1/vouchers/${v.id}/submit`, as, A); return v; };
  const off = await raw("PATCH", "/v1/company", alice, A, { voucherSelfApproval: false }); const v1 = await mk(alice); const self = await raw("POST", `/v1/vouchers/${v1.id}/approve`, alice, A, {});
  if (self.status < 400) bad.push("self-approval allowed while OFF");
  const v2 = await mk(ID.frank); const other = await raw("POST", `/v1/vouchers/${v2.id}/approve`, alice, A, {}); if (other.status !== 200) bad.push(`other approver ${other.status} ${JSON.stringify(other.body).slice(0, 100)}`);
  await raw("PATCH", "/v1/company", alice, A, { voucherSelfApproval: true }); const v3 = await mk(alice); const on = await raw("POST", `/v1/vouchers/${v3.id}/approve`, alice, A, {}); if (on.status !== 200) bad.push(`self-approval refused while ON ${on.status}`);
  return [bad.length === 0, bad.join(" | ") + ` OFF: self ${self.status} ${self.body?.error?.message ?? ""}; other ${other.status}; ON: ${on.status}`];
});
// ── D7 / G9 / D4
await t("D7", "Edit price after booking; booking keeps agreed price", async () => {
  const c = await mkCust("QA price cust"); const { p, b } = await mkBooking(c.id, "100000");
  const ed = await raw("PATCH", `/v1/properties/${p.id}`, alice, A, { listPrice: "250000" }); const g = (await raw("GET", `/v1/bookings/${b.id}`, alice, A)).body;
  return [g.netPrice === "100000.00", `edit ${ed.status}; booking net price ${g.netPrice} list ${g.listPrice}`];
});
await t("G9", "Receipt on cancelled booking; on cash booking with no schedule", async () => {
  const c = await mkCust("QA g9 cust"); const { b } = await mkBooking(c.id); await raw("POST", `/v1/bookings/${b.id}/status`, alice, A, { to: "cancelled", reason: "QA g9" });
  const r1 = await raw("POST", "/v1/receipts", alice, A, { bookingId: b.id, amount: "100", method: "cash" });
  const p = await mkProp("QA cash plot"); const cb = (await raw("POST", "/v1/bookings", alice, A, { propertyId: p.id, customerId: c.id, paymentType: "cash" })).body;
  const r2 = await raw("POST", "/v1/receipts", alice, A, { bookingId: cb.id, amount: "100", method: "cash" });
  return [true, `receipt on CANCELLED booking → ${r1.status} ${r1.body?.error?.message ?? r1.body?.receiptNo}; receipt on cash booking → ${r2.status} ${r2.body?.error?.message ?? r2.body?.receiptNo}`];
});
// ── G6 late fees
await t("G6", "Late fee: rule, grace, assess, no duplicate, receipt pays it first, waive", async () => {
  const bad: string[] = []; const log: string[] = [];
  await raw("PATCH", "/v1/company", alice, A, { penaltyRatePctMonth: 5, penaltyGraceDays: 5 });
  const c = await mkCust("QA late cust"); const { b } = await mkBooking(c.id, "100000", 2, "0", "2026-09-01");
  const ex = (await raw("GET", `/v1/bookings/${b.id}/extras`, alice, A)).body; log.push(`rule ${JSON.stringify(ex.penaltyRule)}; suggestions ${JSON.stringify(ex.penaltySuggestions).slice(0, 220)}`);
  const full = (await raw("GET", `/v1/bookings/${b.id}`, alice, A)).body; const i0 = full.installments[0];
  const a1 = await raw("POST", `/v1/installments/${i0.id}/penalty`, alice, A, { amount: "500.00", reason: "QA late" }); const a2 = await raw("POST", `/v1/installments/${i0.id}/penalty`, alice, A, { amount: "500.00", reason: "QA late again" });
  log.push(`assess ${a1.status}, again ${a2.status}`);
  const ex2 = (await raw("GET", `/v1/bookings/${b.id}/extras`, alice, A)).body; const pen = ex2.penalties ?? [];
  const rc = await raw("POST", "/v1/receipts", alice, A, { bookingId: b.id, amount: "500.00", method: "cash" });
  const ex3 = (await raw("GET", `/v1/bookings/${b.id}/extras`, alice, A)).body; const full2 = (await raw("GET", `/v1/bookings/${b.id}`, alice, A)).body;
  log.push(`penalties after assess ${pen.length} (${pen.map((p: any) => p.amount + "/" + p.status)}); after 500 receipt: penalties ${(ex3.penalties ?? []).map((p: any) => p.amount + "/" + p.status + "/paid" + (p.paidAmount ?? p.paid))}, inst0 paid ${full2.installments[0].paidAmount}`);
  const wv = pen[0] ? await raw("POST", `/v1/penalties/${pen[0].id}/waive`, alice, A, { reason: "QA waive" }) : null; log.push(`waive ${wv?.status}`);
  if (a2.status < 400 && pen.length > 1) bad.push(`duplicate penalty on same installment accepted (${pen.length})`);
  return [bad.length === 0, bad.join(" | ") + " " + log.join(" ; ")];
});
// ── H10 cheques
let bankAcc: any;
await t("H10", "Post-dated cheque: create, deposit, clear → receipt; bounce restores dues", async () => {
  const bad: string[] = []; const log: string[] = [];
  const ba = await raw("POST", "/v1/bank-accounts", alice, A, { accountTitle: "QA Bank AC", accountNo: "QA-12345678", bankName: "Meezan Bank" }); log.push(`bank account ${ba.status} ${ba.status > 300 ? JSON.stringify(ba.body).slice(0, 120) : ""}`); bankAcc = ba.body;
  const c = await mkCust("QA cheque cust"); const { b } = await mkBooking(c.id, "100000", 2, "20000", "2026-12-01");
  const ch = await raw("POST", "/v1/cheques", alice, A, { chequeNo: "QA-001", bankName: "HBL", partyId: c.id, bookingId: b.id, amount: "20000", chequeDate: "2026-11-10" }); log.push(`create ${ch.status}`);
  const bad1 = await raw("POST", `/v1/cheques/${ch.body.id}/clear`, alice, A, { bankAccountId: bankAcc?.id }); log.push(`clear before deposit ${bad1.status}`); if (bad1.status < 400) bad.push("cleared without deposit");
  const dep = await raw("POST", `/v1/cheques/${ch.body.id}/deposit`, alice, A, { bankAccountId: bankAcc?.id }); const clr = await raw("POST", `/v1/cheques/${ch.body.id}/clear`, alice, A, { bankAccountId: bankAcc?.id });
  const g1 = (await raw("GET", `/v1/bookings/${b.id}`, alice, A)).body; log.push(`deposit ${dep.status}, clear ${clr.status}; installment0 ${g1.installments[0].status}/${g1.installments[0].paidAmount}`);
  const clr2 = await raw("POST", `/v1/cheques/${ch.body.id}/clear`, alice, A, { bankAccountId: bankAcc?.id }); if (clr2.status < 400) bad.push("cleared twice");
  const bn = await raw("POST", `/v1/cheques/${ch.body.id}/bounce`, alice, A, { reason: "QA bounce" }); const g2 = (await raw("GET", `/v1/bookings/${b.id}`, alice, A)).body;
  log.push(`bounce after clear ${bn.status} ${bn.body?.error?.message ?? ""}; installment0 ${g2.installments[0].status}/${g2.installments[0].paidAmount}`);
  const ch2 = await raw("POST", "/v1/cheques", alice, A, { chequeNo: "QA-002", bankName: "HBL", partyId: c.id, bookingId: b.id, amount: "5000", chequeDate: "2026-11-10" });
  await raw("POST", `/v1/cheques/${ch2.body.id}/deposit`, alice, A, { bankAccountId: bankAcc?.id }); const bn2 = await raw("POST", `/v1/cheques/${ch2.body.id}/bounce`, alice, A, { reason: "QA bounce 2" }); log.push(`deposit then bounce ${bn2.status}`);
  const dupe = await raw("POST", "/v1/cheques", alice, A, { chequeNo: "QA-001", bankName: "HBL", partyId: c.id, amount: "1", chequeDate: "2026-11-10" }); log.push(`duplicate cheque no ${dupe.status}`);
  return [bad.length === 0 && ch.status === 201 && clr.status < 300, bad.join(" | ") + " " + log.join(" ; ") + ` TB ${JSON.stringify(await tb())}`];
});
// ── H9 bank statement import
await t("H9", "Bank statement: import, malformed, duplicate lines, reconcile", async () => {
  if (!bankAcc?.id) return [false, "no bank account (H10 failed)"];
  const log: string[] = [];
  const good = await raw("POST", `/v1/bank-accounts/${bankAcc.id}/statements`, alice, A, { label: "QA stmt", periodFrom: "2026-11-01", periodTo: "2026-11-30", openingBalance: "0", closingBalance: "20000", lines: [{ date: "2026-11-10", description: "QA deposit", reference: "QA-001", credit: "20000", debit: "0" }] }); log.push(`good ${good.status} ${good.status > 300 ? JSON.stringify(good.body).slice(0, 200) : ""}`);
  const again = await raw("POST", `/v1/bank-accounts/${bankAcc.id}/statements`, alice, A, { label: "QA stmt", periodFrom: "2026-11-01", periodTo: "2026-11-30", openingBalance: "0", closingBalance: "20000", lines: [{ date: "2026-11-10", description: "QA deposit", reference: "QA-001", credit: "20000", debit: "0" }] }); log.push(`re-import same statement ${again.status}`);
  const mal = await raw("POST", `/v1/bank-accounts/${bankAcc.id}/statements`, alice, A, { periodFrom: "2026-13-01", periodTo: "x", openingBalance: "abc", closingBalance: "1", lines: "nope" }); log.push(`malformed ${mal.status}`);
  const big = await raw("POST", `/v1/bank-accounts/${bankAcc.id}/statements`, alice, A, { periodFrom: "2026-11-01", periodTo: "2026-11-30", openingBalance: "0", closingBalance: "0", lines: Array.from({ length: 3000 }, (_, i) => ({ date: "2026-11-10", description: "x" + i, debit: "1", credit: "0" })) }); log.push(`3000 lines ${big.status} ${big.status > 300 ? JSON.stringify(big.body).slice(0, 100) : ""}`);
  return [good.status === 201 && mal.status === 400, log.join(" ; ")];
});
// ── H12 budgets
await t("H12", "Budget control: none / warn / block when a voucher goes over", async () => {
  const bad: string[] = []; const log: string[] = [];
  const mk = async (mode: string) => { const b = await raw("POST", "/v1/budgets", alice, A, { name: "QA budget " + mode, kind: "project", projectId: ID.prjA, controlMode: mode, lines: [{ category: "QA rent", accountId: expAcc.id, amount: "1000" }] }); await raw("POST", `/v1/budgets/${b.body?.id}/submit`, alice, A); const ap = await raw("POST", `/v1/budgets/${b.body?.id}/approve`, alice, A, {}); return [b, ap] as const; };
  const [b1, ap1] = await mk("block"); log.push(`budget ${b1.status}/${ap1.status}`);
  const chk = await raw("POST", "/v1/budget-check", alice, A, { accountId: expAcc.id, projectId: ID.prjA, amount: "5000" }); log.push(`check 5000 vs 1000: ${JSON.stringify(chk.body)}`);
  const cash = accts.find((a: any) => a.code === "03.01.01.0001")?.id;
  const v = (await raw("POST", "/v1/vouchers", alice, A, { type: "CPV", date: "2026-11-03", description: "QA over budget", controlAccountId: cash, lines: [{ accountId: expAcc.id, projectId: ID.prjA, debit: "5000" }] })); log.push(`CPV create ${v.status} ${v.status > 300 ? JSON.stringify(v.body).slice(0, 120) : ""}`);
  if (v.status === 201) { await raw("POST", `/v1/vouchers/${v.body.id}/submit`, alice, A); const ap = await raw("POST", `/v1/vouchers/${v.body.id}/approve`, alice, A, {}); log.push(`approve over BLOCK budget → ${ap.status} ${ap.body?.error?.message ?? ""}`); if (ap.status < 400) bad.push("BLOCK budget allowed overspend");
    await raw("PATCH", `/v1/budgets/${b1.body.id}`, alice, A, { controlMode: "none" }); const ap2 = await raw("POST", `/v1/vouchers/${v.body.id}/approve`, alice, A, {}); log.push(`after mode none → ${ap2.status}`); if (ap2.status >= 400) bad.push("mode none still blocks"); }
  const edit = await raw("PUT", `/v1/budgets/${b1.body.id}/lines`, alice, A, { lines: [{ category: "QA rent", accountId: expAcc.id, amount: "99999" }] }); log.push(`edit approved budget lines → ${edit.status}`); if (edit.status < 400) bad.push("approved budget line edited directly");
  return [bad.length === 0, bad.join(" | ") + " " + log.join(" ; ")];
});
// ── I staff leave payroll
await t("I1-I3", "Staff, leave (overlap, balance), payroll (twice, approve, pay)", async () => {
  const bad: string[] = []; const log: string[] = [];
  const e = await raw("POST", "/v1/employees", alice, A, { fullName: "QA Employee", designation: "Clerk", joinDate: "2026-01-01", basicSalary: "50000", houseAllowance: "10000.50" }); log.push(`employee ${e.status}`);
  const e2 = await raw("POST", "/v1/employees", alice, A, { fullName: "QA Employee Two", joinDate: "2026-01-01", basicSalary: "30000" });
  const lt = (await raw("GET", "/v1/leave/types", alice, A)).body; const annual = lt[0];
  const l1 = await raw("POST", "/v1/leave/requests", alice, A, { employeeId: e.body.id, leaveTypeId: annual.id, fromDate: "2026-11-10", toDate: "2026-11-12", reason: "QA" });
  const l2 = await raw("POST", "/v1/leave/requests", alice, A, { employeeId: e.body.id, leaveTypeId: annual.id, fromDate: "2026-11-11", toDate: "2026-11-13" });
  const l3 = await raw("POST", "/v1/leave/requests", alice, A, { employeeId: e.body.id, leaveTypeId: annual.id, fromDate: "2026-11-20", toDate: "2026-11-10" });
  const l4 = await raw("POST", "/v1/leave/requests", alice, A, { employeeId: e.body.id, leaveTypeId: annual.id, fromDate: "2026-12-01", toDate: "2026-12-31", days: 400 });
  log.push(`leave: 3 days ${l1.status}; overlapping ${l2.status} ${l2.body?.error?.message ?? ""}; to<from ${l3.status}; huge ${l4.status} ${l4.body?.error?.message ?? ""}`);
  if (l2.status < 400) bad.push("overlapping leave accepted"); if (l3.status < 400) bad.push("to before from accepted");
  const dec = await raw("POST", `/v1/leave/requests/${l1.body.id}/decide`, alice, A, { approve: true }); const dec2 = await raw("POST", `/v1/leave/requests/${l1.body.id}/decide`, alice, A, { approve: false }); log.push(`approve ${dec.status}; reverse decision ${dec2.status}`);
  const bal = (await raw("GET", "/v1/leave/balances", alice, A)).body; log.push(`balances ${JSON.stringify(bal).slice(0, 160)}`);
  const p1 = await raw("POST", "/v1/payroll", alice, A, { month: "2026-10" }); const p2 = await raw("POST", "/v1/payroll", alice, A, { month: "2026-10" }); const p3 = await raw("POST", "/v1/payroll", alice, A, { month: "2026-13" });
  log.push(`payroll run ${p1.status}, same month again ${p2.status} ${p2.body?.error?.message ?? ""}, bad month ${p3.status}`); if (p2.status < 400) bad.push("duplicate payroll run accepted");
  const pd = (await raw("GET", `/v1/payroll/${p1.body.id}`, alice, A)).body; const lines = pd.lines ?? [];
  const sumNet = lines.reduce((s: number, l: any) => s + Math.round(Number(l.netPay ?? l.net) * 100), 0); log.push(`lines ${lines.length}, net total field ${pd.totalNet ?? pd.total_net ?? JSON.stringify(Object.keys(pd))}, sum of lines ${sumNet / 100}`);
  const ap = await raw("POST", `/v1/payroll/${p1.body.id}/approve`, alice, A); const ap2 = await raw("POST", `/v1/payroll/${p1.body.id}/approve`, alice, A);
  const pay = await raw("POST", `/v1/payroll/${p1.body.id}/pay`, alice, A, {}); const pay2 = await raw("POST", `/v1/payroll/${p1.body.id}/pay`, alice, A, {});
  log.push(`approve ${ap.status}/again ${ap2.status}; pay ${pay.status}/again ${pay2.status} ${pay2.body?.error?.message ?? ""}`); if (ap2.status < 400 && ap.status < 400) bad.push("approved twice"); if (pay2.status < 400) bad.push("paid twice");
  return [bad.length === 0, bad.join(" | ") + " " + log.join(" ; ") + ` TB ${JSON.stringify(await tb())}`];
});
// ── H6 fiscal
await t("H6", "Fiscal boundary: 30 June / 1 July vouchers, period labels", async () => {
  const mk = async (d: string) => { const v = (await raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: d, lines: [{ accountId: leaf[0].id, debit: "3" }, { accountId: leaf[1].id, credit: "3" }] })).body; await raw("POST", `/v1/vouchers/${v.id}/submit`, alice, A); const ap = await raw("POST", `/v1/vouchers/${v.id}/approve`, alice, A, {}); return { d, ap: ap.status, v }; };
  const a = await mk("2027-06-30"), b = await mk("2027-07-01"), c = await mk("2028-02-29");
  const per = await h.admin(async (cl) => (await cl.query(`select to_char(entry_date,'YYYY-MM-DD') d, period_id from journal_entries where entry_date in ('2027-06-30','2027-07-01','2028-02-29') order by 1`)).rows);
  return [a.ap === 200 && b.ap === 200 && c.ap === 200, `approve ${a.ap},${b.ap},${c.ap}; periods ${JSON.stringify(per).slice(0, 400)}`];
});
// ── P3 concurrency
await t("P3", "Concurrency: 10 parallel receipts on one installment; 5 parallel approvals; 3 parallel voids", async () => {
  const bad: string[] = []; const log: string[] = [];
  const c = await mkCust("QA conc cust"); const { b } = await mkBooking(c.id, "50000", 1, "5000", "2026-12-01");
  const rs = await Promise.all(Array.from({ length: 10 }, () => raw("POST", "/v1/receipts", alice, A, { bookingId: b.id, amount: "1000", method: "cash" })));
  const bb = (await raw("GET", `/v1/bookings/${b.id}`, alice, A)).body; const i0 = bb.installments[0];
  log.push(`10x1000 vs installment 5000: statuses ${rs.map((r) => r.status).join("")}, installment0 ${i0.status}/${i0.paidAmount}, booking paid ${bb.paidAmount}`);
  const alloc = await h.admin(async (cl) => (await cl.query(`select coalesce(sum(ra.amount),0)::text a, (select coalesce(sum(amount),0)::text from receipts where booking_id=$1 and status='posted') r from receipt_allocations ra join receipts r on r.id = ra.receipt_id where r.booking_id=$1`, [b.id])).rows[0]);
  log.push(`allocations ${alloc.a} vs receipts ${alloc.r}`); if (Number(alloc.a) > Number(alloc.r)) bad.push("allocated more than received");
  if (Number(i0.paidAmount) > 5000) bad.push("installment overpaid");
  const v = (await raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-11-03", lines: [{ accountId: leaf[0].id, debit: "333" }, { accountId: leaf[1].id, credit: "333" }] })).body; await raw("POST", `/v1/vouchers/${v.id}/submit`, alice, A);
  const before = Number((await tb()).debit);
  const aps = await Promise.all(Array.from({ length: 5 }, () => raw("POST", `/v1/vouchers/${v.id}/approve`, alice, A, {}))); const after = Number((await tb()).debit);
  log.push(`5 parallel approvals → ${aps.map((r) => r.status).join(",")}; ledger moved ${(after - before).toFixed(2)} (expected 333)`); if (Math.abs(after - before - 333) > 0.001) bad.push("double posting on parallel approve");
  const r0 = rs.find((r) => r.status === 201)!.body; const vs = await Promise.all(Array.from({ length: 3 }, () => raw("POST", `/v1/receipts/${r0.id}/void`, alice, A, { reason: "QA parallel void" }))); log.push(`3 parallel voids → ${vs.map((r) => r.status).join(",")}`);
  if (vs.filter((r) => r.status === 200).length !== 1) bad.push("void not exactly once");
  return [bad.length === 0, bad.join(" | ") + " " + log.join(" ; ")];
});
// ── J4 scaled data
await t("J4", "Scale: 2,000 properties + 600 posted vouchers: list/report timings", async () => {
  await h.admin(async (cl) => { await cl.query(`insert into properties(company_id,project_id,type_id,code,title,list_price) select '${A}','${ID.prjA}','${ID.typeA}','BULK-'||g,'QA bulk '||g,1000000 from generate_series(1,2000) g`); });
  const time = async (p: string) => { const t0 = Date.now(); const r = await raw("GET", p, alice, A); return `${p.split("?")[0].replace("/v1/", "")}:${r.status}:${Date.now() - t0}ms:${JSON.stringify(r.body).length >> 10}KB`; };
  const lines: string[] = [];
  for (const p of ["/v1/properties", "/v1/properties?limit=200", "/v1/properties?search=bulk%201999", "/v1/dashboard", "/v1/projects", "/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31"]) lines.push(await time(p));
  const t0 = Date.now(); let ok = 0;
  for (let i = 0; i < 600; i++) { const v = await raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-11-03", lines: [{ accountId: leaf[0].id, debit: "1.01" }, { accountId: leaf[1].id, credit: "1.01" }] }); await raw("POST", `/v1/vouchers/${v.body.id}/submit`, alice, A); const a = await raw("POST", `/v1/vouchers/${v.body.id}/approve`, alice, A, {}); if (a.status === 200) ok++; }
  const per = ((Date.now() - t0) / 600).toFixed(0);
  for (const p of ["/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31", "/v1/vouchers", "/v1/dashboard", `/v1/accounts/${leaf[0].id}/ledger`, "/v1/reports/balance-sheet?asOf=2026-11-30", "/v1/reports/income-statement?from=2026-07-01&to=2026-11-30"]) lines.push(await time(p));
  return [ok === 600, `posted ${ok}/600 (~${per} ms per voucher cycle in-process); ${lines.join(" | ")}`];
});
await t("H16b", "Ledger invariants after the whole run", async () => {
  const bad: string[] = [];
  await h.admin(async (c) => {
    const v = await c.query(`select * from v_reconciliation`); if (v.rowCount) bad.push("v_reconciliation: " + JSON.stringify(v.rows.slice(0, 3)).slice(0, 300));
    const j = await c.query(`select coalesce(sum(debit),0)::text d, coalesce(sum(credit),0)::text c from journal_lines`).catch(() => null); if (j && j.rows[0].d !== j.rows[0].c) bad.push(`journal ${j.rows[0].d} vs ${j.rows[0].c}`);
    const ov = await c.query(`select count(*)::int n from installments where paid_amount > amount`).catch(() => ({ rows: [{ n: 0 }] })); if (ov.rows[0].n) bad.push(`${ov.rows[0].n} installments overpaid`);
    const gaps = await c.query(`select * from v_tenant_fk_gaps`).catch(() => null); if (gaps?.rowCount) bad.push("tenant fk gaps " + gaps.rowCount);
    const conv = await c.query(`select * from v_convention_gaps`).catch(() => null); if (conv?.rowCount) bad.push("convention gaps " + conv.rowCount);
    const orphans = await c.query(`select count(*)::int n from journal_entries e where source_type = 'voucher' and not exists (select 1 from vouchers v where v.id = e.source_id and v.status in ('approved','void'))`).catch(() => ({ rows: [{ n: 0 }] })); if (orphans.rows[0].n) bad.push(`${orphans.rows[0].n} journal entries whose voucher is not approved/void`);
    const voidNoRev = await c.query(`select v.number from vouchers v where v.status = 'void' and v.journal_entry_id is not null and not exists (select 1 from journal_entries r where r.reverses_id = v.journal_entry_id or r.reversal_of = v.journal_entry_id)`).catch(async () => ({ rows: [{ number: "(reversal column unknown)" }], rowCount: 0 })); if (voidNoRev.rowCount) bad.push(`void vouchers without a reversal entry: ${voidNoRev.rows.map((r: any) => r.number).join(",")}`);
  });
  return [bad.length === 0, bad.join(" | ")];
});
const pass = out.filter((o) => o.ok).length;
console.log(`\nSUMMARY ${pass}/${out.length} pass`);
await h.close(); process.exit(0);
