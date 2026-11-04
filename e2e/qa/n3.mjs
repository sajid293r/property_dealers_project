import puppeteer from "puppeteer-core";
const BASE = "http://localhost:3111", API = "http://localhost:4100";
const SH = new URL("../shots/qa", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
let mode = "ok"; let hits = 0;
await page.setRequestInterception(true);
page.on("request", (r) => { if (r.url().startsWith(API + "/v1/properties") && r.method() === "GET" && mode !== "ok") { hits++; if (mode === "500") return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on our side." } }) }); if (mode === "403") return r.respond({ status: 403, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "not_permitted", message: "Your role does not allow this (inventory.view)." } }) }); if (mode === "slow") return setTimeout(() => r.continue(), 8000); } r.continue(); });
await page.goto(BASE + "/login", { waitUntil: "networkidle2" }); await page.type("#email", "owner@bytecraft.local"); await page.type("#password", "sandbox-pass"); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }); await sleep(2500);
const main = () => page.evaluate(() => (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").slice(0, 300));
for (const m of ["500", "403", "slow"]) {
  mode = m; hits = 0; await page.goto(BASE + "/dashboard/properties", { waitUntil: "domcontentloaded" });
  for (const wait of [3, 12, 25]) { await sleep((wait - (wait === 3 ? 0 : wait === 12 ? 3 : 12)) * 1000); const t = await main(); console.log(`${m} @${wait}s (requests ${hits}) → ${t}`); if (wait === 25) await page.screenshot({ path: `${SH}/n3-${m}-25s.png` }); }
}
await browser.close();
