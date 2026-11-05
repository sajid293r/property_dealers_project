import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, API = process.env.API ?? BASE + "/api", REPEAT = Number(process.env.REPEAT ?? 8), THROTTLE = Number(process.env.THROTTLE ?? 1); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
let prefix = null, hits = 0, log = [];
const cdp = await page.createCDPSession();
if (THROTTLE > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
const HIDDEN_MS = Number(process.env.HIDDEN_MS ?? 0);
// simulate a tab that is in the background for the first HIDDEN_MS after each page load (TanStack pauses retries while hidden)
if (HIDDEN_MS > 0) await page.evaluateOnNewDocument((ms) => {
  const set = (v) => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v }); Object.defineProperty(document, "hidden", { configurable: true, get: () => v === "hidden" }); };
  set("hidden"); setTimeout(() => { set("visible"); document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); }, ms);
}, HIDDEN_MS);
const LATENCY = Number(process.env.LATENCY ?? 0);
if (LATENCY > 0) { await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: LATENCY, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }); }
let bad = 0, total = 0;
await page.setRequestInterception(true);
page.on("request", (r) => {
  if (prefix && r.method() === "GET" && r.url().startsWith(API + prefix)) { hits++; log.push(Date.now()); return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on our side." } }) }); }
  r.continue();
});
await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 }); await sleep(3000);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60000 }); await sleep(3000);
const st = () => page.evaluate(() => ({ alert: /couldn't load this page/i.test([...document.querySelectorAll("main [role=alert]")].map((x) => x.innerText).join(" ")), busy: !!document.querySelector("main [aria-busy=true]"), main: (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").slice(60, 200) }));
for (const [route, p] of [["/dashboard/leave", "/v1/leave"], ["/dashboard/contracts", "/v1/contracts"], ["/dashboard/projects", "/v1/projects"], ["/dashboard/reports", "/v1/reports"], ["/dashboard/bank-reconciliation", "/v1/bank-accounts"]]) {
  for (let n = 1; n <= REPEAT; n++) {
    prefix = p; hits = 0; log = []; const t0 = Date.now();
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    let s, took = null;
    for (let i = 0; i < 90; i++) { await sleep(500); s = await st(); if (s.alert) { took = Date.now() - t0; break; } }
    console.log(`${route} #${n}: ${s.alert ? "panel after " + took + " ms" : "NO PANEL after 45 s; busy=" + s.busy + " text=" + s.main}; blocked requests=${hits}`);
    total++; if (!s.alert) bad++;
    prefix = null; await sleep(1500);
  }
}
console.log(`SUMMARY ${total - bad}/${total} showed the panel (cpu throttle x${THROTTLE}, latency ${LATENCY} ms, hidden ${HIDDEN_MS} ms)`);
await browser.close();
