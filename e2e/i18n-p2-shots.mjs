// Phase 2 screens in several languages, light and dark (sandbox, signed in). The owner's saved language is set through
// the picker and put back to English at the end.
//   LANGS=ur,ar,de node i18n-p2-shots.mjs      (website on :3000 against the sandbox, run after the other e2e scripts)
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const LANGS = (process.env.LANGS ?? "ur,ar,de").split(",");
const OUT = new URL("./shots/i18n", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });
const NATIVE = { en: "English", ur: "اردو", ps: "پښتو", zh: "中文", fr: "Français", de: "Deutsch", ja: "日本語", ar: "العربية" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
page.on("console", (m) => { if (/hydrat|did not match|missing key/i.test(m.text())) problems.push(m.text().slice(0, 200)); });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type("#email", "owner@bytecraft.local");
await page.type("#password", "sandbox-pass");
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
await sleep(2000);

async function pick(lang) {
  const globe = await page.evaluateHandle(() => [...document.querySelectorAll("header button")].find((b) => b.querySelector("svg.lucide-globe")));
  await globe.asElement()?.click();
  await sleep(600);
  await page.evaluate((n) => [...document.querySelectorAll("[role=menuitem]")].find((e) => e.textContent.includes(n))?.click(), NATIVE[lang]);
  await sleep(1800);
}
async function theme(t) {
  await page.evaluate((t) => { localStorage.setItem("theme", t); document.documentElement.classList.toggle("dark", t === "dark"); }, t);
  await sleep(300);
}
async function go(path, name, lang, t, extra) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
  await sleep(1800);
  await theme(t);
  if (extra) await extra();
  await page.screenshot({ path: `${OUT}/p2-${name}-${lang}-${t}.png` });
}
const firstHref = (prefix) => page.evaluate((p) => [...document.querySelectorAll(`a[href^="${p}"]`)].map((a) => a.getAttribute("href")).find((h) => /\/[0-9a-f-]{36}$/.test(h)), prefix);

for (const lang of LANGS) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
  await sleep(1200);
  await pick(lang);
  for (const t of ["light", "dark"]) {
    await go("/dashboard/projects", "projects", lang, t);
    const proj = await firstHref("/dashboard/projects/");
    if (proj) await go(proj, "project-detail", lang, t);
    await go("/dashboard/properties", "properties", lang, t);
    await page.goto(`${BASE}/dashboard/properties`, { waitUntil: "networkidle2" });
    await sleep(1500);
    const prop = await firstHref("/dashboard/properties/");
    if (prop) await go(prop, "property-detail", lang, t);
    await go("/dashboard/customers", "customers", lang, t);
    await go("/dashboard/deals", "deals", lang, t);
    await page.goto(`${BASE}/dashboard/deals`, { waitUntil: "networkidle2" });
    await sleep(1500);
    await page.evaluate(() => document.querySelector("tbody tr")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await sleep(2500);
    if (/\/dashboard\/deals\/[0-9a-f-]{36}/.test(page.url())) {
      await theme(t);
      await page.screenshot({ path: `${OUT}/p2-booking-detail-${lang}-${t}.png` });
    }
    await go("/dashboard/deals", "receive-dialog", lang, t, async () => {
      await page.evaluate(() => [...document.querySelectorAll("main button")].find((b) => b.querySelector("svg.lucide-hand-coins"))?.click());
      await sleep(1200);
    });
    await page.keyboard.press("Escape");
  }
}
await pick("en");
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + [...new Set(problems)].join("\n") : "no hydration warnings or missing keys");
