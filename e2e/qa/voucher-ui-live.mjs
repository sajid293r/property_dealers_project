// QA re-test blocker 1 in the browser (LIVE, QA- records): an approved voucher has no Delete, Void works, trial balance balances.
// Also 375 px screenshots of Vouchers, Deals, booking detail, Accounts. env: QA_EMAIL, QA_PASSWORD, BASE
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, API = BASE + "/api", stamp = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) throw new Error("env");
const check = (n, ok, x = "") => console.log((ok ? "  PASS " : "  FAIL ") + n + (x ? "  — " + String(x).slice(0, 240) : ""));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1280, height: 1000 } });
const page = await (await browser.createBrowserContext()).newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60000 }); await sleep(2500);
const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const co = (await (await fetch(API + "/v1/me", { headers: { authorization: `Bearer ${token}` } })).json()).companies[0].companyId;
const api = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { authorization: `Bearer ${token}`, "x-company-id": co, ...(b !== undefined ? { "content-type": "application/json" } : {}) }, body: b !== undefined ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch { /* none */ } return { s: r.status, b: j }; };
const rows = (x) => (Array.isArray(x) ? x : x?.rows ?? []);
const accts = rows((await api("GET", "/v1/accounts")).b).filter((a) => !(a.isGroup ?? a.is_group));
const today = new Date().toISOString().slice(0, 10);
const v = (await api("POST", "/v1/vouchers", { type: "JV", date: today, description: `QA-UI void ${stamp}`, lines: [{ accountId: accts[0].id, debit: "55.00" }, { accountId: accts[1].id, credit: "55.00" }] })).b;
await api("POST", `/v1/vouchers/${v.id}/submit`); const ap = await api("POST", `/v1/vouchers/${v.id}/approve`, {});
check("QA voucher approved", ap.s === 200, String(ap.s));
await page.goto(`${BASE}/dashboard/vouchers/${v.id}`, { waitUntil: "domcontentloaded" }); await sleep(7000);
const btns = await page.evaluate(() => [...document.querySelectorAll("button, a")].map((b) => b.textContent.trim()).filter(Boolean));
check("approved voucher page has no Delete button", !btns.some((t) => /^delete|discard/i.test(t)), btns.filter((t) => /delete|discard|void/i.test(t)).join(" | ") || "(no delete/discard/void buttons listed)");
check("approved voucher page offers Void", btns.some((t) => /void/i.test(t)));
await page.screenshot({ path: "e2e/shots/qa/retest-voucher-approved.png" });
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^void/i.test(b.textContent.trim()))?.click()); await sleep(1200);
const ta = await page.$("[role=dialog] textarea, [role=dialog] input:not([type=hidden])");
if (ta) { await ta.type("QA-UI void"); await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => /void/i.test(b.textContent) && !/close/i.test(b.textContent) && b.textContent.trim().length < 20 && b.textContent.trim() !== "Void" ? true : false)?.click()); }
await sleep(500);
const confirmBtn = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].map((b) => b.textContent.trim()));
console.log("   dialog buttons:", JSON.stringify(confirmBtn));
await page.evaluate(() => { const bs = [...document.querySelectorAll("[role=dialog] button")]; (bs.find((b) => /^void\b/i.test(b.textContent.trim())) ?? bs.at(-1))?.click(); });
await sleep(3000);
const after = (await api("GET", `/v1/vouchers/${v.id}`)).b;
check("Void from the screen works (status void)", after.status === "void", after.status);
const tb = (await api("GET", "/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31")).b.totals;
check("trial balance still balances", Math.abs(tb.debit - tb.credit) < 0.005, `${tb.debit}/${tb.credit}`);
// 375 px screenshots
const bl = rows((await api("GET", "/v1/bookings")).b); const bid = (bl.find((b) => /QA-Smoke/.test(b.customerName ?? "")) ?? bl[0]).id;
await page.setViewport({ width: 375, height: 800 });
for (const [name, path] of [["vouchers", "/dashboard/vouchers"], ["deals", "/dashboard/deals"], ["booking", `/dashboard/deals/${bid}`], ["accounts", "/dashboard/accounts"]]) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" }); await sleep(8000);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.screenshot({ path: `e2e/shots/qa/retest-375-${name}.png`, fullPage: false });
  console.log(`   375px ${name}: page overflow ${over}px`);
}
await browser.close();
