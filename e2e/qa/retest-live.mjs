// QA re-test on the LIVE site after the fixes are deployed. Creates only QA- records inside the seeded ByteCraft company.
// Credentials come ONLY from the environment: QA_EMAIL, QA_PASSWORD (never written to a file, a log or the report).
//   node e2e/qa/retest-live.mjs
// What it proves (the things the in-memory test database cannot):
//   R1  10 receipts sent at the same instant with ONE request id make exactly ONE receipt (real parallel connections)
//   R2  10 identical receipts WITHOUT a request id are still 10 receipts (the old behaviour is unchanged for old clients)
//   R3  the same id with different details is refused
//   B1  an approved voucher cannot be deleted (409), and the proper void still reverses it
//   H   the browser-hardening headers are on the live pages and on the API
//   T   the trial balance still balances afterwards
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "https://property-dealers-project.netlify.app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) throw new Error("Set QA_EMAIL and QA_PASSWORD in the environment first.");

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
await sleep(800);
await page.type("#email", process.env.QA_EMAIL);
await page.type("#password", process.env.QA_PASSWORD);
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60000 });
const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
await browser.close();

const me = await (await fetch(BASE + "/api/v1/me", { headers: { authorization: `Bearer ${token}` } })).json();
const co = me.companies[0].companyId;
async function call(method, path, body, headers = {}) {
  const r = await fetch(BASE + "/api" + path, { method, headers: { authorization: `Bearer ${token}`, "x-company-id": co, "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  let b = null; try { b = await r.json(); } catch { /* 204 */ }
  return { status: r.status, body: b, headers: r.headers };
}
const out = [];
const rep = (id, ok, note) => { out.push(ok); console.log(JSON.stringify({ id, ok, note })); };
const stamp = Date.now();

// ── set-up: a QA customer, a property, an instalment booking with a plan
const types = (await call("GET", "/v1/property-types")).body; const typeId = (types.rows ?? types).find((x) => /plot/i.test(x.name)).id;
const cust = (await call("POST", "/v1/parties", { name: `QA-Retest ${stamp}`, roles: ["customer"], phone: `0345${String(stamp).slice(-7)}` })).body;
const prop = (await call("POST", "/v1/properties", { title: `QA-Retest plot ${stamp}`, typeId, listPrice: "200000" })).body;
const book = (await call("POST", "/v1/bookings", { propertyId: prop.id, customerId: cust.id, paymentType: "installment" })).body;
await call("POST", `/v1/bookings/${book.id}/schedule`, { downPayment: "20000", installments: 4, firstDue: "2027-01-01" });
const receipts = async () => { const r = (await call("GET", `/v1/receipts?bookingId=${book.id}`)).body; return Array.isArray(r) ? r : r.rows; };

// ── R1: ten simultaneous requests, one request id
const key = `qa-parallel-${stamp}-aaaaaaaa`;
const body = { bookingId: book.id, amount: "1000", method: "cash" };
const t0 = Date.now();
const rs = await Promise.all(Array.from({ length: 10 }, () => call("POST", "/v1/receipts", body, { "idempotency-key": key })));
const ids = new Set(rs.map((r) => r.body?.id));
const after1 = (await receipts()).length;
rep("R1 ten at once, one request id", after1 === 1 && ids.size === 1 && rs.every((r) => r.status === 201), `statuses ${rs.map((r) => r.status).join(",")}; distinct receipt ids ${ids.size}; receipts on the booking ${after1}; ${Date.now() - t0} ms; replays flagged ${rs.filter((r) => r.headers.get("idempotent-replayed") === "true").length}`);

// ── R2: no request id = old behaviour
const rs2 = await Promise.all(Array.from({ length: 3 }, () => call("POST", "/v1/receipts", { bookingId: book.id, amount: "10", method: "cash" })));
const after2 = (await receipts()).length;
rep("R2 three at once, no request id", rs2.every((r) => r.status === 201) && after2 === after1 + 3, `receipts now ${after2} (expected ${after1 + 3})`);

// ── R3: same id, different details
const changed = await call("POST", "/v1/receipts", { ...body, amount: "999" }, { "idempotency-key": key });
rep("R3 same id, different amount refused", changed.status === 409 && /different details/.test(changed.body?.error?.message ?? ""), `${changed.status} ${changed.body?.error?.message}`);

// ── B1: an approved voucher cannot be deleted; the proper void works
const accts = (await call("GET", "/v1/accounts")).body.filter((a) => !(a.isGroup ?? a.is_group));
const v = (await call("POST", "/v1/vouchers", { type: "JV", date: new Date().toISOString().slice(0, 10), description: `QA-Retest delete test ${stamp}`, lines: [{ accountId: accts[0].id, debit: "77.00" }, { accountId: accts[1].id, credit: "77.00" }] })).body;
await call("POST", `/v1/vouchers/${v.id}/submit`); await call("POST", `/v1/vouchers/${v.id}/approve`, {});
const del = await call("DELETE", `/v1/vouchers/${v.id}`);
const still = (await call("GET", `/v1/vouchers/${v.id}`)).body;
const voided = await call("POST", `/v1/vouchers/${v.id}/void`, { reason: "QA-Retest proper void" });
rep("B1 approved voucher cannot be deleted", del.status === 409 && still.status === "approved", `delete -> ${del.status} ${del.body?.error?.message}; status after: ${still.status}`);
rep("B1b the proper void still works", voided.status === 200 && voided.body?.status === "void", `void -> ${voided.status}`);
const unknown = await call("DELETE", "/v1/vouchers/11111111-1111-1111-1111-111111111111");
rep("B1c deleting an unknown voucher is a 404", unknown.status === 404, String(unknown.status));

// ── H: headers
for (const [label, url] of [["page /login", BASE + "/login"], ["API /api/health", BASE + "/api/health"]]) {
  const h = (await fetch(url)).headers;
  const get = (n) => h.get(n) ?? "";
  const ok = get("x-frame-options").toUpperCase() === "DENY" && /frame-ancestors 'none'/.test(get("content-security-policy")) && get("x-content-type-options") === "nosniff" && !!get("referrer-policy") && /camera=\(\)/.test(get("permissions-policy"));
  rep(`H headers on ${label}`, ok, `xfo=${get("x-frame-options")} csp=${get("content-security-policy").slice(0, 60)} nosniff=${get("x-content-type-options")} referrer=${get("referrer-policy")} hsts=${get("strict-transport-security") ? "yes" : "NO"}`);
}

// ── T: books balance
const tb = (await call("GET", "/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31")).body.totals;
rep("T trial balance balances", Math.abs(tb.debit - tb.credit) < 0.005, `${tb.debit} / ${tb.credit}`);

console.log(`SUMMARY ${out.filter(Boolean).length}/${out.length} pass`);
process.exit(out.every(Boolean) ? 0 : 1);
