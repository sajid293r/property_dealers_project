// QA diagnosis (LIVE, read-only): frame-by-frame view of a failing load. Blocks the screen's main GET with a 500 in the browser,
// samples the page every 250 ms and prints each CHANGE (skeleton / panel / notice / zero tiles). env: QA_EMAIL, QA_PASSWORD, BASE, ROUTE, PREFIX, LOOPS
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, API = BASE + "/api", ROUTE = process.env.ROUTE ?? "/dashboard/contracts", PREFIX = process.env.PREFIX ?? "/v1/contracts", LOOPS = Number(process.env.LOOPS ?? 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) throw new Error("env");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
let block = false, hits = [], t0 = 0;
const COLD = process.env.COLD === "1"; // COLD=1: browser cache off, so every load downloads the screen code again (a first visit)
await page.setRequestInterception(true);
page.on("request", (r) => {
  if (block && r.method() === "GET" && r.url().startsWith(API + PREFIX)) { hits.push(Date.now() - t0); return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on our side." } }) }); }
  r.continue();
});
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 150000 }); await page.waitForSelector("#email", { timeout: 150000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 150000 }); await sleep(3000);
const probe = () => page.evaluate(() => {
  const m = document.querySelector("main"); const txt = (m?.innerText ?? "").replace(/\s+/g, " ");
  const alerts = [...document.querySelectorAll("main [role=alert]")].map((x) => x.innerText.replace(/\s+/g, " ").slice(0, 40)).join("|");
  return `${document.querySelector("main [aria-busy=true]") ? "BUSY " : ""}${/couldn.t load this page/i.test(alerts) ? "PANEL " : alerts ? "NOTICE(" + alerts + ") " : ""}${/\b0 (contracts|vouchers|projects|properties|bookings|quotations)/i.test(txt) || /Contracts 0|0 Contracts/.test(txt) ? "ZERO-TILES " : ""}${txt.length < 40 ? "(empty)" : ""}`.trim() || "(page shown, no panel)";
});
if (COLD) await page.setCacheEnabled(false);
for (let n = 1; n <= LOOPS; n++) {
  block = true; hits = []; t0 = Date.now();
  await page.goto(BASE + ROUTE, { waitUntil: "domcontentloaded", timeout: 150000 });
  let last = "", line = [];
  for (let i = 0; i < 160; i++) { const s = await probe().catch(() => "(navigating)"); if (s !== last) { line.push(`${Date.now() - t0}ms: ${s}`); last = s; } await sleep(250); }
  const verdict = /PANEL/.test(last) ? "OK   " : "MISS ";
  console.log(`${verdict}#${n} blocked GETs at [${hits.join(", ")}] ms\n      ${line.join("\n      ")}`);
  block = false; await sleep(1500);
}
await browser.close();
