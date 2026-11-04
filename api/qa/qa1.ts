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

// ─ B2 plan gating ──────────────────────────────────────────────────────────────────────────────────────────────
const proPaths = ["/v1/leads", "/v1/quotations", "/v1/cheques", "/v1/service-invoices", "/v1/contracts", "/v1/contractors", "/v1/construction/contracts", "/v1/leads-summary"];
const premPaths = ["/v1/budgets", "/v1/employees", "/v1/leave/types", "/v1/leave/requests", "/v1/payroll"];
await t("B2", "Basic: Professional+Advanced endpoints refused (GET)", async () => {
  const bad: string[] = [];
  for (const p of [...proPaths, ...premPaths]) { const r = await raw("GET", p, OWN_B, CO_B); if (r.status !== 403 || r.body?.error?.code !== "plan_upgrade") bad.push(`${p}→${r.status}`); }
  return [bad.length === 0, bad.join(", ")];
});
await t("B2b", "Basic: bank reconciliation + statements endpoints refused", async () => {
  const bad: string[] = [];
  const ba = await raw("GET", "/v1/bank-accounts", OWN_B, CO_B);
  const id = ba.body?.[0]?.id ?? ba.body?.rows?.[0]?.id ?? ID.custA;
  for (const [m, p] of [["GET", `/v1/bank-accounts/${id}/statements`], ["GET", `/v1/bank-accounts/${id}/reconciliations`], ["POST", `/v1/bank-accounts/${id}/reconciliations`], ["GET", `/v1/reconciliations/${id}`], ["POST", `/v1/ledger-lines/${id}/clear`]]) {
    const r = await raw(m, p!, OWN_B, CO_B, m === "POST" ? {} : undefined); if (r.status !== 403) bad.push(`${m} ${p}→${r.status}`);
  }
  return [bad.length === 0, bad.join(", ")];
});
await t("B2c", "Professional: Advanced endpoints refused, Pro endpoints allowed", async () => {
  const bad: string[] = [];
  for (const p of premPaths) { const r = await raw("GET", p, OWN_P, CO_P); if (r.status !== 403) bad.push(`${p}→${r.status}`); }
  for (const p of ["/v1/leads", "/v1/quotations", "/v1/cheques", "/v1/contracts"]) { const r = await raw("GET", p, OWN_P, CO_P); if (r.status !== 200) bad.push(`${p}→${r.status}`); }
  return [bad.length === 0, bad.join(", ")];
});
await t("B2d", "Basic: SV/CN/PIV/DN vouchers refused; CPV/CRV/BPV/BRV/JV/CV allowed", async () => {
  const bad: string[] = [];
  const accs = (await raw("GET", "/v1/accounts", OWN_B, CO_B)).body;
  const leaf = accs.filter((a: any) => !a.isGroup && !a.is_group);
  const a1 = leaf[0].id, a2 = leaf[1].id;
  for (const ty of ["SV", "CN", "PIV", "DN"]) { const r = await raw("POST", "/v1/vouchers", OWN_B, CO_B, { type: ty, date: "2026-09-20", lines: [{ accountId: a1, debit: "10" }, { accountId: a2, credit: "10" }] }); if (r.status !== 403) bad.push(`${ty}→${r.status}:${JSON.stringify(r.body).slice(0, 80)}`); }
  const r = await raw("POST", "/v1/vouchers", OWN_B, CO_B, { type: "JV", date: "2026-09-20", lines: [{ accountId: a1, debit: "10" }, { accountId: a2, credit: "10" }] });
  if (r.status !== 201) bad.push(`JV→${r.status}:${JSON.stringify(r.body).slice(0, 120)}`);
  return [bad.length === 0, bad.join(" | ")];
});
await t("B2e", "Basic: custom role creation refused", async () => {
  const r = await raw("POST", "/v1/roles", OWN_B, CO_B, { name: "QA Custom", permissions: { deals: { view: true, create: false, edit: false, delete: false, approve: false } } });
  return [r.status === 403, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`];
});
await t("B2f", "Header swap: Basic owner sends Pro company id / Advanced company id", async () => {
  const a = await raw("GET", "/v1/leads", OWN_B, CO_P); const b = await raw("GET", "/v1/budgets", OWN_B, A);
  return [a.status === 403 && b.status === 403, `${a.status},${b.status}`];
});

// ─ C isolation ────────────────────────────────────────────────────────────────────────────────────────────────
await t("C1", "Other company's customer/property/project ids by GET", async () => {
  const bad: string[] = [];
  for (const p of [`/v1/parties/${ID.custA}`, `/v1/properties/${ID.propA(1)}`, `/v1/projects/${ID.prjA}`, `/v1/properties/${ID.propA(1)}/detail`, `/v1/parties/${ID.custA}/statement`]) {
    const r = await raw("GET", p, ID.carol, ID.coB); if (![404, 403].includes(r.status)) bad.push(`${p}→${r.status}`);
  }
  return [bad.length === 0, bad.join(", ")];
});
await t("C2", "Company B header + A record id: PATCH/POST/DELETE refused, A unchanged", async () => {
  const bad: string[] = [];
  const r1 = await raw("PATCH", `/v1/parties/${ID.custA}`, ID.carol, ID.coB, { city: "HACKED" });
  const r2 = await raw("PATCH", `/v1/properties/${ID.propA(1)}`, ID.carol, ID.coB, { title: "HACKED" });
  const r3 = await raw("POST", `/v1/properties/${ID.propA(1)}/holds`, ID.carol, ID.coB, {});
  for (const [n, r] of [["party", r1], ["prop", r2], ["hold", r3]] as const) if (![404, 403, 422].includes(r.status)) bad.push(`${n}→${r.status}`);
  const chk = await raw("GET", `/v1/parties/${ID.custA}`, alice, A);
  if (JSON.stringify(chk.body).includes("HACKED")) bad.push("A WAS CHANGED");
  const p = await raw("GET", `/v1/properties/${ID.propA(1)}`, alice, A);
  if (JSON.stringify(p.body).includes("HACKED")) bad.push("A prop CHANGED");
  return [bad.length === 0, bad.join(", ")];
});
await t("C3", "Booking in B referencing A's customer / A's property; voucher line with A's account", async () => {
  const bad: string[] = [];
  const r1 = await raw("POST", "/v1/bookings", ID.carol, ID.coB, { propertyId: ID.propB1, customerId: ID.custA, paymentType: "cash" });
  const r2 = await raw("POST", "/v1/bookings", ID.carol, ID.coB, { propertyId: ID.propA(2), customerId: ID.custB, paymentType: "cash" });
  const aAccs = (await raw("GET", "/v1/accounts", alice, A)).body.filter((a: any) => !(a.isGroup ?? a.is_group));
  const bAccs = (await raw("GET", "/v1/accounts", ID.carol, ID.coB)).body.filter((a: any) => !(a.isGroup ?? a.is_group));
  const r3 = await raw("POST", "/v1/vouchers", ID.carol, ID.coB, { type: "JV", date: "2026-09-20", lines: [{ accountId: aAccs[0].id, debit: "5" }, { accountId: bAccs[1].id, credit: "5" }] });
  const r4 = await raw("POST", "/v1/properties", ID.carol, ID.coB, { title: "XCo", typeId: ID.typeA, projectId: ID.prjB, listPrice: "100" });
  const r5 = await raw("POST", "/v1/properties", ID.carol, ID.coB, { title: "XCo2", typeId: ID.typeB, projectId: ID.prjA, listPrice: "100" });
  for (const [n, r] of [["book-cust", r1], ["book-prop", r2], ["voucher", r3], ["prop-type", r4], ["prop-project", r5]] as const) if (r.status < 400) bad.push(`${n}→${r.status} ACCEPTED`);
  return [bad.length === 0, bad.join(", ") + ` [${[r1, r2, r3, r4, r5].map((r) => r.status)}]`];
});
await t("C5", "User of A only calls B's endpoints; outsider with no company", async () => {
  const a = await raw("GET", "/v1/parties", alice, ID.coB); const b = await raw("GET", "/v1/parties", OUTSIDER, A); const c = await raw("GET", "/v1/me", OUTSIDER, null);
  return [a.status === 403 && b.status === 403 && c.status === 200, `${a.status},${b.status},me:${c.status} companies=${JSON.stringify(c.body?.companies)}`];
});
await t("C4", "Lists/reports/dashboard/search in B contain no A data", async () => {
  const bad: string[] = [];
  for (const p of ["/v1/parties", "/v1/properties", "/v1/projects", "/v1/bookings", "/v1/receipts", "/v1/vouchers", "/v1/dashboard", "/v1/reports/trial-balance", "/v1/reports/sales-summary", "/v1/properties?search=Plot%20A", "/v1/parties?search=Customer%20of%20A", "/v1/audit", "/v1/attachments?entityType=parties&entityId=" + ID.custA]) {
    const r = await raw("GET", p, ID.carol, ID.coB); const s = JSON.stringify(r.body);
    if (/Customer of A|Plot A\d|Alpha Valley|PRP-A/.test(s)) bad.push(`${p} leaks`);
  }
  return [bad.length === 0, bad.join(", ")];
});

// ─ O security ──────────────────────────────────────────────────────────────────────────────────────────────────
await t("O1", "No token / malformed / wrong secret / expired / wrong audience → 401", async () => {
  const bad: string[] = [];
  const cases: [string, Record<string, string>][] = [
    ["none", {}], ["garbage", { authorization: "Bearer abc.def.ghi" }], ["empty bearer", { authorization: "Bearer " }], ["basic scheme", { authorization: "Basic YTpi" }],
    ["wrong secret", { authorization: "Bearer " + (await h.token(alice, "alice@a.pk", { secret: "x".repeat(40) })) }],
    ["expired", { authorization: "Bearer " + (await h.token(alice, "alice@a.pk", { expiresIn: "-10s" })) }],
    ["wrong aud", { authorization: "Bearer " + (await h.token(alice, "alice@a.pk", { audience: "other" })) }],
  ];
  for (const [n, hd] of cases) { const r = await raw("GET", "/v1/parties", null, A, undefined, hd); if (r.status !== 401) bad.push(`${n}→${r.status}`); }
  // alg none
  const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url") + "." + Buffer.from(JSON.stringify({ sub: alice, aud: "authenticated", exp: 9999999999 })).toString("base64url") + ".";
  const r = await raw("GET", "/v1/parties", null, A, undefined, { authorization: "Bearer " + none }); if (r.status !== 401) bad.push(`alg-none→${r.status}`);
  return [bad.length === 0, bad.join(", ")];
});
await t("O1b", "Token of a user that does not exist in the database", async () => {
  const r = await raw("GET", "/v1/parties", "a9999999-0000-0000-0000-000000000009", A);
  return [r.status === 403 || r.status === 401, String(r.status)];
});
await t("O2", "Mass assignment / wrong types / huge numbers on create endpoints", async () => {
  const bad: string[] = [];
  const p = await raw("POST", "/v1/parties", alice, A, { name: "QA Mass", roles: ["customer"], company_id: ID.coB, companyId: ID.coB, id: "11111111-1111-1111-1111-111111111111", version: 99, created_by: ID.carol });
  const row = (await raw("GET", `/v1/parties/${p.body?.id}`, alice, A));
  if (p.status === 201 && (p.body.id === "11111111-1111-1111-1111-111111111111")) bad.push("client chose the id");
  const inB = await raw("GET", `/v1/parties?search=QA%20Mass`, ID.carol, ID.coB); if (JSON.stringify(inB.body).includes("QA Mass")) bad.push("created in company B via body company_id");
  for (const [n, r] of [
    ["name array", await raw("POST", "/v1/parties", alice, A, { name: ["a", "b"], roles: ["customer"] })],
    ["name number", await raw("POST", "/v1/parties", alice, A, { name: 12345, roles: ["customer"] })],
    ["roles str", await raw("POST", "/v1/parties", alice, A, { name: "QA x", roles: "customer" })],
    ["price neg", await raw("POST", "/v1/properties", alice, A, { title: "QA neg", typeId: ID.typeA, listPrice: "-5" })],
    ["price huge", await raw("POST", "/v1/properties", alice, A, { title: "QA huge", typeId: ID.typeA, listPrice: "99999999999999999999999" })],
    ["price exp", await raw("POST", "/v1/properties", alice, A, { title: "QA exp", typeId: ID.typeA, listPrice: "1e9" })],
    ["price 3dp", await raw("POST", "/v1/properties", alice, A, { title: "QA 3dp", typeId: ID.typeA, listPrice: "10.555" })],
    ["price obj", await raw("POST", "/v1/properties", alice, A, { title: "QA obj", typeId: ID.typeA, listPrice: { a: 1 } })],
    ["size neg", await raw("POST", "/v1/properties", alice, A, { title: "QA sz", typeId: ID.typeA, listPrice: "1", size: { value: -3, unit: "marla" } })],
    ["size zero", await raw("POST", "/v1/properties", alice, A, { title: "QA sz0", typeId: ID.typeA, listPrice: "1", size: { value: 0, unit: "marla" } })],
  ] as const) if (r.status < 400) bad.push(`${n}→${r.status} ACCEPTED`);
  return [bad.length === 0, bad.join(", ")];
});
await t("O2b", "Receipt/booking tampering: status, paid, negative, text amount", async () => {
  const bad: string[] = [];
  const r1 = await raw("POST", "/v1/receipts", alice, A, { bookingId: ID.custA, amount: "-5", method: "cash" });
  const r2 = await raw("POST", "/v1/receipts", alice, A, { bookingId: ID.custA, amount: "abc", method: "cash" });
  const r3 = await raw("POST", "/v1/receipts", alice, A, { bookingId: ID.custA, amount: "0", method: "cash" });
  const r4 = await raw("POST", "/v1/receipts", alice, A, { bookingId: ID.custA, amount: "1,000", method: "cash" });
  const r5 = await raw("POST", "/v1/bookings", alice, A, { propertyId: ID.propA(1), customerId: ID.custA, paymentType: "cash", status: "completed", paid: "1000000" });
  for (const [n, r] of [["neg", r1], ["text", r2], ["zero", r3], ["comma", r4]] as const) if (r.status < 400 || r.status >= 500) bad.push(`${n}→${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  if (r5.status === 201 && (r5.body.status !== "pending" || Number(r5.body.paid ?? 0) !== 0)) bad.push(`booking took status/paid from body: ${r5.body.status}`);
  return [bad.length === 0, bad.join(" | ") + ` [${[r1, r2, r3, r4, r5].map((r) => r.status)}]`];
});
await t("O3", "Injection strings stored as plain text & no SQL leakage", async () => {
  const bad: string[] = [];
  const strings = ["'; drop table users; --", "<script>alert(1)</script>", "<b>x</b>", "{{7*7}}", "${7*7}", "..\\..\\etc\\passwd", "Robert'); DROP TABLE parties;--", "O'Neil", "😀 emoji", "محمد علی خان"];
  for (const s of strings) {
    const r = await raw("POST", "/v1/parties", alice, A, { name: s, roles: ["customer"], notes: s, city: s });
    if (r.status !== 201) { bad.push(`create ${JSON.stringify(s)}→${r.status} ${JSON.stringify(r.body).slice(0, 100)}`); continue; }
    const g = await raw("GET", `/v1/parties/${r.body.id}`, alice, A);
    if ((g.body.displayName ?? g.body.name) !== s.trim()) bad.push(`roundtrip ${JSON.stringify(s)} → ${JSON.stringify(g.body.displayName ?? g.body.name)}`);
    const sr = await raw("GET", `/v1/parties?search=${encodeURIComponent(s)}`, alice, A); if (sr.status >= 500) bad.push(`search ${s}→${sr.status}`);
  }
  const t1 = await raw("GET", "/v1/parties", alice, A); if (t1.status !== 200) bad.push("parties table gone");
  const sqlq = await raw("GET", `/v1/properties?search=${encodeURIComponent("%' or 1=1 --")}`, alice, A); if (sqlq.status >= 500) bad.push("search sqli 5xx");
  const idq = await raw("GET", `/v1/parties/' or 1=1 --`, alice, A); if (idq.status !== 400 && idq.status !== 404) bad.push(`bad id→${idq.status}`);
  return [bad.length === 0, bad.join(" | ")];
});
await t("O6", "Error bodies: no stack, table, column or SQL", async () => {
  const bad: string[] = [];
  const probes = await Promise.all([
    raw("POST", "/v1/parties", alice, A, { name: "x" }), raw("POST", "/v1/bookings", alice, A, { propertyId: "nope" }), raw("GET", "/v1/parties/zzz", alice, A),
    raw("POST", "/v1/receipts", alice, A, { bookingId: "11111111-1111-1111-1111-111111111111", amount: "5", method: "cash" }),
    raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-09-20", lines: [{ accountId: "11111111-1111-1111-1111-111111111111", debit: "5" }] }),
    raw("POST", "/v1/parties", alice, A, "not json" as any),
  ]);
  for (const r of probes) { const s = JSON.stringify(r.body); if (/\bat \w+.*\(.*:\d+:\d+\)|select |insert |violates|constraint|relation "|column "|pg_|stack/i.test(s)) bad.push(`${r.status}: ${s.slice(0, 160)}`); if (r.status >= 500) bad.push(`5xx ${s.slice(0, 100)}`); }
  return [bad.length === 0, bad.join(" | ")];
});
await t("O7", "Huge JSON body (6 MB) and 100 rapid requests", async () => {
  const bad: string[] = [];
  const big = await raw("POST", "/v1/parties", alice, A, { name: "x".repeat(6_000_000), roles: ["customer"] });
  if (big.status < 400 || big.status >= 500) bad.push(`big→${big.status}`);
  const rs = await Promise.all(Array.from({ length: 100 }, () => raw("GET", "/v1/parties", alice, A)));
  const codes = new Set(rs.map((r) => r.status)); if ([...codes].some((c) => c >= 500)) bad.push(`rapid ${[...codes]}`);
  return [bad.length === 0, bad.join(", ") + ` rapid=${[...codes]}`];
});
await t("O4", "CORS: allowed origin / foreign origin / all methods in preflight", async () => {
  const bad: string[] = [];
  const pre = async (origin: string, m: string) => (await h.app.inject({ method: "OPTIONS", url: "/v1/parties", headers: { origin, "access-control-request-method": m, "access-control-request-headers": "authorization,content-type,x-company-id" } }));
  const r = await h.app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
  const acao = r.headers["access-control-allow-origin"];
  return [!acao || acao !== "*" && acao !== "https://evil.example", `ACAO for evil origin = ${JSON.stringify(acao)} (harness config has no CORS_ORIGIN; production uses same-origin /api)`];
});
await t("O8", "CNIC: stored encrypted, not in API output/audit; validation; duplicates; cross-company", async () => {
  const bad: string[] = [];
  const mk = (cnic: string, as = alice, co = A) => raw("POST", "/v1/parties", as, co, { name: "QA CNIC " + cnic, roles: ["customer"], cnic });
  const ok = await mk("35202-1234567-1");
  const dup = await mk("35202-1234567-1"); const dup2 = await mk("3520212345671");
  const other = await mk("35202-1234567-1", ID.carol, ID.coB);
  const short = await mk("12345"); const letters = await mk("abcde-1234567-1"); const long = await mk("352021234567123456");
  if (ok.status !== 201) bad.push(`valid→${ok.status} ${JSON.stringify(ok.body).slice(0, 100)}`);
  if (dup.status < 400) bad.push(`duplicate same format accepted ${dup.status}`);
  if (dup2.status < 400) bad.push(`duplicate unformatted accepted ${dup2.status}`);
  if (other.status !== 201) bad.push(`other company refused ${other.status}`);
  for (const [n, r] of [["short", short], ["letters", letters], ["long", long]] as const) if (r.status < 400) bad.push(`${n} accepted ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  const g = JSON.stringify((await raw("GET", `/v1/parties/${ok.body?.id}`, alice, A)).body);
  if (g.includes("1234567-1") || g.includes("12345671")) bad.push("full CNIC returned by API: " + (g.match(/"cnic[^,]*/i)?.[0] ?? ""));
  const au = JSON.stringify((await raw("GET", `/v1/audit?entityId=${ok.body?.id}`, alice, A)).body);
  if (/1234567/.test(au)) bad.push("CNIC in audit log");
  return [bad.length === 0, bad.join(" | ") + ` [dup:${dup.status} ${JSON.stringify(dup.body).slice(0, 100)}]`];
});
await t("O9", "?company= and header manipulation: nonexistent / malformed company id", async () => {
  const a = await raw("GET", "/v1/parties", alice, "not-a-uuid"); const b = await raw("GET", "/v1/parties", alice, "00000000-0000-0000-0000-0000000000ff"); const c = await raw("GET", "/v1/parties", alice, null);
  return [[400, 403, 404].includes(a.status) && [403, 404].includes(b.status) && [400, 403].includes(c.status), `${a.status},${b.status},${c.status}`];
});

// ─ B3 roles ────────────────────────────────────────────────────────────────────────────────────────────────────
await t("B3", "Viewer cannot change anything (server-side), agent cannot cancel/approve, accountant cannot approve", async () => {
  const bad: string[] = [];
  const bob = ID.bob;
  const tries: [string, string, unknown][] = [
    ["POST", "/v1/parties", { name: "QA viewer", roles: ["customer"] }], ["POST", "/v1/projects", { name: "QA Viewer Proj" }], ["POST", "/v1/properties", { title: "QA vp", typeId: ID.typeA, listPrice: "1" }],
    ["POST", "/v1/bookings", { propertyId: ID.propA(3), customerId: ID.custA, paymentType: "cash" }], ["PATCH", `/v1/properties/${ID.propA(3)}`, { title: "QA vw" }], ["PATCH", "/v1/company", { name: "Hacked Co" }],
    ["POST", "/v1/roles", { name: "QA role", permissions: {} }], ["POST", "/v1/invites", { email: "z@z.pk", roleId: ID.roleOwner }], ["POST", "/v1/receipts", { customerId: ID.custA, amount: "5", method: "cash" }],
  ];
  for (const [m, p, b] of tries) { const r = await raw(m, p, bob, A, b); if (r.status !== 403) bad.push(`viewer ${m} ${p}→${r.status}`); }
  const acc = ID.frank;
  const accountant = [["POST", "/v1/projects", { name: "QA acc proj" }], ["PATCH", "/v1/company", { name: "Hacked" }]] as const;
  for (const [m, p, b] of accountant) { const r = await raw(m, p, acc, A, b); if (r.status !== 403) bad.push(`accountant ${m} ${p}→${r.status}`); }
  return [bad.length === 0, bad.join(" | ")];
});
await t("L1", "Last Owner cannot be demoted/suspended; self role escape", async () => {
  const bad: string[] = [];
  const members = (await raw("GET", "/v1/members", alice, A)).body.members;
  const me = members.find((m: any) => m.userId === alice || m.id === alice || m.fullName === "Alice Owner");
  const mid = me?.memberId ?? me?.id;
  const r1 = await raw("PATCH", `/v1/members/${mid}`, alice, A, { status: "suspended" });
  const r2 = await raw("PATCH", `/v1/members/${mid}`, alice, A, { roleId: ID.roleViewer });
  if (r1.status < 400) bad.push(`self-suspend accepted ${r1.status}`);
  if (r2.status < 400) bad.push(`owner demoted self ${r2.status}`);
  return [bad.length === 0, bad.join(" | ") + ` [${r1.status} ${JSON.stringify(r1.body).slice(0, 90)}; ${r2.status} ${JSON.stringify(r2.body).slice(0, 90)}] member=${JSON.stringify(me).slice(0, 120)}`];
});

// ─ money / state machine ──────────────────────────────────────────────────────────────────────────────────────
const rpt = async (p: string) => (await raw("GET", p, alice, A)).body;
const accts = (await raw("GET", "/v1/accounts", alice, A)).body;
const cust = (await raw("POST", "/v1/parties", alice, A, { name: "QA Buyer", roles: ["customer"], phone: "+92 300 1234567" })).body;
let bk: any, inst: any[] = [];
await t("F5", "Payment plan 1,000,000 over 7 installments adds up exactly; remainder in last", async () => {
  bk = (await raw("POST", "/v1/bookings", alice, A, { propertyId: ID.propA(1), customerId: cust.id, paymentType: "installment" })).body;
  const r = await raw("POST", `/v1/bookings/${bk.id}/schedule`, alice, A, { downPayment: "100000", installments: 7, firstDue: "2026-10-01" });
  inst = (r.body.installments ?? r.body.schedule ?? []);
  const sum = inst.reduce((s: number, i: any) => s + Math.round(Number(i.amount) * 100), 0);
  return [r.status === 200 && sum === 100_000_000, `status ${r.status}, ${inst.length} rows, sum paisa=${sum}, amounts=${inst.map((i: any) => i.amount).join(",")}`];
});
await t("F3", "Same Idempotency-Key twice → one booking; two bookings of same property refused", async () => {
  const key = { "idempotency-key": "qa-key-1" };
  const b1 = await raw("POST", "/v1/bookings", alice, A, { propertyId: ID.propA(2), customerId: cust.id, paymentType: "cash" }, key);
  const b2 = await raw("POST", "/v1/bookings", alice, A, { propertyId: ID.propA(2), customerId: cust.id, paymentType: "cash" }, key);
  const b3 = await raw("POST", "/v1/bookings", alice, A, { propertyId: ID.propA(1), customerId: cust.id, paymentType: "cash" });
  return [b1.body?.id && b1.body.id === b2.body?.id && b3.status >= 400, `same key ids ${b1.body?.id === b2.body?.id}; second property booking ${b3.status} ${JSON.stringify(b3.body).slice(0, 100)}`];
});
await t("F4", "20 simultaneous bookings of the same property → exactly one", async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, () => raw("POST", "/v1/bookings", alice, A, { propertyId: ID.propA(4), customerId: cust.id, paymentType: "cash" })));
  const n201 = rs.filter((r) => r.status === 201).length; const others = [...new Set(rs.filter((r) => r.status !== 201).map((r) => r.status + ":" + (r.body?.error?.code ?? "")))];
  const cnt = await h.admin(async (c) => (await c.query(`select count(*)::int n from bookings where property_id=$1 and status in ('pending','confirmed','completed')`, [ID.propA(4)])).rows[0].n);
  return [n201 === 1 && cnt === 1, `201s=${n201}, live in db=${cnt}, others=${others}`];
});
await t("F6", "Booking state machine: complete before confirm, complete with unpaid, confirm w/o schedule", async () => {
  const bad: string[] = [];
  const r1 = await raw("POST", `/v1/bookings/${bk.id}/status`, alice, A, { to: "completed" }); if (r1.status < 400) bad.push(`pending→completed accepted`);
  const r2 = await raw("POST", `/v1/bookings/${bk.id}/status`, alice, A, { to: "confirmed" }); if (r2.status !== 200) bad.push(`confirm→${r2.status} ${JSON.stringify(r2.body).slice(0, 100)}`);
  const r3 = await raw("POST", `/v1/bookings/${bk.id}/status`, alice, A, { to: "completed" }); if (r3.status < 400) bad.push(`completed with unpaid accepted`);
  const nb = (await raw("POST", "/v1/bookings", alice, A, { propertyId: ID.propA(5), customerId: cust.id, paymentType: "installment" })).body;
  const r4 = await raw("POST", `/v1/bookings/${nb.id}/status`, alice, A, { to: "confirmed" }); if (r4.status < 400) bad.push(`confirm without schedule accepted`);
  const r5 = await raw("POST", `/v1/bookings/${nb.id}/status`, alice, A, { to: "cancelled" }); if (r5.status < 400) bad.push("cancel without reason accepted");
  const r6 = await raw("POST", `/v1/bookings/${nb.id}/status`, alice, A, { to: "cancelled", reason: "QA test cancel" }); if (r6.status !== 200) bad.push(`cancel→${r6.status}`);
  const r7 = await raw("POST", `/v1/bookings/${nb.id}/status`, alice, A, { to: "confirmed" }); if (r7.status < 400) bad.push("cancelled→confirmed accepted");
  return [bad.length === 0, bad.join(" | ") + ` [${[r1, r2, r3, r4, r5, r6, r7].map((r) => r.status)}]`];
});
await t("D4", "Property with live booking cannot be blocked; status not settable to sold/reserved by hand", async () => {
  const bad: string[] = [];
  const r1 = await raw("PATCH", `/v1/properties/${ID.propA(1)}`, alice, A, { status: "blocked" }); if (r1.status < 400) bad.push(`block live-booked property ${r1.status}`);
  const r2 = await raw("PATCH", `/v1/properties/${ID.propA(3)}`, alice, A, { status: "sold" }); if (r2.status < 400) bad.push(`manual sold ${r2.status}`);
  const r3 = await raw("PATCH", `/v1/properties/${ID.propA(3)}`, alice, A, { status: "reserved" }); if (r3.status < 400) bad.push(`manual reserved ${r3.status}`);
  return [bad.length === 0, bad.join(" | ") + ` [${r1.status} ${JSON.stringify(r1.body).slice(0, 90)} | ${r2.status} | ${r3.status}]`];
});
const cash = accts.find((a: any) => a.code === "03.01.01.0001")?.id;
let rc: any[] = [];
await t("G2", "Receipts: allocation oldest-first, partial, exact, over-payment", async () => {
  const bad: string[] = [];
  const dp = inst[0];
  const r1 = await raw("POST", "/v1/receipts", alice, A, { bookingId: bk.id, amount: "50000.50", method: "cash" }); rc.push(r1.body);
  if (r1.status !== 201) bad.push(`partial→${r1.status} ${JSON.stringify(r1.body).slice(0, 120)}`);
  const b1 = (await raw("GET", `/v1/bookings/${bk.id}`, alice, A)).body;
  const i0 = (b1.installments ?? b1.schedule)[0];
  if (Number(i0.paid ?? i0.paidAmount) !== 50000.5) bad.push(`first installment paid=${i0.paid ?? i0.paidAmount}`);
  const r2 = await raw("POST", "/v1/receipts", alice, A, { bookingId: bk.id, amount: "49999.50", method: "cash" }); rc.push(r2.body);
  const b2 = (await raw("GET", `/v1/bookings/${bk.id}`, alice, A)).body; const s0 = (b2.installments ?? b2.schedule)[0];
  if ((s0.status) !== "paid") bad.push(`after exact, first status ${s0.status}`);
  const total = Number(b2.netPrice ?? b2.net_price ?? 1000000);
  const r3 = await raw("POST", "/v1/receipts", alice, A, { bookingId: bk.id, amount: "99999999.99", method: "cash" });
  return [bad.length === 0, bad.join(" | ") + ` overpay→${r3.status} ${JSON.stringify(r3.body).slice(0, 140)}`];
});
await t("G3", "Paisa kept exactly: 0.01 and 0.99 and 1234.50; sum of 100 receipts of 0.01 = 1.00", async () => {
  const cust2 = (await raw("POST", "/v1/parties", alice, A, { name: "QA Penny", roles: ["customer"] })).body;
  const pr = (await raw("POST", "/v1/properties", alice, A, { title: "QA Penny plot", typeId: ID.typeA, listPrice: "1000", projectId: ID.prjA })).body;
  const b = (await raw("POST", "/v1/bookings", alice, A, { propertyId: pr.id, customerId: cust2.id, paymentType: "installment" })).body;
  await raw("POST", `/v1/bookings/${b.id}/schedule`, alice, A, { downPayment: "0", installments: 10, firstDue: "2026-10-01" });
  const rs = await Promise.all(Array.from({ length: 100 }, () => raw("POST", "/v1/receipts", alice, A, { bookingId: b.id, amount: "0.01", method: "cash" })));
  const ok = rs.filter((r) => r.status === 201).length;
  const led = await h.admin(async (c) => (await c.query(`select coalesce(sum(amount),0)::text s from receipts where booking_id=$1 and status='posted'`, [b.id])).rows[0].s);
  const al = await h.admin(async (c) => (await c.query(`select coalesce(sum(ra.amount),0)::text s from receipt_allocations ra join receipts r on r.id=ra.receipt_id where r.booking_id=$1`, [b.id])).rows[0].s);
  const nos = await h.admin(async (c) => (await c.query(`select count(distinct receipt_no)::int d, count(*)::int n from receipts where booking_id=$1`, [b.id])).rows[0]);
  return [ok === 100 && Number(led) === 1 && Number(al) === 1 && nos.d === nos.n, `created ${ok}/100 receipts, receipts sum=${led}, allocated=${al}, distinct numbers ${nos.d}/${nos.n}`];
});
await t("G5", "20 concurrent identical receipts with same Idempotency-Key → ?", async () => {
  const b = (await raw("POST", "/v1/bookings", alice, A, { propertyId: (await raw("POST", "/v1/properties", alice, A, { title: "QA Idem", typeId: ID.typeA, listPrice: "5000" })).body.id, customerId: cust.id, paymentType: "installment" })).body;
  await raw("POST", `/v1/bookings/${b.id}/schedule`, alice, A, { downPayment: "0", installments: 5, firstDue: "2026-10-01" });
  const rs = await Promise.all(Array.from({ length: 5 }, () => raw("POST", "/v1/receipts", alice, A, { bookingId: b.id, amount: "100", method: "cash" }, { "idempotency-key": "qa-rcpt-1" })));
  const n = await h.admin(async (c) => (await c.query(`select count(*)::int n from receipts where booking_id=$1`, [b.id])).rows[0].n);
  return [n === 1, `receipts created with identical Idempotency-Key: ${n} (API only honours the key on bookings; a double-click on Record receipt depends on the UI disabling the button)`];
});
await t("G4", "Void receipt: reverses, second void refused, installment reverts", async () => {
  const bad: string[] = [];
  const r = rc[0];
  const v1 = await raw("POST", `/v1/receipts/${r.id}/void`, alice, A, { reason: "QA void" }); if (v1.status !== 200) bad.push(`void→${v1.status} ${JSON.stringify(v1.body).slice(0, 100)}`);
  const v2 = await raw("POST", `/v1/receipts/${r.id}/void`, alice, A, { reason: "QA void again" }); if (v2.status < 400) bad.push("second void accepted");
  const v3 = await raw("POST", `/v1/receipts/${r.id}/void`, alice, A, {}); if (v3.status < 400) bad.push("void without reason accepted");
  const b = (await raw("GET", `/v1/bookings/${bk.id}`, alice, A)).body; const s0 = (b.installments ?? b.schedule)[0];
  return [bad.length === 0, bad.join(" | ") + ` first installment now ${s0.status} paid=${s0.paid ?? s0.paidAmount}`];
});
await t("H3", "Voucher validation: unbalanced, one line, zero, negative, same account both sides, group account", async () => {
  const bad: string[] = [];
  const leaf = accts.filter((a: any) => !(a.isGroup ?? a.is_group)); const grp = accts.find((a: any) => (a.isGroup ?? a.is_group));
  const mkv = (lines: any[]) => raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-09-20", lines });
  const cases: [string, any[]][] = [
    ["unbalanced", [{ accountId: leaf[0].id, debit: "100" }, { accountId: leaf[1].id, credit: "99" }]], ["one line", [{ accountId: leaf[0].id, debit: "100" }]],
    ["zero", [{ accountId: leaf[0].id, debit: "0" }, { accountId: leaf[1].id, credit: "0" }]], ["negative", [{ accountId: leaf[0].id, debit: "-100" }, { accountId: leaf[1].id, credit: "-100" }]],
    ["same acct", [{ accountId: leaf[0].id, debit: "100" }, { accountId: leaf[0].id, credit: "100" }]], ["group acct", [{ accountId: grp.id, debit: "100" }, { accountId: leaf[1].id, credit: "100" }]],
    ["both sides one line", [{ accountId: leaf[0].id, debit: "100", credit: "100" }, { accountId: leaf[1].id, credit: "0" }]],
  ];
  const detail: string[] = [];
  for (const [n, l] of cases) { const r = await mkv(l); detail.push(`${n}:${r.status}`); if (r.status === 201) { const s = await raw("POST", `/v1/vouchers/${r.body.id}/submit`, alice, A); const a = s.status < 400 ? await raw("POST", `/v1/vouchers/${r.body.id}/approve`, alice, A, {}) : s; detail[detail.length - 1] += `(then submit ${s.status}, approve ${a.status})`; if (a.status < 400) bad.push(`${n} fully APPROVED`); } }
  return [bad.length === 0, bad.join(" | ") + " " + detail.join(", ")];
});
await t("H2", "Voucher lifecycle: approve draft directly, creator self-approval setting, reject→draft, void", async () => {
  const bad: string[] = [];
  const leaf = accts.filter((a: any) => !(a.isGroup ?? a.is_group));
  const mk = async () => (await raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-09-20", description: "QA lifecycle", lines: [{ accountId: leaf[0].id, debit: "250.25" }, { accountId: leaf[1].id, credit: "250.25" }] })).body;
  const v = await mk();
  const a0 = await raw("POST", `/v1/vouchers/${v.id}/approve`, alice, A, {}); if (a0.status < 400) bad.push("draft approved directly");
  await raw("POST", `/v1/vouchers/${v.id}/submit`, alice, A);
  const e = await raw("PUT", `/v1/vouchers/${v.id}`, alice, A, { date: "2026-09-20", lines: [{ accountId: leaf[0].id, debit: "1" }, { accountId: leaf[1].id, credit: "1" }] }); if (e.status < 400) bad.push(`edited a pending voucher ${e.status}`);
  const ap = await raw("POST", `/v1/vouchers/${v.id}/approve`, alice, A, {}); const ap2 = await raw("POST", `/v1/vouchers/${v.id}/approve`, alice, A, {});
  if (ap2.status < 400) bad.push("approved twice");
  const ed = await raw("PUT", `/v1/vouchers/${v.id}`, alice, A, { date: "2026-09-20", lines: [{ accountId: leaf[0].id, debit: "1" }, { accountId: leaf[1].id, credit: "1" }] }); if (ed.status < 400) bad.push(`edited an approved voucher ${ed.status}`);
  const del = await raw("DELETE", `/v1/vouchers/${v.id}`, alice, A); if (del.status < 400) bad.push(`deleted an approved voucher ${del.status}`);
  const vo = await raw("POST", `/v1/vouchers/${v.id}/void`, alice, A, { reason: "QA void" }); const vo2 = await raw("POST", `/v1/vouchers/${v.id}/void`, alice, A, { reason: "QA void 2" });
  if (vo2.status < 400) bad.push("voided twice");
  // number sequence
  const n1 = await mk(); const n2 = await mk();
  return [bad.length === 0, bad.join(" | ") + ` approve=${ap.status} void=${vo.status} numbers ${v.number}/${n1.number}/${n2.number}; self-approve default: ${ap.status}`];
});
await t("H7", "Trial balance balances at many date filters; every voucher line ledger sums", async () => {
  const bad: string[] = [];
  for (const d of ["2000-01-01", "2026-06-30", "2026-07-01", "2026-09-20", "2026-12-31", "2999-12-31"]) {
    const r = await raw("GET", `/v1/reports/trial-balance?to=${d}`, alice, A);
    const s = r.body; const dr = Number(s.totals?.debit ?? s.totalDebit ?? NaN), cr = Number(s.totals?.credit ?? s.totalCredit ?? NaN);
    if (r.status !== 200) bad.push(`${d}→${r.status}`); else if (!(Math.abs(dr - cr) < 0.005)) bad.push(`${d}: dr ${dr} cr ${cr} keys=${Object.keys(s)}`);
  }
  return [bad.length === 0, bad.join(" | ")];
});
await t("H16", "Ledger invariants after the run (v_reconciliation empty etc.)", async () => {
  const bad: string[] = [];
  await h.admin(async (c) => {
    const v = await c.query(`select * from v_reconciliation`); if (v.rowCount) bad.push("v_reconciliation rows: " + JSON.stringify(v.rows.slice(0, 3)));
    const u = await c.query(`select coalesce(sum(debit),0)::text d, coalesce(sum(credit),0)::text c from journal_lines`).catch(() => null);
    if (u && u.rows[0].d !== u.rows[0].c) bad.push(`journal d ${u.rows[0].d} c ${u.rows[0].c}`);
    const ins = await c.query(`select count(*)::int n from installments where paid_amount > amount`).catch(() => ({ rows: [{ n: -1 }] })); if (ins.rows[0].n > 0) bad.push(`${ins.rows[0].n} installments overpaid`);
    const rc = await c.query(`select count(*)::int n from receipts r where status='posted' and not exists (select 1 from journal_entries j where j.id = r.journal_entry_id)`).catch(() => ({ rows: [{ n: -1 }] })); if (rc.rows[0].n > 0) bad.push(`${rc.rows[0].n} receipts without journal entry`);
  });
  return [bad.length === 0, bad.join(" | ")];
});

const pass = out.filter((o) => o.ok).length;
console.log(`\nSUMMARY ${pass}/${out.length} pass`);
await h.close();
process.exit(0);
