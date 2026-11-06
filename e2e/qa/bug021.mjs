// BUG-021 repro / regression (sandbox or any site you sign in to): the amount typed in "Receive payment" must survive when the dialog is
// opened right after the payment plan was saved. For each delay D: new booking -> Set payment plan -> Create plan -> wait D ms -> Receive payment
// -> type 15000 -> check the field right away, after 1 s and after 4 s. env: BASE, API, QA_EMAIL, QA_PASSWORD, DELAYS (comma list, ms), REPEAT
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, API = process.env.API ?? BASE + "/api";
const DELAYS = (process.env.DELAYS ?? "0,200,500,1000,1500,2000").split(",").map(Number), REPEAT = Number(process.env.REPEAT ?? 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) throw new Error("env");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 150000 }); await page.waitForSelector("#email", { timeout: 150000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 150000 });
const tok = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const co = (await (await fetch(API + "/v1/me", { headers: { authorization: "Bearer " + tok } })).json()).companies[0].companyId;
const api = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { authorization: "Bearer " + tok, "x-company-id": co, ...(b ? { "content-type": "application/json" } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch { /* none */ } return j; };
const rows = (x) => (Array.isArray(x) ? x : x?.rows ?? []);
const typeId = rows(await api("GET", "/v1/property-types")).find((x) => /plot/i.test(x.name)).id;
const stamp = Date.now();
const cust = await api("POST", "/v1/parties", { name: `QA-B21 ${stamp}`, roles: ["customer"] });
// only the dialog titled "Receive payment" counts (the plan dialog can still be fading out when the receipt dialog opens)
const rcptInput = () => page.evaluateHandle(() => { const d = [...document.querySelectorAll("[role=dialog]")].find((x) => x.textContent.includes("Receive payment") && x.querySelector("input[inputmode=decimal]")); return d ? d.querySelector("input[inputmode=decimal]") : null; });
const value = () => page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].find((x) => x.textContent.includes("Receive payment")); const i = d?.querySelector("input[inputmode=decimal]"); return i ? i.value : null; });
const clickBtn = (t) => page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(t) && x.offsetParent !== null && !x.disabled); if (b) { b.click(); return true; } return false; }, t);
let lost = 0, total = 0;
for (let n = 0; n < REPEAT; n++) for (const d of DELAYS) {
  const prop = await api("POST", "/v1/properties", { title: `QA-B21 plot ${stamp}-${n}-${d}`, typeId, listPrice: "200000" });
  const bk = await api("POST", "/v1/bookings", { propertyId: prop.id, customerId: cust.id, paymentType: "installment" });
  await page.goto(`${BASE}/dashboard/deals/${bk.id}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  for (let i = 0; i < 120; i++) { if (await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Set payment plan")))) break; await sleep(500); }
  await sleep(1500);
  await clickBtn("Set payment plan"); await sleep(900);
  const inp = await page.$$("[role=dialog] input[inputmode='decimal'], [role=dialog] input[placeholder='0.00']"); await inp[0].type("40000");
  await page.type("[role=dialog] input[type=date]", "01012027"); await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.includes("Create plan"))?.click());
  await sleep(d);
  // open Receive payment as soon as the button is usable
  let opened = false; for (let i = 0; i < 100 && !opened; i++) { opened = await clickBtn("Receive payment"); if (!opened) await sleep(50); }
  let field = null; for (let i = 0; i < 200 && !field; i++) { const h = await rcptInput(); field = h.asElement(); if (!field) await sleep(25); }
  if (!field) { console.log(`delay ${d} ms: no receive dialog`); continue; }
  await field.click(); // a person clicks the field, then types
  await page.keyboard.type("15000");
  const v0 = await value(); await sleep(1000); const v1 = await value(); await sleep(3000); const v2 = await value();
  total++; const bad = !v2; if (bad) lost++;
  console.log(`${bad ? "LOST " : "ok   "} plan saved -> ${d} ms -> dialog -> typed: right away=${JSON.stringify(v0)} +1 s=${JSON.stringify(v1)} +4 s=${JSON.stringify(v2)}`);
  await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((y) => y.textContent.trim() === "Cancel")?.click());
  await sleep(600);
}
console.log(`SUMMARY: amount lost in ${lost} of ${total} tries`);
await browser.close();
