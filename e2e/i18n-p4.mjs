// Phase 4 checks: printed documents, amount in words (Urdu), page titles, the 404 page, in the languages given.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("./shots/i18n", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });
const NATIVE = { en: "English", ur: "اردو", de: "Deutsch", ar: "العربية" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok) => { results.push(ok); console.log(`  ${ok ? "PASS" : "FAIL"} ${name}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 1300 });
const problems = [];
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => { if (/hydrat|did not match|missing key/i.test(m.text())) problems.push(m.text().slice(0, 160)); });
await page.evaluateOnNewDocument(() => { window.print = () => {}; });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type("#email", "owner@bytecraft.local"); await page.type("#password", "sandbox-pass");
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
await sleep(2000);
async function pick(lang) {
  const globe = await page.evaluateHandle(() => [...document.querySelectorAll("header button")].find((b) => b.querySelector("svg.lucide-globe")));
  await globe.asElement()?.click(); await sleep(600);
  await page.evaluate((n) => [...document.querySelectorAll("[role=menuitem]")].find((e) => e.textContent.includes(n))?.click(), NATIVE[lang]);
  await sleep(1800);
}
const href = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" }); await sleep(1500); await page.evaluate(() => document.querySelector("tbody tr")?.dispatchEvent(new MouseEvent("click", { bubbles: true }))); await sleep(2000); return page.url(); };
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" }); await sleep(1200);
const booking = (await href("/dashboard/deals")).split("/").pop();
const voucher = (await href("/dashboard/vouchers")).split("/").pop();
for (const lang of (process.env.LANGS ?? "ur,de").split(",")) {
  console.log(`== ${lang}`);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" }); await sleep(1000); await pick(lang);
  if (booking) { await page.goto(`${BASE}/print/booking/${booking}`, { waitUntil: "networkidle2" }); await sleep(2500); await page.screenshot({ path: `${OUT}/p4-print-booking-${lang}.png` }); }
  if (voucher) {
    await page.goto(`${BASE}/print/voucher/${voucher}`, { waitUntil: "networkidle2" }); await sleep(2500);
    const text = await page.evaluate(() => document.body.innerText);
    await page.screenshot({ path: `${OUT}/p4-print-voucher-${lang}.png` });
    if (lang === "ur") check("voucher amount is written in Urdu words", /روپے/.test(text) && /صرف/.test(text) && !/Rupees/.test(text));
    if (lang === "de") check("voucher says Beleg-style German labels, not English 'Prepared by'", !/Prepared by/.test(text) && /Erstellt von/.test(text));
  }
  await page.goto(`${BASE}/dashboard/vouchers`, { waitUntil: "networkidle2" }); await sleep(1500);
  const title = await page.title();
  check(`tab title is the page name in ${lang}`, lang === "ur" ? /واؤچرز/.test(title) : /Belege/.test(title));
  await page.goto(`${BASE}/dashboard/no-such-page`, { waitUntil: "networkidle2" }); await sleep(1000);
  const nf = await page.evaluate(() => document.body.innerText);
  check(`404 page is translated in ${lang}`, lang === "ur" ? /صفحہ نہیں ملا/.test(nf) : /Seite nicht gefunden/.test(nf));
}
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" }); await pick("en");
check("no hydration warnings or missing keys", problems.length === 0);
if (problems.length) console.log(problems.join("\n"));
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
