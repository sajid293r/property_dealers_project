// Puts the owner account's saved interface language back to English (QA side effect). env: QA_EMAIL, QA_PASSWORD, BASE
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 150000 }); await page.waitForSelector("#email", { timeout: 150000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 150000 });
const tok = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const r = await fetch(BASE + "/api/v1/me", { method: "PATCH", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify({ language: "en" }) });
const me = await (await fetch(BASE + "/api/v1/me", { headers: { authorization: "Bearer " + tok } })).json();
console.log("PATCH", r.status, "| saved language now:", (me.user?.preferredLanguage ?? me.user?.language));
await browser.close();
