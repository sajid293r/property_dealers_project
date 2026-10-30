// The report tabs (sandbox, signed in).  BASE=http://localhost:3200 node reports-shot.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("./shots/i18n", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const bad = [];
page.on("pageerror", (e) => bad.push(e.message));
page.on("response", (r) => { if (r.url().includes("/v1/reports") && r.status() >= 400) bad.push(r.status() + " " + r.url()); });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type("#email", "owner@bytecraft.local");
await page.type("#password", "sandbox-pass");
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
await sleep(2000);
await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle2" });
for (const tab of ["expense", "cash", "aging", "sales", "collections", "payables"]) {
  await page.evaluate((t) => document.querySelector(`[role=tab][id$="trigger-${t}"]`)?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })) , tab);
  await page.evaluate((t) => document.querySelector(`[role=tab][id$="trigger-${t}"]`)?.click(), tab);
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/report-${tab}.png` });
}
console.log(bad.length ? "PROBLEMS: " + [...new Set(bad)].join("\n") : "no errors");
await browser.close();
