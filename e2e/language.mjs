// Language end-to-end check against the SANDBOX (see run.mjs for how to start it). Run it AFTER the other scripts:
// it changes the owner's language and the company default, and puts both back to English at the end.
//
//   switch to Urdu -> html[dir=rtl][lang=ur], sidebar on the right
//   -> still Urdu after a reload, and on a fresh browser profile after signing in again (it is saved on the account)
//   -> the company default (Arabic) applies to a person with no choice of their own
//   -> switching back to English restores left-to-right and the sidebar on the left
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? new URL("./shots", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok, extra }); console.log(ok ? "  PASS" : "  FAIL", name, ok ? "" : extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--window-size=1440,1000"],
  defaultViewport: { width: 1440, height: 1000 },
});
const errors = [];
function watch(page) {
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (/hydrat|did not match|missing key/i.test(t)) errors.push("console: " + t.slice(0, 200));
  });
}
const docInfo = (page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, cookie: document.cookie }));
async function waitDoc(page, lang, dir, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const d = await docInfo(page);
    if (d.lang === lang && d.dir === dir) return true;
    await sleep(250);
  }
  return false;
}
async function clickText(page, t, sel = "button, a, [role=menuitem], [role=option], [role=combobox], [role=radio]") {
  return page.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().replace(/\s+/g, " ").includes(t) && e.offsetParent !== null);
    if (!el) return false;
    el.click();
    return true;
  }, t, sel);
}
async function typeInto(page, selector, value) {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}
async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await typeInto(page, "#email", "owner@bytecraft.local");
  await typeInto(page, "#password", "sandbox-pass");
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
  await sleep(2000);
}
const sidebarSide = (page) => page.evaluate(() => {
  const el = document.querySelector("[data-sidebar=sidebar]");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.left + r.width / 2 > window.innerWidth / 2 ? "right" : "left";
});
async function openLanguageMenu(page) {
  // the top bar's globe button; a Radix menu opens on a real pointer press, so click it with the mouse
  const handle = await page.evaluateHandle(() => [...document.querySelectorAll("header button")].find((b) => b.querySelector("svg.lucide-globe")));
  await handle.asElement()?.click();
  await sleep(600);
}
async function pick(page, native) {
  await openLanguageMenu(page);
  const ok = await clickText(page, native, "[role=menuitem]");
  await sleep(1500);
  return ok;
}

// ───────────────────────── 1. English by default, sign in
const ctx1 = await browser.createBrowserContext();
const page = await ctx1.newPage();
watch(page);
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await signIn(page);
let d = await docInfo(page);
check("starts in English, left to right", d.lang === "en" && d.dir === "ltr", JSON.stringify(d));
check("sidebar is on the left in English", (await sidebarSide(page)) === "left");

// ───────────────────────── 2. switch to Urdu
check("language menu offers Urdu", await (async () => { await openLanguageMenu(page); const has = await page.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].some((e) => e.textContent.includes("اردو"))); await page.keyboard.press("Escape"); await sleep(300); return has; })());
check("picked Urdu", await pick(page, "اردو"));
check("html is rtl and lang=ur", await waitDoc(page, "ur", "rtl"), JSON.stringify(await docInfo(page)));
check("sidebar moved to the right", (await sidebarSide(page)) === "right");
check("the cookie remembers it", (await docInfo(page)).cookie.includes("propiq-lang=ur"));
const body = await page.evaluate(() => document.body.innerText);
check("the page text is Urdu (dashboard menu)", body.includes("ڈیش بورڈ"));
await page.screenshot({ path: `${SHOTS}/lang-ur-live.png` });

// ───────────────────────── 3. saved on the account
await page.reload({ waitUntil: "networkidle2" });
check("still Urdu after a reload", await waitDoc(page, "ur", "rtl"));
await ctx1.close();

const ctx2 = await browser.createBrowserContext(); // a fresh profile: no cookie, no storage
const page2 = await ctx2.newPage();
watch(page2);
await page2.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
d = await docInfo(page2);
check("a fresh browser profile starts in English", d.lang === "en", JSON.stringify(d));
await signIn(page2);
check("after signing in on a fresh profile the account's Urdu comes back", await waitDoc(page2, "ur", "rtl", 20000), JSON.stringify(await docInfo(page2)));

// ───────────────────────── 4. company default applies to someone with no choice of their own
await page2.goto(`${BASE}/dashboard/administration/company-profile`, { waitUntil: "networkidle2" });
await sleep(1500);
await page2.evaluate(() => { const c = [...document.querySelectorAll("[role=combobox]")].pop(); c?.click(); });
await sleep(500);
check("company default set to Arabic", await clickText(page2, "العربية", "[role=option]"));
await sleep(1500);
await page2.goto(`${BASE}/dashboard/account`, { waitUntil: "networkidle2" });
await sleep(1500);
check("My account offers 'use my company's default' (Urdu text)", await clickText(page2, "ڈیفالٹ زبان استعمال کریں", "button"));
await sleep(2000);
check("the person's own choice is cleared and Arabic (the company default) applies", await waitDoc(page2, "ar", "rtl", 15000), JSON.stringify(await docInfo(page2)));

const ctx3 = await browser.createBrowserContext();
const page3 = await ctx3.newPage();
watch(page3);
await page3.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await signIn(page3);
check("a new browser for that person (no personal choice) opens in the company default, Arabic", await waitDoc(page3, "ar", "rtl", 20000), JSON.stringify(await docInfo(page3)));

// ───────────────────────── 5. back to English
check("picked English", await pick(page3, "English"));
check("English restores left to right", await waitDoc(page3, "en", "ltr"));
check("sidebar is back on the left", (await sidebarSide(page3)) === "left");

// tidy up: company default back to English (the person's own choice is already English)
await page3.goto(`${BASE}/dashboard/administration/company-profile`, { waitUntil: "networkidle2" });
await sleep(1500);
await page3.evaluate(() => { const c = [...document.querySelectorAll("[role=combobox]")].pop(); c?.click(); });
await sleep(500);
await clickText(page3, "English", "[role=option]");
await sleep(1000);
await ctx2.close();
await ctx3.close();
await browser.close();

check("no hydration warnings or missing keys in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
