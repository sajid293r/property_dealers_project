// QA re-test section 6: spot re-checks of the smaller fixes on LIVE. QA- records only. env: QA_EMAIL, QA_PASSWORD, BASE
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, API = BASE + "/api", stamp = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) throw new Error("env");
const res = [];
const check = (n, ok, x = "") => { res.push(!!ok); console.log((ok ? "  PASS " : "  FAIL ") + n + (x ? "  — " + String(x).slice(0, 260) : "")); };
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1280, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
let blockMe = false;
await page.setRequestInterception(true);
page.on("request", (r) => {
  if (blockMe && r.method() === "GET" && r.url() === API + "/v1/me") return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "RAW SERVER TEXT select * from users" } }) });
  r.continue();
});
await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60000 }); await sleep(2500);
const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const co = (await (await fetch(API + "/v1/me", { headers: { authorization: `Bearer ${token}` } })).json()).companies[0].companyId;
const raw = async (m, p, body, ct = "application/json") => {
  const r = await fetch(API + p, { method: m, headers: { authorization: `Bearer ${token}`, "x-company-id": co, ...(body !== undefined ? { "content-type": ct } : {}) }, body });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
  return { s: r.status, b: j, t };
};
const api = (m, p, b) => raw(m, p, b === undefined ? undefined : JSON.stringify(b));
const rows = (x) => (Array.isArray(x) ? x : x?.rows ?? []);
const msg = (r) => r.b?.error?.message ?? r.t.slice(0, 120);

// BUG-007
const big = await raw("POST", "/v1/parties", JSON.stringify({ name: "QA-big", roles: ["customer"], notes: "x".repeat(1_200_000) }));
check("BUG-007 a body over 1 MB -> 413 (not 500)", big.s === 413, `${big.s} ${msg(big)}`);
const broken = await raw("POST", "/v1/parties", "{\"name\": ", "application/json");
check("BUG-007 broken JSON -> 400 (not 500)", broken.s === 400, `${broken.s} ${msg(broken)}`);
const accts = rows((await api("GET", "/v1/accounts")).b).filter((a) => !(a.isGroup ?? a.is_group));
const today = new Date().toISOString().slice(0, 10);
const huge = await api("POST", "/v1/vouchers", { type: "CPV", date: today, description: "QA-huge amount", lines: [{ accountId: accts[0].id, debit: "99999999999999999999.00" }, { accountId: accts[1].id, credit: "99999999999999999999.00" }] });
check("BUG-007 a 20-digit amount -> 4xx (not 500)", huge.s >= 400 && huge.s < 500, `${huge.s} ${msg(huge)}`);

// BUG-008 overlapping leave
const emp = await api("POST", "/v1/employees", { fullName: `QA-Leave Tester ${stamp}`, joinDate: "2026-01-01", basicSalary: "50000", houseAllowance: "0", transportAllowance: "0", otherAllowance: "0" });
const types = rows((await api("GET", "/v1/leave/types")).b);
if (emp.s === 201 && types[0]) {
  const l1 = await api("POST", "/v1/leave/requests", { employeeId: emp.b.id, leaveTypeId: types[0].id, fromDate: "2027-03-10", toDate: "2027-03-12", reason: "QA-1" });
  const l2 = await api("POST", "/v1/leave/requests", { employeeId: emp.b.id, leaveTypeId: types[0].id, fromDate: "2027-03-11", toDate: "2027-03-13", reason: "QA-2" });
  check("BUG-008 overlapping leave -> 409 naming the person", l1.s === 201 && l2.s === 409 && /QA-Leave Tester/.test(msg(l2)), `${l1.s} then ${l2.s} ${msg(l2)}`);
  if (l1.b?.id) await api("POST", `/v1/leave/requests/${l1.b.id}/cancel`, {});
} else check("BUG-008 overlapping leave", false, `employee create ${emp.s} ${msg(emp)}; leave types ${types.length}`);

// BUG-009: five bad requests, no schema names in the answers
const ghost = "11111111-1111-1111-1111-111111111111";
const bad = [];
bad.push(["voucher with unknown account", await api("POST", "/v1/vouchers", { type: "JV", date: today, description: "QA-ghost", lines: [{ accountId: ghost, debit: "5.00" }, { accountId: accts[1].id, credit: "5.00" }] })]);
bad.push(["booking with unknown property/customer", await api("POST", "/v1/bookings", { propertyId: ghost, customerId: ghost, paymentType: "cash" })]);
const dupName = `QA-DupCNIC ${stamp}`;
const cn = "35202" + String(stamp).slice(-7) + "1";
await api("POST", "/v1/parties", { name: dupName, roles: ["customer"], cnic: cn });
bad.push(["duplicate CNIC", await api("POST", "/v1/parties", { name: dupName + "b", roles: ["customer"], cnic: cn })]);
const bank = rows((await api("GET", "/v1/bank-accounts")).b)[0];
bad.push(["statement line with no amount", await api("POST", `/v1/bank-accounts/${bank.id}/statements`, { periodFrom: "2026-10-01", periodTo: "2026-10-02", openingBalance: "0", closingBalance: "0", lines: [{ date: "2026-10-01", description: "QA-zero" }] })]);
bad.push(["cheque with unknown person", await api("POST", "/v1/cheques", { chequeNo: `QA-G-${stamp}`, bankName: "QA Bank", partyId: ghost, amount: "10", chequeDate: "2027-01-01" })]);
const leaky = /constraint|_fkey|_check|_key\b|_pkey|violates|relation "|column "|\bpg_|duplicate key|syntax error/i;
for (const [what, r] of bad) check(`BUG-009 ${what}: 4xx, no schema words`, r.s >= 400 && r.s < 500 && !leaky.test(r.t), `${r.s} ${msg(r)}${leaky.test(r.t) ? " | LEAK: " + r.t.slice(0, 200) : ""}`);

// BUG-010 same account both sides
const same = await api("POST", "/v1/vouchers", { type: "JV", date: today, description: `QA-same account ${stamp}`, lines: [{ accountId: accts[0].id, debit: "10.00" }, { accountId: accts[0].id, credit: "10.00" }] });
let subm = null;
if (same.s === 201) subm = await api("POST", `/v1/vouchers/${same.b.id}/submit`);
check("BUG-010 journal with the same account both sides refused (at create or submit)", same.s >= 400 || (subm && subm.s >= 400), `create ${same.s}, submit ${subm?.s} ${subm ? msg(subm) : msg(same)}`);
if (same.s === 201 && subm?.s >= 400) await api("DELETE", `/v1/vouchers/${same.b.id}`);

// BUG-015 workspace error screen
blockMe = true;
await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" });
let body = ""; for (let i = 0; i < 40; i++) { await sleep(500); body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ")); if (/open your workspace|Try again|Sign out/i.test(body)) break; }
await page.screenshot({ path: "e2e/shots/qa/retest-workspace-error.png" });
const hasRetry = /Try again/i.test(body), hasSignOut = /Sign out/i.test(body), rawText = /RAW SERVER TEXT|select \* from/i.test(body);
check("BUG-015 workspace error screen: clear text, Try again + Sign out, no raw server text", hasRetry && hasSignOut && !rawText, body.slice(0, 200));
blockMe = false;
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Try again/i.test(b.textContent))?.click());
let back = false; for (let i = 0; i < 40; i++) { await sleep(500); if ((await page.evaluate(() => document.body.innerText)).includes("ByteCraft") && !/open your workspace/i.test(await page.evaluate(() => document.body.innerText))) { back = true; break; } }
check("BUG-015 Try again recovers once the server answers", back);
await browser.close();
console.log(`SUMMARY spot checks: ${res.filter(Boolean).length}/${res.length} pass`);
