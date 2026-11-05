// QA (group 2, BUG-004): every live screen shows a skeleton while loading, and an error with "Try again" when its data fails.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3411", API = process.env.API ?? "http://localhost:4400";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
let mode = "ok", prefix = null, hits = 0;
await page.setRequestInterception(true);
page.on("request", (r) => {
  if (prefix && mode !== "ok" && r.method() === "GET" && r.url().startsWith(API + prefix)) {
    hits++;
    if (mode === "500") return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on our side.", requestId: "11111111-2222-3333-4444-555555555555" } }) });
    if (mode === "403") return r.respond({ status: 403, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "not_permitted", message: "Your role does not allow this (inventory.view)." } }) });
    if (mode === "slow") return setTimeout(() => r.continue().catch(() => {}), 4000);
  }
  r.continue();
});
await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 }); await sleep(3000);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }); await sleep(3000);

const routes = [
  ["/dashboard", "/v1/dashboard"], ["/dashboard/projects", "/v1/projects"], ["/dashboard/properties", "/v1/properties"], ["/dashboard/plot-map", "/v1/properties"],
  ["/dashboard/customers", "/v1/parties"], ["/dashboard/deals", "/v1/bookings"], ["/dashboard/crm", "/v1/leads"], ["/dashboard/quotations", "/v1/quotations"],
  ["/dashboard/service-invoices", "/v1/service-invoices"], ["/dashboard/cheques", "/v1/cheques"], ["/dashboard/contracts", "/v1/contracts"], ["/dashboard/contractors", "/v1/contractors"],
  ["/dashboard/accounts", "/v1/accounts"], ["/dashboard/vouchers", "/v1/vouchers"], ["/dashboard/expenses", "/v1/expenses"], ["/dashboard/budgets", "/v1/budgets"],
  ["/dashboard/reports", "/v1/reports"], ["/dashboard/staff", "/v1/employees"], ["/dashboard/payroll", "/v1/payroll"], ["/dashboard/leave", "/v1/leave"],
  ["/dashboard/administration/users", "/v1/members"], ["/dashboard/administration/roles", "/v1/roles"], ["/dashboard/administration/company-profile", "/v1/company"],
  ["/dashboard/administration/activity", "/v1/audit"], ["/dashboard/bank-reconciliation", "/v1/bank-accounts"],
];
const main = () => page.evaluate(() => { const m = document.querySelector("main"); return { text: (m?.innerText ?? "").replace(/\s+/g, " "), busy: !!document.querySelector("main [aria-busy=true]"), alert: [...document.querySelectorAll("main [role=alert]")].map((x) => x.innerText).join(" | ") }; });
const results = [];
for (const [route, p] of routes) {
  const row = { route, err: "", retry: "", skeleton: "", tiles0: "" };
  // 1. the request fails
  prefix = p; mode = "500"; hits = 0;
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
  let m;
  for (let i = 0; i < 40; i++) { await sleep(500); m = await main(); if (/couldn't load this page/i.test(m.alert)) break; }
  const sawPanel = /couldn't load this page/i.test(m.alert) && /Try again/.test(m.alert + m.text);
  const falseZero = /\b0 (people|properties|projects|bookings|vouchers|leads|quotations)/i.test(m.text);
  row.err = sawPanel ? "panel" : "NO PANEL: " + m.text.slice(0, 120);
  row.tiles0 = falseZero ? "FALSE ZERO VISIBLE" : "";
  // 2. it recovers; press Try again
  if (sawPanel) {
    mode = "ok";
    await page.evaluate(() => { const b = [...document.querySelectorAll("main [role=alert] button")].find((x) => /Try again/.test(x.textContent)); b?.click(); });
    for (let i = 0; i < 30; i++) { await sleep(500); m = await main(); if (!/couldn't load this page/i.test(m.alert) && !m.busy && m.text.length > 40) break; }
    row.retry = !/couldn't load this page/i.test(m.alert) && m.text.length > 40 ? "recovered" : "STILL BROKEN: " + m.text.slice(0, 100);
  }
  // 3. slow answer: skeleton, not zeros
  prefix = p; mode = "slow"; hits = 0;
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
  await sleep(1800); m = await main();
  const zerosWhileLoading = /\b0 (people|properties|projects|bookings|vouchers|leads|quotations)|No .* (yet|match)/i.test(m.text);
  row.skeleton = m.busy && !zerosWhileLoading ? "skeleton" : `BUSY=${m.busy} zeros=${zerosWhileLoading}: ${m.text.slice(0, 90)}`;
  mode = "ok"; await sleep(5000);
  const ok = row.err === "panel" && row.retry === "recovered" && row.skeleton === "skeleton" && !row.tiles0;
  results.push(ok);
  console.log((ok ? "ok    " : "FAIL  ") + JSON.stringify(row));
}
// 403 shows the server's plain sentence
prefix = "/v1/properties"; mode = "403"; await page.goto(BASE + "/dashboard/properties", { waitUntil: "domcontentloaded" });
let m3; for (let i = 0; i < 30; i++) { await sleep(500); m3 = await main(); if (/couldn't load/i.test(m3.alert)) break; }
console.log("403 →", m3.alert);
await page.screenshot({ path: new URL("../shots/qa/g2-error-panel.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
console.log(`SUMMARY ${results.filter(Boolean).length}/${results.length} screens ok`);
await browser.close();
