// Click a sidebar link and capture right away: the page-shaped shimmer must be up before the page arrives.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3300";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
await sleep(1500);
const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 600, downloadThroughput: 500000, uploadThroughput: 500000 });
const t0 = Date.now();
await page.evaluate(() => [...document.querySelectorAll("a[href='/dashboard/budgets']")][0]?.click());
let seen = null;
for (let i = 0; i < 40; i++) {
  seen = await page.evaluate(() => ({ path: location.pathname, shimmer: !!document.querySelector("[aria-busy=true] .skeleton-shimmer") }));
  if (seen.shimmer) break;
  await sleep(25);
}
console.log("ms to shimmer:", Date.now() - t0, JSON.stringify(seen));
await page.screenshot({ path: new URL("./shots/i18n/nav-shimmer.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
await browser.close();
