// Browser check of the live finance screens against the SANDBOX (see run.mjs for how to start it).
// Signs in, opens each finance page, adds a bank account, writes and approves a bank payment voucher,
// and opens reconciliation. Screenshots go to e2e/shots/f-*.png.
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
const shot = (n) => page.screenshot({ path: `${SHOTS}/f-${n}.png` });
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
async function typeInto(selector, value) {
  await page.click(selector);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}
const go = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" }); await sleep(800); };

// sign in
await go("/login");
await page.evaluate(() => localStorage.clear());
await go("/login");
await typeInto("#email", "owner@bytecraft.local");
await typeInto("#password", "sandbox-pass");
await clickText("Sign in", "button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
check("signed in", await waitText("ByteCraft", 20000));

// accounts: the standard chart is there
await go("/dashboard/accounts");
check("accounts: no 'not connected' notice", !(await text()).includes("isn't connected"));
await clickText("Chart of accounts", "[role=tab]");
check("accounts: standard chart of accounts listed", await waitText("Cash in Hand", 10000) || await waitText("Cash", 10000));
await shot("1-accounts-chart");

// add a bank account, picking the bank from the list
await clickText("Bank accounts", "[role=tab]");
await clickText("Add bank account", "button");
await sleep(700);
await clickText("Choose", "[role=dialog] [role=combobox]");
await sleep(400);
await page.keyboard.type("Meezan");
await sleep(400);
await shot("2-bank-picker");
check("bank picker lists Pakistani banks (Meezan)", (await text()).includes("Meezan"));
await clickText("Meezan Bank", "[role=option]");
await sleep(300);
const inputs = await page.$$("[role=dialog] input");
const placeholders = await page.$$eval("[role=dialog] input", (is) => is.map((i) => i.placeholder));
await shot("3-bank-dialog");
console.log("    dialog inputs:", placeholders.join(" | "));
check("bank account dialog has inputs", inputs.length >= 3);
await page.type("input[placeholder^='ByteCraft']", "ByteCraft Current A/C");
await page.type("input[placeholder='0123-4567890']", "0102030405");
await clickText("Add bank account", "[role=dialog] button");
check("bank account saved and listed", await waitText("0102030405", 15000));
await sleep(600);
check("bank account card shows Meezan Bank", (await text()).includes("Meezan"));
await shot("4-bank-card");

// a bank payment voucher
await go("/dashboard/vouchers/new?type=BPV");
await shot("5-bpv-form");
await clickText("Choose the bank account", "[role=combobox]"); await sleep(400);
await clickText("Meezan", "[role=option]"); await sleep(300);
await clickText("Cheque, transfer", "[role=combobox]"); await sleep(300);
await clickText("Cheque", "[role=option]"); await sleep(300);
await clickText("Choose an account", "[role=combobox]"); await sleep(400);
await page.keyboard.type("Rent"); await sleep(400);
await shot("6-account-search");
await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await sleep(300);
await page.type("input[placeholder='0.00']", "1250000.50");
await sleep(500);
const bt = await text();
check("whole amount is shown with thousands separators (1,250,000.50)", bt.includes("1,250,000.50"));
check("amount in words appears (Pakistani lakh system)", /Twelve Lakh/i.test(bt), bt.slice(0, 0));
await shot("7-bpv-filled");
await page.type("input[placeholder='000123']", "000457");
await page.type("textarea", "Office rent for October");
await clickText("Submit for approval", "button");
check("voucher submitted and detail opens", await waitText("Pending approval", 15000));
await sleep(600);
await shot("8-bpv-detail");
const dt = await text();
check("detail shows the bank and the amount", dt.includes("Meezan") && dt.includes("1,250,000.50"), dt.slice(0, 300));
await clickText("Approve", "button");
check("approved and posted to the books", await waitText("Posted to the books", 15000));
await sleep(500);
await shot("9-bpv-posted");

await go("/dashboard/vouchers");
check("voucher list shows the voucher", await waitText("BPV", 10000) && (await text()).includes("Approved"));
await shot("10-voucher-list");

await go("/dashboard/reports");
check("trial balance lists posted account", await waitText("Debits equal credits", 15000));
await shot("11-trial-balance");

await go("/dashboard/expenses");
check("expenses lists the approved payment by category", await waitText("Rent Expense", 15000) && (await text()).includes("1,250,000.50"));
await shot("11b-expenses");
await go("/dashboard");
check("dashboard shows real figures (cash & bank, needs attention)", await waitText("Cash & bank", 15000));
await shot("11c-dashboard");
await go("/dashboard/bank-reconciliation");
check("reconciliation page opens with the bank account", await waitText("Start a reconciliation", 15000));
await shot("12-reconcile-start");
await page.type("[role=tabpanel] input[inputmode='decimal'], [role=tabpanel] input[placeholder='0.00']", "-1250000.50");
await clickText("Start reconciling", "button");
check("reconciliation started: items to tick appear", await waitText("Tick what appears on the bank statement", 15000));
await sleep(500);
check("outstanding cheque listed before clearing", (await text()).includes("BPV-"));
await shot("13-reconcile-open");
const box = await page.$("[role=checkbox]");
if (box) await box.click();
await sleep(1500);
await shot("14-reconcile-ticked");
check("ticking the cheque balances the reconciliation", await waitText("Balanced", 10000));
await clickText("Finish", "button");
check("reconciliation can be finished", await waitText("Finished", 15000));
await shot("15-reconcile-done");

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
if (errors.length) console.log("browser errors:", errors.slice(0, 5));
process.exit(failed ? 1 : 0);
