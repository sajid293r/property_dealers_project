// Browser check of printing, exports, documents, property details, collections, activity log and the account page.
// Order on a fresh sandbox:  run.mjs → finance.mjs → sales.mjs → modules.mjs → features.mjs.  Screenshots: e2e/shots/x-*.png.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? new URL("./shots", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok, extra }); console.log(ok ? "  PASS" : "  FAIL", name, ok ? "" : extra); };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--window-size=1440,1000"],
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("status of 4")) errors.push("console: " + m.text()); });
const shot = (n) => page.screenshot({ path: `${SHOTS}/x-${n}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitText(t, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if ((await text()).includes(t)) return true; await sleep(250); }
  return false;
}
async function clickText(t, sel = "button, a, [role=menuitem], [role=option], [role=combobox]") {
  return page.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().replace(/\s+/g, " ").includes(t) && e.offsetParent !== null);
    if (!el) return false; el.click(); return true;
  }, t, sel);
}
async function realClick(t, sel = "[role=tab]") {
  const h = await page.evaluateHandle((t, sel) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null) ?? null, t, sel);
  const el = h.asElement();
  if (!el) return false;
  await el.click();
  return true;
}
async function typeInto(selector, value) {
  await page.click(selector);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}
const go = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" }); await sleep(900); };

await go("/login");
await page.evaluate(() => localStorage.clear());
await go("/login");
check("login offers 'Forgot your password?'", (await text()).includes("Forgot your password?"));
await typeInto("#email", "owner@bytecraft.local");
await typeInto("#password", "sandbox-pass");
await clickText("Sign in", "button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
check("signed in", await waitText("ByteCraft", 20000));

// ── my account
await go("/dashboard/account");
await waitText("Change password", 10000);
check("my account shows the person's email", (await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value).join("|"))).includes("owner@bytecraft.local"));
await shot("1-account");

// ── activity log
await go("/dashboard/administration/activity");
check("activity log lists changes with who made them", (await waitText("Booking", 15000)) && (await text()).includes("by "));
await shot("2-activity");

// ── collections tab
await go("/dashboard/deals");
await waitText("BOOKING-", 10000);
await realClick("Collections");
check("collections tab opens with the reminder tools", await waitText("Message in", 10000));
await realClick("Commissions");
check("commissions tab opens", await waitText("Pay the dealer", 3000) || await waitText("No commission yet", 8000));

// ── printing: open the receipt document from the receipts tab
await realClick("Receipts");
await sleep(800);
const href = await page.evaluate(() => [...document.querySelectorAll("a[href^='/print/receipt/']")].map((a) => a.getAttribute("href"))[0] ?? null);
check("each receipt has a Print link", !!href, String(href));
if (href) {
  const doc = await browser.newPage();
  await doc.setViewport({ width: 1100, height: 1300 });
  await doc.goto(`${BASE}${href}`, { waitUntil: "networkidle2" });
  await sleep(2500);
  const t = await doc.evaluate(() => document.body.innerText);
  check("the printed receipt carries the company, number, amount and words", t.includes("ByteCraft") && /RCT-\d+/.test(t) && /Lakh|Thousand|Rupees/i.test(t) && t.includes("Print / Save as PDF"), t.slice(0, 200));
  await doc.screenshot({ path: `${SHOTS}/x-3-receipt-print.png` });
  await doc.close();
}

// ── export: a CSV is produced (captured from the browser, so no download settings are involved)
fs.mkdirSync(`${SHOTS}/dl`, { recursive: true });
await go("/dashboard/customers");
await waitText("Bilal Hussain", 15000);
await page.evaluate(() => {
  window.__csv = null;
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { void blob.text().then((t) => { window.__csv = t; }); return orig(blob); };
});
await clickText("Export", "button");
await sleep(1200);
const csv = await page.evaluate(() => window.__csv);
check("Export produces a CSV with a header row and the customers", !!csv && csv.includes("Name,Roles") && csv.includes("Bilal Hussain"), String(csv).slice(0, 120));

// ── property detail: legal details and a document
await go("/dashboard/properties");
await waitText("Plot 12", 15000);
const propHref = await page.evaluate(() => [...document.querySelectorAll("a[href^='/dashboard/properties/']")].map((a) => a.getAttribute("href"))[0] ?? null);
check("a property title links to its detail page", !!propHref, String(propHref));
if (propHref) {
  await go(propHref);
  check("property detail shows legal, ownership and documents sections", (await waitText("Legal & title", 20000)) && (await text()).includes("Chain of ownership") && (await text()).includes("Documents"));
  await clickText("Edit", "button"); await sleep(600);
  await page.type("[role=dialog] input", "REG-778");
  await clickText("Save", "[role=dialog] button");
  check("legal details are saved", await waitText("REG-778", 15000));
  await shot("4-property");
  const fileInput = await page.$("input[type=file]");
  fs.writeFileSync(`${SHOTS}/dl/registry-copy.txt`, "Registry copy for the e2e test\n");
  await fileInput.uploadFile(`${SHOTS}/dl/registry-copy.txt`);
  check("a document is uploaded and listed", await waitText("registry-copy.txt", 15000));
  await shot("5-property-documents");
}

// ── booking page: extras
await go("/dashboard/deals");
await waitText("BOOKING-", 15000);
await clickText("BOOKING-00001", "tr");
check("booking page offers transfer, documents and printing", (await waitText("Transfer to another customer", 20000)) && (await text()).includes("Documents") && (await text()).includes("Print plan"));
await shot("6-booking-extras");

check("no JavaScript errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
