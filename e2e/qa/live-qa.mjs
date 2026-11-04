// QA scratch (live ByteCraft): signs in through the real page, then runs the flows through the API with the page's session.
// Everything created is prefixed QA-. Credentials only from QA_EMAIL / QA_PASSWORD. Nothing secret is printed.
import puppeteer from "puppeteer-core";
const BASE = "https://property-dealers-project.netlify.app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD);
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 40000 });
const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
await browser.close();

const lat = [];
async function raw(method, path, { co, body, headers = {}, auth = true } = {}) {
  const h = { ...headers }; if (auth) h.authorization = `Bearer ${token}`; if (co) h["x-company-id"] = co;
  if (body !== undefined && typeof body !== "string") h["content-type"] = "application/json";
  const t0 = Date.now();
  const r = await fetch(BASE + "/api" + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const ms = Date.now() - t0; lat.push({ m: method, path: path.replace(/[0-9a-f-]{36}/g, ":id").split("?")[0], ms, s: r.status });
  let b = null; const tx = await r.text(); try { b = JSON.parse(tx); } catch { b = tx; }
  return { status: r.status, body: b, ms };
}
const me = (await raw("GET", "/v1/me")).body; const co = me.companies[0].companyId;
console.log("companies:", me.companies.map((c) => `${c.name}/${c.plan}/${c.role}`).join(","));
const A = (m, p, body, headers) => raw(m, p, { co, body, headers });
const out = []; const created = [];
const t = async (id, name, fn) => { try { const [ok, note] = await fn(); out.push({ id, name, ok, note }); console.log(JSON.stringify({ id, name, ok, note: String(note ?? "").slice(0, 900) })); } catch (e) { out.push({ id, name, ok: false, note: "THREW " + e.message }); console.log(JSON.stringify({ id, name, ok: false, note: "THREW " + e.message })); } };
const rec = (type, ref) => created.push({ type, ref, at: new Date().toISOString() });

// ── what exists
const types = (await A("GET", "/v1/property-types")).body; const typeRows = types.rows ?? types; const plot = typeRows.find((x) => /plot/i.test(x.name)) ?? typeRows[0];
const accounts = (await A("GET", "/v1/accounts")).body; const leaf = accounts.filter((a) => !(a.isGroup ?? a.is_group));
console.log("property types:", typeRows.map((x) => x.name).join(","), "| accounts:", accounts.length);

await t("A1", "health + unknown path", async () => { const a = await raw("GET", "/health", { auth: false }); const b = await raw("GET", "/nope", { auth: false }); const c = await raw("GET", "/v1/parties", { auth: false }); return [a.status === 200 && b.status === 404 && c.status === 401, `${a.status},${b.status},${c.status}`]; });
await t("H5", "chart of accounts has 85 standard accounts", async () => [accounts.length >= 85, `${accounts.length} accounts (${leaf.length} postable)`]);
await t("H8", "banks list", async () => { const b = (await raw("GET", "/v1/banks")).body; const rows = b.rows ?? b; return [rows.length === 43, `${rows.length} banks; first: ${rows.slice(0, 3).map((x) => x.name)}`]; });

// ── projects / properties
let proj, prop;
await t("D1", "create project, duplicate name, validation", async () => {
  const r = await A("POST", "/v1/projects", { name: "QA-Project Alpha", type: "residential", city: "Lahore", landAreaMarla: 500, approvedBudget: "1500000.50" }); proj = r.body; rec("project", proj?.code ?? proj?.id);
  const d = await A("POST", "/v1/projects", { name: "QA-Project Alpha", type: "residential" }); if (d.status === 201) rec("project(dup)", d.body.code);
  const bad = await A("POST", "/v1/projects", { name: "x" });
  const inj = await A("POST", "/v1/projects", { name: "QA-<script>alert(1)</script>'; drop table projects;--" }); if (inj.status === 201) rec("project(injection)", inj.body.code);
  return [r.status === 201 && bad.status === 400, `create ${r.status}; duplicate name → ${d.status} ${d.body?.error?.message ?? d.body?.code ?? ""}; short name ${bad.status}; injection ${inj.status}`];
});
await t("D2", "properties: 5 Marla / 1 Kanal / 7.5 Marla sq ft; zero/negative", async () => {
  const mk = (title, size) => A("POST", "/v1/properties", { title, typeId: plot.id, projectId: proj.id, listPrice: "2500000", size });
  const r5 = await mk("QA-Plot 5 Marla", { value: 5, unit: "marla" }); const rk = await mk("QA-Plot 1 Kanal", { value: 1, unit: "kanal" }); const r75 = await mk("QA-Plot 7.5 Marla", { value: 7.5, unit: "marla" });
  const r0 = await mk("QA-Plot zero", { value: 0, unit: "marla" }); const rn = await mk("QA-Plot neg", { value: -2, unit: "marla" });
  for (const r of [r5, rk, r75]) rec("property", r.body?.code);
  prop = r5.body;
  const g = async (r) => (await A("GET", `/v1/properties/${r.body.id}`)).body;
  const [g5, gk, g75] = [await g(r5), await g(rk), await g(r75)];
  const f = (x) => JSON.stringify({ sz: x.sizeValue ?? x.size, unit: x.sizeUnit, sqft: x.sizeSqft ?? x.areaSqft ?? x.sqft, st: x.status });
  const keys = Object.keys(g5).join(",");
  return [r0.status >= 400 && rn.status >= 400, `5 marla ${f(g5)}; 1 kanal ${f(gk)}; 7.5 marla ${f(g75)}; zero→${r0.status}; neg→${rn.status}; keys=${keys}`];
});
await t("D3", "property codes sequential, no duplicates under 8 parallel creates", async () => {
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => A("POST", "/v1/properties", { title: `QA-Parallel ${i}`, typeId: plot.id, projectId: proj.id, listPrice: "100000" })));
  const codes = rs.map((r) => r.body?.code); rs.forEach((r) => rec("property", r.body?.code));
  return [new Set(codes).size === 8 && rs.every((r) => r.status === 201), `statuses ${rs.map((r) => r.status)} codes ${codes.join(",")}`];
});

// ── customers
let cust, cust2;
await t("E1", "customers: Urdu / apostrophe / HTML / 200 chars / emoji; roundtrip", async () => {
  const names = ["QA-محمد علی خان", "QA-O'Neil", "QA-<b>x</b>", "QA-" + "A".repeat(197), "QA-😀 Emoji Khan", "  QA-Spaces  "];
  const bad = [];
  for (const n of names) { const r = await A("POST", "/v1/parties", { name: n, roles: ["customer"], phone: "0300-1234567" }); if (r.status !== 201) { bad.push(`${n.slice(0, 15)}→${r.status} ${r.body?.error?.message}`); continue; } rec("customer", r.body.code ?? r.body.id); const g = (await A("GET", `/v1/parties/${r.body.id}`)).body; if ((g.displayName ?? g.name) !== n.trim()) bad.push(`roundtrip ${n.slice(0, 12)} → ${(g.displayName ?? g.name).slice(0, 20)}`); if (n.includes("Urdu")) cust = r.body; }
  const over = await A("POST", "/v1/parties", { name: "QA-" + "B".repeat(198), roles: ["customer"] }); if (over.status === 201) rec("customer", over.body.id);
  cust = (await A("POST", "/v1/parties", { name: "QA-Buyer One", roles: ["customer"], phone: "+92 300 1234567", email: "qa-buyer@example.com" })).body; rec("customer", cust.code ?? cust.id);
  cust2 = (await A("POST", "/v1/parties", { name: "QA-Buyer Two", roles: ["customer"], phone: "0321-7654321" })).body; rec("customer", cust2.code ?? cust2.id);
  const s = await A("GET", "/v1/parties?search=" + encodeURIComponent("محمد")); const sn = (s.body.rows ?? s.body).length;
  return [bad.length === 0, `${bad.join(" | ")} 201-char name → ${over.status}; Urdu search results ${sn}; phone stored: ${(await A("GET", `/v1/parties/${cust.id}`)).body.phone}`];
});
await t("E2", "CNIC valid / invalid / duplicate", async () => {
  const mk = (c, n) => A("POST", "/v1/parties", { name: `QA-CNIC ${n}`, roles: ["customer"], cnic: c });
  const ok = await mk("35202-9999991-1", "valid"); if (ok.status === 201) rec("customer", ok.body.code ?? ok.body.id);
  const dup = await mk("3520299999911", "dup"); if (dup.status === 201) rec("customer", dup.body.id);
  const bads = []; for (const c of ["12345", "abcde-1234567-1", "352029999991111111", "35202-99999-1"]) { const r = await mk(c, "bad"); if (r.status === 201) { bads.push(c); rec("customer", r.body.id); } }
  const g = JSON.stringify((await A("GET", `/v1/parties/${ok.body.id}`)).body);
  return [ok.status === 201 && dup.status === 409 && bads.length === 0 && !g.includes("9999991"), `valid ${ok.status}; dup ${dup.status}; invalid accepted: [${bads}]; cnic in response: ${/9999991/.test(g)}; returned ${g.match(/"cnic[^,]*/gi)}`];
});

// ── booking flow
let bk;
await t("F5", "booking + 1,000,000 over 7 installments", async () => {
  const p = (await A("POST", "/v1/properties", { title: "QA-Plan plot", typeId: plot.id, projectId: proj.id, listPrice: "1000000" })).body; rec("property", p.code);
  bk = (await A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "installment" })).body; rec("booking", bk.bookingNo);
  const r = await A("POST", `/v1/bookings/${bk.id}/schedule`, { downPayment: "100000", installments: 7, firstDue: "2026-12-01" });
  const ins = r.body.installments ?? []; const sum = ins.reduce((s, i) => s + Math.round(Number(i.amount) * 100), 0);
  return [r.status === 200 && sum === 100000000, `${ins.length} rows, sum paisa ${sum}: ${ins.map((i) => i.amount).join(",")}`];
});
await t("F3", "same property twice / idempotency key", async () => {
  const k = { "idempotency-key": "qa-live-" + Date.now() };
  const p = (await A("POST", "/v1/properties", { title: "QA-Idem plot", typeId: plot.id, projectId: proj.id, listPrice: "300000" })).body; rec("property", p.code);
  const [a, b] = await Promise.all([A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "cash" }, k), A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "cash" }, k)]); rec("booking", a.body?.bookingNo);
  const c = await A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust2.id, paymentType: "cash" });
  const n = ((await A("GET", `/v1/bookings?propertyId=${p.id}`)).body.rows ?? (await A("GET", `/v1/bookings?propertyId=${p.id}`)).body).length;
  return [n === 1 && c.status === 409, `parallel same key → ${a.status}/${b.status}; other customer ${c.status}; bookings on property ${n}`];
});
await t("F4", "10 simultaneous bookings of one property", async () => {
  const p = (await A("POST", "/v1/properties", { title: "QA-Race plot", typeId: plot.id, projectId: proj.id, listPrice: "200000" })).body; rec("property", p.code);
  const rs = await Promise.all(Array.from({ length: 10 }, () => A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "cash" })));
  rs.filter((r) => r.status === 201).forEach((r) => rec("booking", r.body.bookingNo));
  const n = rs.filter((r) => r.status === 201).length; return [n === 1, `201s=${n}; others ${[...new Set(rs.filter((r) => r.status !== 201).map((r) => r.status))]}`];
});
await t("F6", "booking status rules", async () => {
  const bad = []; const log = [];
  const st = async (id, to, reason) => { const r = await A("POST", `/v1/bookings/${id}/status`, { to, reason }); log.push(`${to}:${r.status}`); return r; };
  if ((await st(bk.id, "completed")).status < 400) bad.push("pending→completed");
  if ((await st(bk.id, "confirmed")).status !== 200) bad.push("confirm failed");
  if ((await st(bk.id, "completed")).status < 400) bad.push("complete with unpaid");
  return [bad.length === 0, bad.join(",") + " " + log];
});
let r1, r2;
await t("G1/G2", "receipts: 0.01, 50,000.50, exact, allocation order; numbering", async () => {
  const rs = []; for (const amt of ["0.01", "99999.99", "0.00", "-5", "abc", "1,000"]) rs.push([amt, await A("POST", "/v1/receipts", { bookingId: bk.id, amount: amt, method: "cash" })]);
  for (const [, r] of rs) if (r.status === 201) rec("receipt", r.body.receiptNo);
  r1 = rs[0][1].body; r2 = rs[1][1].body;
  const b = (await A("GET", `/v1/bookings/${bk.id}`)).body; const i0 = b.installments[0];
  const log = rs.map(([a, r]) => `${a}→${r.status}`).join(" ");
  return [rs[0][1].status === 201 && rs[1][1].status === 201 && rs.slice(2).every(([, r]) => r.status >= 400) && i0.paidAmount === "100000.00" && i0.status === "paid", `${log}; ${r1?.receiptNo},${r2?.receiptNo}; first installment ${i0.status}/${i0.paidAmount}`];
});
await t("G4", "void receipt: reverses, second void refused", async () => {
  const v = await A("POST", `/v1/receipts/${r2.id}/void`, { reason: "QA-void test" }); const v2 = await A("POST", `/v1/receipts/${r2.id}/void`, { reason: "QA-void again" });
  const b = (await A("GET", `/v1/bookings/${bk.id}`)).body; const i0 = b.installments[0];
  return [v.status === 200 && v2.status >= 400 && i0.status === "partial" && i0.paidAmount === "0.01", `void ${v.status}; again ${v2.status}; first installment ${i0.status}/${i0.paidAmount}`];
});
await t("E3", "customer statement lists receipt + void", async () => {
  const s = (await A("GET", `/v1/parties/${cust.id}/statement`)).body; const lines = s.lines ?? [];
  const last = lines[lines.length - 1];
  return [lines.length >= 3, `${lines.length} lines; closing balance ${last?.balance}; numbers ${lines.map((l) => l.number).join(",")}`];
});
await t("H7", "trial balance balanced at several dates", async () => {
  const bad = []; const seen = [];
  for (const d of ["2026-06-30", "2026-07-01", "2026-11-03", "2999-12-31"]) { const r = await A("GET", `/v1/reports/trial-balance?from=2000-01-01&to=${d}`); const { debit, credit } = r.body.totals ?? {}; seen.push(`${d}:${debit}/${credit}`); if (r.status !== 200 || Math.abs(debit - credit) > 0.005) bad.push(d); }
  return [bad.length === 0, seen.join(" ")];
});
await t("H2", "voucher lifecycle (JV) incl. unbalanced, same account", async () => {
  const bad = [];
  const lines = [{ accountId: leaf[0].id, debit: "250.25" }, { accountId: leaf[1].id, credit: "250.25" }];
  const v = (await A("POST", "/v1/vouchers", { type: "JV", date: "2026-11-03", description: "QA-journal test", lines })).body; rec("voucher", v.number);
  if ((await A("POST", `/v1/vouchers/${v.id}/approve`, {})).status < 400) bad.push("draft approved directly");
  await A("POST", `/v1/vouchers/${v.id}/submit`); const ap = await A("POST", `/v1/vouchers/${v.id}/approve`, {});
  const ed = await A("PUT", `/v1/vouchers/${v.id}`, { date: "2026-11-03", lines }); if (ed.status < 400) bad.push("edited approved voucher");
  const vo = await A("POST", `/v1/vouchers/${v.id}/void`, { reason: "QA-void" }); const vo2 = await A("POST", `/v1/vouchers/${v.id}/void`, { reason: "QA-void2" }); if (vo2.status < 400) bad.push("double void");
  const ub = await A("POST", "/v1/vouchers", { type: "JV", date: "2026-11-03", lines: [{ accountId: leaf[0].id, debit: "10" }, { accountId: leaf[1].id, credit: "9" }] }); if (ub.status === 201) { rec("voucher(unbalanced draft)", ub.body.number); const s = await A("POST", `/v1/vouchers/${ub.body.id}/submit`); if (s.status < 400) bad.push("unbalanced submitted"); }
  const same = await A("POST", "/v1/vouchers", { type: "JV", date: "2026-11-03", description: "QA-same account", lines: [{ accountId: leaf[0].id, debit: "10" }, { accountId: leaf[0].id, credit: "10" }] }); if (same.status === 201) rec("voucher(same account)", same.body.number);
  return [bad.length === 0, `${bad} approve ${ap.status} void ${vo.status}; unbalanced create ${ub.status}; same-account JV create ${same.status}`];
});

// ── plan: Advanced company can reach everything
await t("B1", "live (Advanced) can open every gated endpoint", async () => {
  const bad = []; for (const p of ["/v1/leads", "/v1/quotations", "/v1/cheques", "/v1/service-invoices", "/v1/contracts", "/v1/contractors", "/v1/budgets", "/v1/employees", "/v1/leave/types", "/v1/payroll", "/v1/dashboard", "/v1/collections", "/v1/audit", "/v1/members", "/v1/roles", "/v1/company", "/v1/plan", "/v1/bank-accounts", "/v1/commissions", "/v1/reminders"]) { const r = await A("GET", p); if (r.status !== 200) bad.push(`${p}→${r.status}`); }
  return [bad.length === 0, bad.join(",")];
});
await t("O1", "live: no token / garbage token / swapped company", async () => {
  const a = await raw("GET", "/v1/parties", { co, auth: false }); const b = await raw("GET", "/v1/parties", { co, headers: { authorization: "Bearer abc.def.ghi" }, auth: false });
  const c = await raw("GET", "/v1/parties", { co: "00000000-0000-0000-0000-0000000000ff" }); const d = await raw("GET", "/v1/parties", {}); const e = await raw("GET", "/v1/parties", { co: "not-a-uuid" });
  return [a.status === 401 && b.status === 401 && c.status === 403 && d.status === 400 && e.status === 400, `${a.status},${b.status},${c.status},${d.status},${e.status}`];
});
await t("O6", "live: error bodies + 5xx probes", async () => {
  const probes = [["invalid json", await A("POST", "/v1/parties", "not json")], ["unknown account", await A("POST", "/v1/vouchers", { type: "JV", date: "2026-11-03", lines: [{ accountId: "11111111-1111-1111-1111-111111111111", debit: "5" }, { accountId: "11111111-1111-1111-1111-111111111112", credit: "5" }] })], ["1MB+ body", await A("POST", "/v1/parties", { name: "x".repeat(1_200_000), roles: ["customer"] })], ["huge amount", await A("POST", "/v1/vouchers", { type: "JV", date: "2026-11-03", lines: [{ accountId: leaf[0].id, debit: "10000000000000000000" }, { accountId: leaf[1].id, credit: "10000000000000000000" }] })]];
  return [false, probes.map(([n, r]) => `${n}→${r.status} ${r.body?.error?.code} ${JSON.stringify(r.body?.error?.details ?? "").slice(0, 70)}`).join(" || ")];
});
await t("O4", "live CORS headers from foreign origin", async () => {
  const r = await fetch(BASE + "/api/health", { headers: { origin: "https://evil.example" } }); const p = await fetch(BASE + "/api/v1/parties", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
  const h = {}; for (const k of ["access-control-allow-origin", "x-frame-options", "content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy", "cache-control"]) h[k] = r.headers.get(k);
  return [!r.headers.get("access-control-allow-origin"), JSON.stringify(h) + ` preflight ${p.status} acao=${p.headers.get("access-control-allow-origin")}`];
});
await t("O9", "site headers / clickjacking", async () => { const r = await fetch(BASE + "/login"); const h = {}; for (const k of ["x-frame-options", "content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy", "permissions-policy"]) h[k] = r.headers.get(k); return [!!(h["x-frame-options"] || (h["content-security-policy"] ?? "").includes("frame-ancestors")), JSON.stringify(h)]; });
await t("C6", "Supabase REST door closed with the publishable key", async () => {
  const html = await (await fetch(BASE + "/login")).text(); const js = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]);
  let url = null, key = null; for (const s of js) { const x = await (await fetch(BASE + s)).text(); url ??= x.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0]; key ??= x.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/)?.[0]; }
  if (!url || !key) return [false, `could not find url/key in ${js.length} chunks (url ${!!url}, key ${!!key})`];
  const res = []; for (const tb of ["users", "parties", "companies", "journal_entries"]) { const r = await fetch(`${url}/rest/v1/${tb}?select=*&limit=1`, { headers: { apikey: key, authorization: `Bearer ${key}` } }); res.push(`${tb}:${r.status}:${(await r.text()).slice(0, 60)}`); }
  const rpc = await fetch(`${url}/rest/v1/rpc/anything`, { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: "{}" });
  return [res.every((x) => !/^\w+:200:\[\{/.test(x)), res.join(" | ") + ` rpc:${rpc.status}`];
});
await t("O5", "secrets in JS bundles", async () => {
  const html = await (await fetch(BASE + "/login")).text(); const js = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]); const hits = [];
  for (const s of js) { const x = await (await fetch(BASE + s)).text(); for (const [n, re] of [["secret key", /sb_secret_[A-Za-z0-9_-]+/], ["postgres url", /postgres(ql)?:\/\/[^\s"']+/], ["service_role", /service_role/], ["CNIC key", /CNIC_(HMAC|DATA)_KEY/], ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY/]]) if (re.test(x)) hits.push(`${n} in ${s}`); }
  return [hits.length === 0, `${js.length} chunks scanned; ${hits.join(", ")}`];
});

// ── latency
const timed = {}; for (const l of lat) { const k = `${l.m} ${l.path}`; (timed[k] ??= []).push(l.ms); }
const all = lat.map((l) => l.ms).sort((a, b) => a - b);
console.log("LATENCY n=" + all.length, "median", all[Math.floor(all.length / 2)], "p90", all[Math.floor(all.length * 0.9)], "max", all[all.length - 1]);
console.log("SLOWEST", Object.entries(timed).map(([k, v]) => [k, Math.max(...v)]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${v}`).join(" | "));
console.log("CREATED", JSON.stringify(created));
console.log(`SUMMARY ${out.filter((o) => o.ok).length}/${out.length}`);
