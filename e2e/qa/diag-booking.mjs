import puppeteer from "puppeteer-core";
const BASE = process.env.BASE; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60000 }); await sleep(2000);
const tok = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const co = (await (await fetch(BASE + "/api/v1/me", { headers: { authorization: "Bearer " + tok } })).json()).companies[0].companyId;
const bl = await (await fetch(BASE + "/api/v1/bookings", { headers: { authorization: "Bearer " + tok, "x-company-id": co } })).json();
const b0 = (Array.isArray(bl) ? bl : bl.rows).find((b) => /QA-Smoke1/.test(b.customerName ?? "")) ?? (Array.isArray(bl) ? bl : bl.rows)[0];
const id = "/dashboard/deals/" + b0.id;
console.log("first booking link", id);
await page.goto(BASE + id, { waitUntil: "domcontentloaded" }); await sleep(6000);
console.log("tabs:", await page.evaluate(() => [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim())));
console.log("file inputs:", await page.evaluate(() => document.querySelectorAll("input[type=file]").length));
for (const tab of ["Receipts", "Documents", "Payment plan"]) {
  const h = await page.evaluateHandle((t) => [...document.querySelectorAll("[role=tab]")].find((e) => e.textContent.includes(t)) ?? null, tab);
  if (h.asElement()) { await h.asElement().click(); await sleep(1200); console.log(tab, "-> file inputs:", await page.evaluate(() => document.querySelectorAll("input[type=file]").length), "| Void buttons:", await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /void/i.test(b.textContent)).map((b) => b.textContent.trim() + (b.closest("table") ? "(table)" : ""))), "| print links:", await page.evaluate(() => document.querySelectorAll("a[href^='/print/']").length)); }
}
console.log("buttons containing Documents/Attach:", await page.evaluate(() => [...document.querySelectorAll("button,label")].filter((b) => /document|attach|upload/i.test(b.textContent)).map((b) => b.tagName + ":" + b.textContent.trim().slice(0, 30))));
await page.screenshot({ path: "e2e/shots/qa/diag-booking.png" });
await browser.close();
