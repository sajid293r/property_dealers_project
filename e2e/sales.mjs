// Browser check of the live sales flow against the SANDBOX: customer → booking → payment plan → receipt → void.
// Order on a fresh sandbox:  node run.mjs  →  node finance.mjs  →  node sales.mjs   (needs the property from run.mjs
// and a bank account from finance.mjs). Screenshots go to e2e/shots/s-*.png.
import puppeteer from "puppeteer-core";

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
const shot = (n) => page.screenshot({ path: `${SHOTS}/s-${n}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitText(t, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if ((await text()).includes(t)) return true; await sleep(250); }
  return false;
}
async function clickText(t, sel = "button, a, [role=menuitem], [role=option], [role=combobox], [role=tab]") {
  return page.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().replace(/\s+/g, " ").includes(t) && e.offsetParent !== null);
    if (!el) return false; el.click(); return true;
  }, t, sel);
}
// Radix tabs open on mouse-down, so they need a real mouse click rather than element.click()
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
const go = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" }); await sleep(800); };

await go("/login");
await page.evaluate(() => localStorage.clear());
await go("/login");
await typeInto("#email", "owner@bytecraft.local");
await typeInto("#password", "sandbox-pass");
await clickText("Sign in", "button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
check("signed in", await waitText("ByteCraft", 20000));

if (!process.env.SKIP_CREATE) {
// a customer
await go("/dashboard/customers");
check("customers: no 'not connected' notice", !(await text()).includes("isn't connected"));
await clickText("Add new", "button"); await sleep(600);
await page.type("input[placeholder='Ahmed Khan']", "Bilal Hussain");
await page.type("input[placeholder='0300-1234567']", "0321-5551234");
await clickText("Add", "[role=dialog] button");
check("customer saved and listed", await waitText("Bilal Hussain", 15000));

// a booking
await go("/dashboard/deals");
check("deals: no 'not connected' notice", !(await text()).includes("isn't connected"));
await shot("1-deals-empty");
await clickText("New booking", "button"); await sleep(700);
await clickText("Choose an available property", "[role=combobox]"); await sleep(400);
await clickText("PRP-", "[role=option]"); await sleep(300);
await clickText("Choose a customer", "[role=combobox]"); await sleep(400);
await clickText("Bilal Hussain", "[role=option]"); await sleep(300);
await shot("2-booking-dialog");
await clickText("Create booking", "[role=dialog] button");
check("booking created and its page opens", await waitText("Payment plan", 40000));
await sleep(600);
await shot("3-booking-detail");

// payment plan
await clickText("Set payment plan", "button"); await sleep(600);
const amountInputs = await page.$$("[role=dialog] input[inputmode='decimal'], [role=dialog] input[placeholder='0.00']");
await amountInputs[0].type("1000000");
await page.type("[role=dialog] input[type=date]", "12012026");
await sleep(400);
await shot("4-plan-dialog");
await clickText("Create plan", "[role=dialog] button");
check("payment plan created (down payment row)", await waitText("Down payment", 15000));
await sleep(500);
await shot("5-plan");

// receipt
await clickText("Receive payment", "button"); await sleep(700);
const amt = await page.$$("[role=dialog] input[inputmode='decimal'], [role=dialog] input[placeholder='0.00']");
await amt[0].type("1500000");
await sleep(400);
check("receipt dialog shows the amount in words", /Fifteen Lakh/i.test(await text()));
await shot("6-receipt-dialog");
await clickText("Save receipt", "[role=dialog] button");
check("receipt saved with a number", await waitText("RCT-00001", 15000));
await sleep(800);
const t = await text();
check("down payment is paid and the first installment is part paid", t.includes("Paid") && t.includes("Part paid"), t.slice(0, 0));
check("progress shows the money received", t.includes("1,500,000.00"));
await shot("7-after-receipt");

}

// the books agree: customer statement + trial balance
await go("/dashboard/reports");
await waitText("Debits equal credits", 15000);
await realClick("Customer / supplier statement"); await sleep(400);
await clickText("Choose a customer or supplier", "[role=combobox]"); await sleep(400);
await clickText("Bilal Hussain", "[role=option]"); await sleep(1500);
await shot("8-customer-statement");
check("customer statement shows the receipt", (await text()).includes("RCT-00001"));

// void
await go("/dashboard/deals");
await waitText("BOOKING-00001", 15000);
await realClick("Receipts");
await waitText("RCT-00001", 10000);
await clickText("Void", "table button"); await sleep(700);
await page.type("[role=dialog] textarea", "Entered twice by mistake");
await clickText("Void receipt", "[role=dialog] button");
check("receipt voided", await waitText("Void", 10000) && (await text()).includes("RCT-00001"));
await sleep(800);
await shot("9-receipts-voided");

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
if (errors.length) console.log("browser errors:", errors.slice(0, 5));
process.exit(failed ? 1 : 0);
