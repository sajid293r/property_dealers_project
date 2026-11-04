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
const cust = (await raw("POST", "/v1/parties", alice, A, { name: "QA Buyer", roles: ["customer"], phone: "+92 300 1234567" })).body;
const tb = async (to = "2999-12-31") => (await raw("GET", `/v1/reports/trial-balance?from=2000-01-01&to=${to}`, alice, A));
const jv = (d: string, amt: string, extra: any = {}) => raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: d, lines: [{ accountId: leaf[0].id, debit: amt }, { accountId: leaf[1].id, credit: amt }], ...extra });

await t("H5", "DELETE an APPROVED voucher: does it reverse the ledger entry?", async () => {
  const before = await tb();
  const v = (await jv("2026-09-20", "777.00", { description: "QA delete-approved" })).body;
  await raw("POST", `/v1/vouchers/${v.id}/submit`, alice, A);
  const ap = await raw("POST", `/v1/vouchers/${v.id}/approve`, alice, A, {});
  const mid = await tb();
  const del = await raw("DELETE", `/v1/vouchers/${v.id}`, alice, A);
  const after = await tb();
  const g = await raw("GET", `/v1/vouchers/${v.id}`, alice, A);
  const entries = await h.admin(async (c) => (await c.query(`select count(*)::int n from journal_entries where source_id=$1`, [v.id])).rows[0]);
  const dr = (x: any) => x.body.totals.debit;
  return [!(del.status === 204 && g.body.status === "void" && dr(after) === dr(mid) && dr(mid) !== dr(before)), `approve ${ap.status}; delete ${del.status}; voucher now '${g.body.status}'; TB debit before=${dr(before)} approved=${dr(mid)} after-delete=${dr(after)}; journal entries=${JSON.stringify(entries)}`];
});
await t("H5b", "DELETE approved voucher as accountant (no approve right)", async () => {
  const v = (await jv("2026-09-20", "11")).body;
  await raw("POST", `/v1/vouchers/${v.id}/submit`, alice, A); await raw("POST", `/v1/vouchers/${v.id}/approve`, alice, A, {});
  const del = await raw("DELETE", `/v1/vouchers/${v.id}`, ID.frank, A);
  return [del.status >= 400, `accountant delete of approved voucher → ${del.status} ${JSON.stringify(del.body).slice(0, 120)}`];
});
await t("H7", "Trial balance balanced at many dates", async () => {
  const bad: string[] = []; const seen: string[] = [];
  for (const d of ["2026-06-30", "2026-07-01", "2026-09-20", "2026-12-31", "2999-12-31"]) { const r = await tb(d); const dr = r.body.totals?.debit, cr = r.body.totals?.credit; seen.push(`${d}:${dr}/${cr}`); if (r.status !== 200 || Math.abs(dr - cr) > 0.005) bad.push(`${d} ${r.status} ${dr} ${cr}`); }
  return [bad.length === 0, bad.join(" | ") + " " + seen.join(" ")];
});
await t("L1", "Self change of role/status refused", async () => {
  const self = await raw("PATCH", `/v1/members/${OWN_P}`, OWN_P, CO_P, { status: "suspended" });
  const self2 = await raw("PATCH", `/v1/members/${OWN_P}`, OWN_P, CO_P, { roleId: ROLE_P });
  const viewer = await raw("PATCH", `/v1/members/${ID.alice}`, ID.bob, A, { status: "suspended" });
  return [self.status === 409 && self2.status === 409 && viewer.status === 403, `self-suspend ${self.status}; self-role ${self2.status}; viewer-suspends-owner ${viewer.status}`];
});
await t("L1b", "Admin (not owner) suspends/demotes the only Owner", async () => {
  const adminRole = "b4000000-0000-0000-0000-000000000001", adm = U(50);
  await h.admin(async (c) => {
    await c.query(`insert into users(id,email,full_name) values ('${adm}','adm@x.pk','Adm')`);
    await c.query(`insert into roles(id,org_id,name,is_system) values ('${adminRole}','${ORG_P}','Administrator',true)`);
    for (const m of MODULE_KEYS) await c.query(`insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,$2,true,true,true,false,true,'company')`, [adminRole, m]);
    await c.query(`insert into company_members(company_id,user_id,role_id) values ('${CO_P}','${adm}','${adminRole}')`);
  });
  emails[adm] = "adm@x.pk";
  const r1 = await raw("PATCH", `/v1/members/${OWN_P}`, adm, CO_P, { status: "suspended" });
  const r2 = await raw("PATCH", `/v1/members/${OWN_P}`, adm, CO_P, { roleId: adminRole });
  const own = await raw("GET", "/v1/members", OWN_P, CO_P);
  const m = own.body.members?.find((x: any) => x.userId === OWN_P);
  return [r1.status >= 400 && r2.status >= 400, `admin suspends last owner → ${r1.status} ${JSON.stringify(r1.body).slice(0, 110)}; admin demotes last owner → ${r2.status} ${JSON.stringify(r2.body).slice(0, 110)}; owner now ${JSON.stringify(m).slice(0, 150)}`];
});
await t("O1b", "Valid token of a user who is not in the database", async () => {
  emails["a9999999-0000-0000-0000-000000000009"] = "ghost@x.pk";
  const r = await raw("GET", "/v1/parties", "a9999999-0000-0000-0000-000000000009", A); const me = await raw("GET", "/v1/me", "a9999999-0000-0000-0000-000000000009", null);
  return [r.status === 403 && me.status === 200, `parties ${r.status}; me ${me.status} companies=${JSON.stringify(me.body?.companies)}`];
});
await t("C2b", "Cross-company writes with valid bodies", async () => {
  const bad: string[] = [];
  const r1 = await raw("PATCH", `/v1/parties/${ID.custA}`, ID.carol, ID.coB, { city: "HACKED" });
  const r2 = await raw("PATCH", `/v1/properties/${ID.propA(1)}`, ID.carol, ID.coB, { listPrice: "1" });
  const r3 = await raw("POST", `/v1/properties/${ID.propA(1)}/holds`, ID.carol, ID.coB, { minutes: 30 });
  const r4 = await raw("POST", `/v1/bookings/${ID.custA}/status`, ID.carol, ID.coB, { to: "cancelled", reason: "hack" });
  const r5 = await raw("DELETE", `/v1/vouchers/${ID.custA}`, ID.carol, ID.coB);
  const chk = JSON.stringify((await raw("GET", `/v1/parties/${ID.custA}`, alice, A)).body) + JSON.stringify((await raw("GET", `/v1/properties/${ID.propA(1)}`, alice, A)).body);
  if (/HACKED/.test(chk)) bad.push("A CHANGED");
  for (const [n, r] of [["party", r1], ["prop", r2], ["hold", r3], ["status", r4], ["voucher", r5]] as const) if (r.status < 400) bad.push(`${n}→${r.status}`);
  return [bad.length === 0, bad.join(", ") + ` [${[r1, r2, r3, r4, r5].map((r) => r.status)}]`];
});
await t("O6b", "Probe table: odd inputs and what comes back", async () => {
  const L = (a: string, b: string) => [a, b];
  const probes: [string, any][] = [
    ["invalid JSON body", await raw("POST", "/v1/parties", alice, A, "not json" as any)],
    ["unknown account ids", await raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-09-20", lines: [{ accountId: "11111111-1111-1111-1111-111111111111", debit: "5" }, { accountId: "11111111-1111-1111-1111-111111111112", credit: "5" }] })],
    ["2MB body", await raw("POST", "/v1/parties", alice, A, { name: "x".repeat(2_000_000), roles: ["customer"] })],
    ["date 2026-02-30", await jv("2026-02-30", "5")], ["date 2026-02-29", await jv("2026-02-29", "5")], ["date 0001-01-01", await jv("0001-01-01", "5")],
    ["date 9999-12-31", await jv("9999-12-31", "5")], ["date 2028-02-29", await jv("2028-02-29", "5")], ["date 2026-06-30", await jv("2026-06-30", "5")], ["date 2026-07-01", await jv("2026-07-01", "5")],
    ["99999999.99", await jv("2026-09-20", "99999999.99")], ["100000000", await jv("2026-09-20", "100000000")], ["1e19 digits", await jv("2026-09-20", "10000000000000000000")],
    ["0.01", await jv("2026-09-20", "0.01")], ["10.555", await jv("2026-09-20", "10.555")], ["1,234.50", await jv("2026-09-20", "1,234.50")],
  ];
  return [true, probes.map(([n, r]) => `${n} → ${r.status} ${r.body?.error?.code ?? r.body?.number ?? ""} ${JSON.stringify(r.body?.error?.details ?? "").slice(0, 80)}`).join(" || ")];
});
await t("F5", "Plan 1,000,000 / 7 installments", async () => {
  const pr = (await raw("POST", "/v1/properties", alice, A, { title: "QA plan plot", typeId: ID.typeA, projectId: ID.prjA, listPrice: "1000000" })).body;
  const b = (await raw("POST", "/v1/bookings", alice, A, { propertyId: pr.id, customerId: cust.id, paymentType: "installment" })).body;
  const r = await raw("POST", `/v1/bookings/${b.id}/schedule`, alice, A, { downPayment: "100000", installments: 7, firstDue: "2026-10-01" });
  const ins = r.body.installments ?? r.body.schedule ?? [];
  const sum = ins.reduce((s: number, i: any) => s + Math.round(Number(i.amount) * 100), 0);
  (globalThis as any).bk = b;
  return [r.status === 200 && sum === 100_000_000, `status ${r.status} ${r.status !== 200 ? JSON.stringify(r.body).slice(0, 150) : ""} keys=${Object.keys(r.body)} rows ${ins.length}, sum ${sum}, amounts ${ins.map((i: any) => i.amount).join(",")}`];
});
const bk = (globalThis as any).bk;
await t("F6", "Booking state machine", async () => {
  const bad: string[] = []; const log: string[] = [];
  const st = async (id: string, to: string, reason?: string) => { const r = await raw("POST", `/v1/bookings/${id}/status`, alice, A, { to, reason }); log.push(`${to}:${r.status}`); return r; };
  if ((await st(bk.id, "completed")).status < 400) bad.push("pending→completed accepted");
  const c = await st(bk.id, "confirmed"); if (c.status !== 200) bad.push(`confirm ${c.status} ${JSON.stringify(c.body).slice(0, 120)}`);
  if ((await st(bk.id, "completed")).status < 400) bad.push("complete with unpaid installments accepted");
  const pr2 = (await raw("POST", "/v1/properties", alice, A, { title: "QA sm2", typeId: ID.typeA, listPrice: "1000" })).body;
  const nb = (await raw("POST", "/v1/bookings", alice, A, { propertyId: pr2.id, customerId: cust.id, paymentType: "installment" })).body;
  if ((await st(nb.id, "confirmed")).status < 400) bad.push("confirm with no schedule accepted");
  if ((await st(nb.id, "cancelled")).status < 400) bad.push("cancel without reason accepted");
  if ((await st(nb.id, "cancelled", "QA cancel")).status !== 200) bad.push("cancel failed");
  if ((await st(nb.id, "confirmed")).status < 400) bad.push("cancelled→confirmed accepted");
  const pg = (await raw("GET", `/v1/properties/${pr2.id}`, alice, A)).body;
  if (pg.status !== "available") bad.push(`property after cancel is ${pg.status}`);
  return [bad.length === 0, bad.join(" | ") + " " + log.join(",")];
});
await t("G2", "Receipt allocation", async () => {
  const log: string[] = [];
  const get = async () => (await raw("GET", `/v1/bookings/${bk.id}`, alice, A)).body;
  const r1 = await raw("POST", "/v1/receipts", alice, A, { bookingId: bk.id, amount: "50000.50", method: "cash" }); log.push(`r1 ${r1.status}`);
  let b = await get(); const s = b.installments ?? b.schedule; log.push("keys " + Object.keys(b).join("/")); log.push("inst0 " + JSON.stringify(s?.[0]));
  const r2 = await raw("POST", "/v1/receipts", alice, A, { bookingId: bk.id, amount: "49999.50", method: "cash" });
  b = await get(); const i0 = (b.installments ?? b.schedule)[0], i1 = (b.installments ?? b.schedule)[1];
  log.push(`after 100000: i0 ${i0.status}/${i0.paidAmount ?? i0.paid}, i1 ${i1.status}/${i1.paidAmount ?? i1.paid}`);
  const r3 = await raw("POST", "/v1/receipts", alice, A, { bookingId: bk.id, amount: "99999999.99", method: "cash" }); log.push(`overpay ${r3.status} ${JSON.stringify(r3.body).slice(0, 120)}`);
  (globalThis as any).r1 = r1.body;
  return [r1.status === 201 && r2.status === 201 && i0.status === "paid", log.join(" ; ")];
});
await t("G4", "Void receipt", async () => {
  const r1 = (globalThis as any).r1; const bad: string[] = [];
  const v1 = await raw("POST", `/v1/receipts/${r1.id}/void`, alice, A, { reason: "QA void" }); if (v1.status !== 200) bad.push(`void ${v1.status} ${JSON.stringify(v1.body).slice(0, 100)}`);
  const v2 = await raw("POST", `/v1/receipts/${r1.id}/void`, alice, A, { reason: "QA void again" }); if (v2.status < 400) bad.push("second void accepted");
  const b = (await raw("GET", `/v1/bookings/${bk.id}`, alice, A)).body; const i0 = (b.installments ?? b.schedule)[0];
  const led = await tb();
  return [bad.length === 0, bad.join(" | ") + ` i0 ${i0.status}/${i0.paidAmount ?? i0.paid}; TB ${led.body.totals.debit}/${led.body.totals.credit}`];
});
await t("O8b", "CNIC text in audit log / list", async () => {
  const p = (await raw("POST", "/v1/parties", alice, A, { name: "QA audit cnic", roles: ["customer"], cnic: "35202-2222222-2" })).body;
  const au = JSON.stringify((await raw("GET", `/v1/audit?entityId=${p.id}`, alice, A)).body); const li = JSON.stringify((await raw("GET", `/v1/parties?search=QA%20audit`, alice, A)).body);
  const s1 = await raw("GET", "/v1/parties?search=35202-2222222-2", alice, A); const s2 = await raw("GET", "/v1/parties?search=3520222222222", alice, A);
  return [!/2222222/.test(au), `audit: ${au.match(/.{0,60}(cnic|2222).{0,60}/i)?.[0] ?? "no cnic text"}; list fields: ${li.match(/"cnic[^,]*/gi)}; search by full CNIC results ${s1.body?.length ?? s1.body?.rows?.length}/${s2.body?.length ?? s2.body?.rows?.length}`];
});
await t("H1", "Voucher numbering per type", async () => {
  const nums: string[] = [];
  for (const ty of ["CPV", "CRV", "BPV", "BRV", "CV", "JV", "CPV", "JV"]) {
    const r = await raw("POST", "/v1/vouchers", alice, A, { type: ty, date: "2026-09-20", lines: [{ accountId: leaf[0].id, debit: "5" }, { accountId: leaf[1].id, credit: "5" }] });
    nums.push(`${ty}:${r.status}:${r.body?.number ?? JSON.stringify(r.body?.error?.message ?? "").slice(0, 60)}`);
  }
  return [true, nums.join(" ")];
});
const pass = out.filter((o) => o.ok).length;
console.log(`\nSUMMARY ${pass}/${out.length} pass`);
await h.close(); process.exit(0);
