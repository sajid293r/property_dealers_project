// Screenshots of the demo in each language, light and dark, desktop and phone width, plus a console check.
//   node i18n-shots.mjs            (expects the website on http://localhost:3111; screenshots go to e2e/shots/i18n)
// Demo mode only: no sign-in, nothing is saved anywhere.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const OUT = new URL("./shots/i18n", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });
const LANGS = (process.env.LANGS ?? "ur,ar,zh,de").split(",");
const PAGES = (process.env.PAGES ?? "dashboard,login").split(",");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox"],
});
const problems = [];
for (const lang of LANGS) {
  for (const theme of ["light", "dark"]) {
    for (const [w, h, tag] of [[1440, 1200, "wide"], [390, 900, "phone"]]) {
      if (tag === "phone" && theme === "dark" && lang !== "ur") continue;
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h });
      page.on("pageerror", (e) => problems.push(`${lang}/${theme}/${tag} pageerror: ${e.message}`));
      page.on("console", (m) => {
        const t = m.text();
        if (m.type() === "error" || /hydrat|did not match|missing key/i.test(t)) problems.push(`${lang}/${theme}/${tag} console: ${t.slice(0, 240)}`);
      });
      await page.setCookie({ name: "propiq-lang", value: lang, url: BASE });
      for (const p of PAGES) {
        await page.evaluateOnNewDocument((theme, demo) => {
          try { localStorage.setItem("theme", theme); if (demo) localStorage.setItem("propiq-demo", "1"); else localStorage.removeItem("propiq-demo"); } catch {}
        }, theme, p !== "login");
        await page.goto(`${BASE}/${p === "login" ? "login" : "dashboard"}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
        await sleep(2500);
        const info = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
        if (info.lang !== lang) problems.push(`${lang}: html lang is ${info.lang}`);
        await page.screenshot({ path: `${OUT}/${p}-${lang}-${theme}-${tag}.png`, fullPage: tag === "wide" && p === "dashboard" ? false : false });
      }
      await page.close();
    }
  }
}
await browser.close();
console.log(problems.length ? "PROBLEMS:\n" + [...new Set(problems)].join("\n") : "no console errors, hydration warnings or missing keys");
