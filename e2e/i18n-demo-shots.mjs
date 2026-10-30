// Demo-mode (sample data) screens in several languages, light and dark. Website with NO NEXT_PUBLIC_* env vars.
//   BASE=http://localhost:3111 LANGS=ur,de node i18n-demo-shots.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const LANGS = (process.env.LANGS ?? "ur,de").split(",");
const OUT = new URL("./shots/i18n", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = ["crm", "quotations", "sales-invoices", "cheques", "contracts", "vouchers", "accounts", "expenses", "budgets", "reports", "staff", "payroll", "leave", "contractors", "companies", "administration/users", "administration/roles", "administration/company-profile"];

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (/hydrat|did not match|missing key/i.test(m.text())) problems.push(m.text().slice(0, 200)); });

let n = 0;
for (const lang of LANGS) {
  await page.setCookie({ name: "propiq-lang", value: lang, url: BASE });
  for (const p of PAGES) {
    for (const t of ["light", "dark"]) {
      if (t === "dark" && !["crm", "budgets", "payroll"].includes(p)) continue;
      await page.goto(`${BASE}/dashboard/${p}`, { waitUntil: "networkidle2" });
      await page.evaluate((t) => { try { localStorage.setItem("theme", t); } catch {} document.documentElement.classList.toggle("dark", t === "dark"); }, t);
      await sleep(1500);
      const file = `${OUT}/demo-${lang}-${p.replace(/\//g, "_")}-${t}.png`;
      await page.screenshot({ path: file });
      // visible leftover English: report text nodes made of plain English words when a non-English language is on
      n++;
    }
  }
}
console.log(`${n} screenshots in ${OUT}`);
console.log(problems.length ? "PROBLEMS:\n" + [...new Set(problems)].join("\n") : "no hydration / console problems");
await browser.close();
