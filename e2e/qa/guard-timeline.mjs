// Guard behaviour frame by frame (sandbox or any site you sign in to). For each route: hard load with the browser cache off; optionally the
// screen's own code (chunks beyond the dashboard shell) is delayed by PAGE_CHUNK_DELAY ms. Samples every 150 ms and reports:
//   skeleton ms        how long the page was hidden behind the skeleton (aria-busy)
//   false-empty frames frames where the page was shown WITHOUT the data it has (a "false zero"), before the data appeared
//   data at            ms until a real record (the route's marker text) is on screen
// Routes with marker "-" have no data of their own (account, settings): then only the skeleton time matters.
// env: BASE, QA_EMAIL, QA_PASSWORD, PAGE_CHUNK_DELAY (default 0), ROUTES (comma list of path|marker, default below)
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, DELAY = Number(process.env.PAGE_CHUNK_DELAY ?? 0);
const ROUTES = (process.env.ROUTES ?? "/dashboard/properties|QA-B21,/dashboard/deals|BOOKING-,/dashboard/customers|QA-B21,/dashboard/account|-,/dashboard/settings|-").split(",").map((x) => x.split("|"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) throw new Error("env");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
const shell = new Set(); let learning = true;
await page.setRequestInterception(true);
page.on("request", (r) => {
  const isChunk = r.url().includes("/_next/static/");
  if (learning && isChunk) shell.add(r.url());
  if (DELAY > 0 && !learning && isChunk && !shell.has(r.url())) { setTimeout(() => r.continue().catch(() => {}), DELAY); return; }
  r.continue();
});
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 150000 }); await page.waitForSelector("#email", { timeout: 150000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 150000 }); await sleep(4000);
learning = false; await page.setCacheEnabled(false);
const probe = (marker) => page.evaluate((marker) => {
  const m = document.querySelector("main"); if (!m) return { main: false };
  const txt = m.innerText.replace(/\s+/g, " ");
  return { sample: txt.slice(40, 150), main: true, busy: !!document.querySelector("main [aria-busy=true]"), len: txt.length, data: marker !== "-" && txt.includes(marker), panel: /couldn.t load this page/i.test(txt), notice: /Some information couldn.t be loaded/i.test(txt) };
}, marker);
let problems = 0;
for (const [route, marker] of ROUTES) {
  const t0 = Date.now(); await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 150000 });
  let skeletonMs = 0, falseEmpty = 0, dataAt = null, firstShown = null, last = null, prev = Date.now();
  for (let i = 0; i < 300; i++) {
    const s = await probe(marker).catch(() => ({ main: false })); const now = Date.now(); last = s;
    if (s.main) {
      if (s.busy) skeletonMs += now - prev;
      else if (s.len > 40) { if (firstShown === null) firstShown = now - t0; if (marker !== "-" && !s.data && dataAt === null) { falseEmpty++; if (falseEmpty === 1) console.log(`     first empty frame at ${now - t0} ms shows: "${s.sample}"${s.notice ? " [notice]" : ""}`); } }
      if (s.data && dataAt === null) dataAt = now - t0;
    }
    prev = now;
    if ((marker !== "-" && dataAt !== null && now - t0 > dataAt + 600) || (marker === "-" && firstShown !== null && now - t0 > firstShown + 1500)) break;
    await sleep(150);
  }
  const bad = marker !== "-" ? falseEmpty > 0 || dataAt === null : false;
  if (bad) problems++;
  console.log(`${bad ? "FALSE-ZERO " : "ok         "}${route}: page shown at ${firstShown ?? "never"} ms, skeleton ${skeletonMs} ms, data at ${dataAt ?? (marker === "-" ? "n/a" : "NEVER")} ms, frames shown without data ${marker === "-" ? "n/a" : falseEmpty}${last?.panel ? ", PANEL" : ""}`);
}
console.log(`SUMMARY: ${problems} route(s) showed an empty page before the data arrived (page-chunk delay ${DELAY} ms)`);
await browser.close();
