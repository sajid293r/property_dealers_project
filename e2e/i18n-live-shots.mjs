// Signed-in screenshots in a chosen language (sandbox): a table page, a dialog, the phone menu.
//   LANG=ur node i18n-live-shots.mjs     (website on :3000 against the sandbox, see run.mjs)
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const LANG = process.env.LANG_CODE ?? "ur";
const OUT = new URL("./shots/i18n", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.setCookie({ name: "propiq-lang", value: LANG, url: BASE });
const errors = [];
page.on("console", (m) => { if (/hydrat|did not match|missing key/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type("#email", "owner@bytecraft.local");
await page.type("#password", "sandbox-pass");
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
await sleep(2500);
// choose the language through the picker (it is saved on the account, which wins over the cookie)
const NATIVE = { en: "English", ur: "اردو", ps: "پښتو", zh: "中文", fr: "Français", de: "Deutsch", ja: "日本語", ar: "العربية" };
const globe = await page.evaluateHandle(() => [...document.querySelectorAll("header button")].find((b) => b.querySelector("svg.lucide-globe")));
await globe.asElement()?.click();
await sleep(600);
await page.evaluate((n) => [...document.querySelectorAll("[role=menuitem]")].find((e) => e.textContent.includes(n))?.click(), NATIVE[LANG]);
await sleep(2000);
await page.screenshot({ path: `${OUT}/live-${LANG}-dashboard.png` });

await page.goto(`${BASE}/dashboard/projects`, { waitUntil: "networkidle2" });
await sleep(2000);
await page.screenshot({ path: `${OUT}/live-${LANG}-projects.png` });
// the first "new" button opens a dialog
await page.evaluate(() => [...document.querySelectorAll("main button")].find((b) => /New|نیا|جديد|新|Neu|Nouv/.test(b.textContent))?.click());
await sleep(1200);
await page.screenshot({ path: `${OUT}/live-${LANG}-dialog.png` });
await page.keyboard.press("Escape");

await page.goto(`${BASE}/dashboard/vouchers`, { waitUntil: "networkidle2" });
await sleep(2000);
await page.screenshot({ path: `${OUT}/live-${LANG}-vouchers.png` });

await page.setViewport({ width: 390, height: 860 });
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
await sleep(1500);
await page.evaluate(() => document.querySelector("[data-sidebar=trigger]")?.click());
await sleep(1200);
await page.screenshot({ path: `${OUT}/live-${LANG}-phone-menu.png` });
await browser.close();
console.log(errors.length ? "PROBLEMS: " + errors.join(" | ") : "no hydration warnings or missing keys");
