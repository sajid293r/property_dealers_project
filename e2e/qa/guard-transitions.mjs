// Prints every change of the guard's visible state (hidden/skeleton/shown, data present) with timestamps, and every API GET the page makes.
import puppeteer from "puppeteer-core";
const BLOCK = process.env.BLOCK; // e.g. /v1/leave: that GET answers 500
const BASE = process.env.BASE, DELAY = Number(process.env.PAGE_CHUNK_DELAY ?? 0), ROUTE = process.env.ROUTE ?? "/dashboard/deals", MARK = process.env.MARK ?? "BOOKING-", API = process.env.API;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
const shell = new Set(); let learning = true, t0 = 0; const events = [];
await page.setRequestInterception(true);
page.on("request", (r) => {
  const u = r.url(); const chunk = u.includes("/_next/static/");
  if (learning && chunk) shell.add(u);
  if (!learning && u.startsWith(API) && r.method() === "GET") events.push([Date.now() - t0, "API GET " + u.replace(API, "")]);
  if (BLOCK && !learning && r.method() === "GET" && u.startsWith(API + BLOCK)) { return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "x" } }) }); }
  if (DELAY > 0 && !learning && chunk && !shell.has(u)) { setTimeout(() => r.continue().catch(() => {}), DELAY); return; }
  r.continue();
});
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 150000 }); await page.waitForSelector("#email"); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 150000 }); await sleep(4000);
learning = false; await page.setCacheEnabled(false);
t0 = Date.now(); await page.goto(BASE + ROUTE, { waitUntil: "domcontentloaded", timeout: 150000 });
let last = "";
for (let i = 0; i < 400; i++) {
  const s = await page.evaluate((mark) => { const m = document.querySelector("main"); if (!m) return "no <main>"; const g = m.querySelector("[aria-busy]"); const txt = m.innerText; const w = g?.firstElementChild; const els = w ? w.querySelectorAll("*").length : -1; const fb = w ? !!w.querySelector("[aria-live=polite]") : null; const marked = w ? !!w.querySelector("[data-route-loading]") : null; const keyed = (n) => Object.keys(n).some((k) => k.startsWith("__reactFiber$")); const unkeyed = w ? [...w.querySelectorAll("*")].filter((n) => !keyed(n)).length : -1; return `markedPlaceholder=${marked} unkeyedEls=${unkeyed} routeLoadingFallbackInWrapper=${fb} wrapperElements=${els} guard=${g ? "mounted" : "absent"} busy=${g?.getAttribute("aria-busy")} text=${txt.length > 40 ? "yes" : "no"} data=${txt.includes(mark)} notice=${/Some information couldn.t be loaded/i.test(txt)} panelNow=${/couldn.t load this page/i.test(txt)} zeroTiles=${/\b0 (bookings|people|properties)/.test(txt)}`; }, MARK).catch(() => "(navigating)");
  if (s !== last) { events.push([Date.now() - t0, "STATE " + s]); last = s; }
  await sleep(50);
}
events.sort((a, b) => a[0] - b[0]); for (const [t, e] of events) console.log(String(t).padStart(6) + " ms  " + e);
await browser.close();
