// QA scratch: open every route at several widths; record blank/crash/raw-key/overflow/console errors; print pages; 404.
// env: BASE, API (e.g. http://localhost:4100 or https://…/api), QA_EMAIL, QA_PASSWORD, WIDTHS (comma list), SHOT_PREFIX
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, API = process.env.API;
const WIDTHS = (process.env.WIDTHS ?? "1440,375").split(",").map(Number);
const SH = new URL("../shots/qa", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"); const PFX = process.env.SHOT_PREFIX ?? "sw";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
let errs = []; page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 160))); page.on("console", (m) => { if (["error", "warning"].includes(m.type())) { const x = m.text(); if (!/Failed to load resource/.test(x) || /5\d\d/.test(x)) errs.push(m.type() + ": " + x.slice(0, 200)); } });
const failedReq = []; page.on("response", (r) => { if (r.status() >= 500) failedReq.push(r.status() + " " + r.url().replace(BASE, "").slice(0, 80)); });
await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 40000 });
if (process.env.LANG_CODE) { await page.setCookie({ name: "propiq-lang", value: process.env.LANG_CODE, url: BASE }); }
await sleep(2500);
const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const me = await (await fetch(API + "/v1/me", { headers: { authorization: `Bearer ${token}` } })).json(); const co = me.companies[0].companyId;
if (process.env.LANG_CODE) { const r = await fetch(API + "/v1/me", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ language: process.env.LANG_CODE }) }); console.log("set language", process.env.LANG_CODE, r.status); }
const api = async (p) => { const r = await fetch(API + p, { headers: { authorization: `Bearer ${token}`, "x-company-id": co } }); return r.json().catch(() => null); };
const first = async (p) => { const b = await api(p); const rows = Array.isArray(b) ? b : b?.rows ?? []; return rows[0]; };
const ids = { booking: (await first("/v1/bookings"))?.id, receipt: (await first("/v1/receipts"))?.id, voucher: (await first("/v1/vouchers"))?.id, "service-invoice": (await first("/v1/service-invoices"))?.id, quotation: (await first("/v1/quotations"))?.id, contract: (await first("/v1/contracts"))?.id, party: (await first("/v1/parties"))?.id, property: (await first("/v1/properties"))?.id, project: (await first("/v1/projects"))?.id };
console.log("ids found:", Object.entries(ids).map(([k, v]) => `${k}:${v ? "y" : "n"}`).join(" "));
const routes = ["/dashboard", "/dashboard/projects", `/dashboard/projects/${ids.project}`, "/dashboard/properties", `/dashboard/properties/${ids.property}`, "/dashboard/plot-map", "/dashboard/customers", "/dashboard/deals", `/dashboard/deals/${ids.booking}`, "/dashboard/crm", "/dashboard/quotations", "/dashboard/sales-invoices", "/dashboard/service-invoices", "/dashboard/cheques", "/dashboard/contracts", "/dashboard/contractors", "/dashboard/accounts", "/dashboard/vouchers", `/dashboard/vouchers/${ids.voucher}`, "/dashboard/vouchers/new", "/dashboard/bank-reconciliation", "/dashboard/expenses", "/dashboard/budgets", "/dashboard/reports", "/dashboard/staff", "/dashboard/payroll", "/dashboard/leave", "/dashboard/administration/users", "/dashboard/administration/roles", "/dashboard/administration/company-profile", "/dashboard/administration/activity", "/dashboard/account", "/dashboard/settings", "/dashboard/settings/billing", "/dashboard/companies", "/dashboard/no-such-page", "/totally-unknown"];
const KEY = /(?<![\w.@/:-])(common|nav|shell|auth|account|dashboard|admin|files|projects|properties|customers|deals|sales|vouchers|finance|people|administration|site|output|dm|status|err|print)\.[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*(?![\w@.]*\.(com|pk|app))\b/g;
const rows = [];
for (const w of WIDTHS) {
  await page.setViewport({ width: w, height: 900 });
  for (const r of routes) {
    errs = []; failedReq.length = 0;
    const t0 = Date.now();
    await page.goto(BASE + r, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
    await sleep(w === WIDTHS[0] ? 1800 : 1200);
    const info = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, path: location.pathname, len: document.body.innerText.length, sw: document.documentElement.scrollWidth, iw: window.innerWidth, txt: document.body.innerText.slice(0, 6000), h1: (document.querySelector("h1")?.textContent ?? "").slice(0, 50), title: document.title }));
    const keys = [...new Set((info.txt.match(KEY) ?? []).filter((k) => !/^(www|http|e\.g|i\.e|etc)/.test(k)))].slice(0, 4);
    const crash = /Something went wrong|Application error|Unhandled|TypeError|undefined|NaN|\[object/.test(info.txt) ? (info.txt.match(/Something went wrong|Application error|Unhandled|TypeError|undefined|NaN|\[object Object\]/)?.[0]) : "";
    const row = { lang: info.lang, dir: info.dir, w, r: r.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, ":id"), ms: Date.now() - t0, path: info.path, len: info.len, overflow: info.sw > info.iw + 1 ? info.sw - info.iw : 0, keys, crash, errs: [...new Set(errs)].slice(0, 3), h5xx: [...failedReq], title: info.title, h1: info.h1 };
    rows.push(row);
    const bad = row.len < 120 || row.overflow || keys.length || crash || row.errs.length || row.h5xx.length;
    console.log((bad ? "ISSUE " : "ok    ") + JSON.stringify(row));
    if (bad || /^\/dashboard(\/projects|\/deals|\/accounts)?$/.test(r)) await page.screenshot({ path: `${SH}/${PFX}-${w}-${r.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.png` });
  }
}
if (process.env.SKIP_PRINT) { console.log("DONE routes", rows.length, "issues", rows.filter((x) => x.len < 120 || x.overflow || x.keys.length || x.crash || x.errs.length || x.h5xx.length).length); await browser.close(); process.exit(0); }
// print pages
await page.setViewport({ width: 1100, height: 1400 });
for (const [kind, id] of [["receipt", ids.receipt], ["voucher", ids.voucher], ["service-invoice", ids["service-invoice"]], ["booking", ids.booking], ["statement", ids.party], ["quotation", ids.quotation], ["contract", ids.contract], ["receipt", "00000000-0000-0000-0000-0000000000ff"], ["receipt", "not-a-uuid"], ["nope", ids.booking]]) {
  if (!id) { console.log(`PRINT ${kind}: no record to print`); continue; }
  errs = [];
  await page.goto(`${BASE}/print/${kind}/${id}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}); await sleep(2500);
  const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 260));
  console.log(`PRINT ${kind}/${id.slice(0, 8)} → ${t.length > 5 ? t : "(empty)"} | errs ${errs.slice(0, 2).join(";")}`);
  await page.screenshot({ path: `${SH}/${PFX}-print-${kind}-${id.slice(0, 4)}.png`, fullPage: true });
}
const slow = rows.filter((x) => x.ms > 6000).map((x) => `${x.r}@${x.w}=${x.ms}`);
console.log("DONE routes", rows.length, "issues", rows.filter((x) => x.len < 120 || x.overflow || x.keys.length || x.crash || x.errs.length || x.h5xx.length).length, "slow", slow.join(","));
await browser.close();
