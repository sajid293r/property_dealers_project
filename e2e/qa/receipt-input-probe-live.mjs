// QA probe (LIVE, saves nothing): does the Receive payment dialog keep what is typed right after it opens?
// Opens the dialog on the QA-SmokeL1 booking, types 15000 after a chosen delay, then samples the field. Always presses Cancel.
// env: QA_EMAIL, QA_PASSWORD, BASE
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, API = BASE + "/api";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) throw new Error("env");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await (await browser.createBrowserContext()).newPage();
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 150000 }); await page.waitForSelector("#email", { timeout: 150000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 150000 });
const tok = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const co = (await (await fetch(API + "/v1/me", { headers: { authorization: "Bearer " + tok } })).json()).companies[0].companyId;
const bl = await (await fetch(API + "/v1/bookings?limit=200", { headers: { authorization: "Bearer " + tok, "x-company-id": co } })).json();
const b = (Array.isArray(bl) ? bl : bl.rows).find((x) => /QA-SmokeL1 /.test(x.customerName ?? ""));
if (!b) throw new Error("L1 booking not found");
const amountValue = () => page.evaluate(() => { const i = [...document.querySelectorAll("[role=dialog] input")].find((x) => x.getAttribute("inputmode") === "decimal" || x.placeholder === "0.00"); return i ? i.value : null; });
const results = [];
for (const delay of [0, 0, 100, 100, 300, 300, 600, 1000]) {
  await page.goto(`${BASE}/dashboard/deals/${b.id}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  for (let i = 0; i < 120; i++) { if ((await page.evaluate(() => document.body.innerText)).includes("Receive payment")) break; await sleep(500); }
  await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Receive payment"))?.click());
  // as soon as the dialog's input exists
  let inp = null; for (let i = 0; i < 100 && !inp; i++) { inp = await page.$("[role=dialog] input[inputmode='decimal'], [role=dialog] input[placeholder='0.00']"); if (!inp) await sleep(30); }
  await sleep(delay);
  await inp.type("15000");
  const v0 = await amountValue(); await sleep(1000); const v1 = await amountValue(); await sleep(3000); const v2 = await amountValue();
  const save = await page.evaluate(() => { const x = [...document.querySelectorAll("[role=dialog] button")].find((y) => y.textContent.includes("Save receipt")); return x ? (x.disabled ? "disabled" : "enabled") : "none"; });
  results.push({ delay, v0, v1, v2, save });
  console.log(`typed after ${delay} ms: right away=${JSON.stringify(v0)}  +1 s=${JSON.stringify(v1)}  +4 s=${JSON.stringify(v2)}  Save=${save}`);
  await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((y) => y.textContent.trim() === "Cancel")?.click());
  await sleep(500);
}
const lost = results.filter((r) => r.v0 && !r.v2);
console.log(`SUMMARY: typed amount lost in ${lost.length} of ${results.length} tries`);
await browser.close();
