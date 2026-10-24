// Browser check of the Professional / Advanced screens and administration against the SANDBOX (premium plan).
// Order on a fresh sandbox:  run.mjs → finance.mjs → sales.mjs → modules.mjs.  Screenshots: e2e/shots/m-*.png.
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? new URL("./shots", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok: !!ok, extra }); console.log(ok ? "  PASS" : "  FAIL", name, ok ? "" : extra); };
const stamp = String(Date.now()).slice(-5);

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
const shot = (n) => page.screenshot({ path: `${SHOTS}/m-${n}.png` });
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
const noNotice = async () => !(await text()).includes("isn't connected");

await go("/login");
await page.evaluate(() => localStorage.clear());
await go("/login");
await typeInto("#email", "owner@bytecraft.local");
await typeInto("#password", "sandbox-pass");
await clickText("Sign in", "button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
check("signed in", await waitText("ByteCraft", 20000));

const links = await page.$$eval("[data-sidebar=menu] a", (as) => as.map((a) => a.textContent.trim()));
check("an Advanced company's menu lists every connected page", ["Leads (CRM)", "Quotations", "Post-Dated Cheques", "Service Invoices", "Contracts", "Contractors", "Budgets", "Staff", "Payroll", "Leave"].every((l) => links.includes(l)) && (await text()).includes("Administration"), links.join(", "));

// ── CRM: a lead, its history, then a customer
await go("/dashboard/crm");
check("leads: connected (no preview notice)", await noNotice());
await clickText("New lead", "button"); await sleep(600);
await page.type("input[placeholder='Ahmed Khan']", `Farhan Lead ${stamp}`);
await page.type("input[placeholder='0300-1234567']", "0333-4445566");
await clickText("Add lead", "[role=dialog] button");
check("lead saved with a number", await waitText("LEAD-", 15000));
await sleep(700);
await shot("1-lead-sheet");
await page.type("[role=dialog] textarea", "Wants a 5 marla corner plot");
await clickText("Save", "[role=dialog] button");
check("a logged call appears in the lead's history", await waitText("Wants a 5 marla corner plot", 10000));
await clickText("Make a customer", "[role=dialog] button");
check("the lead becomes a customer", await waitText("now a customer", 10000));
await shot("2-lead-customer");
await page.keyboard.press("Escape"); await sleep(400);

// ── quotations, cheques: the screens open on real data
await go("/dashboard/quotations");
check("quotations: connected", (await noNotice()) && (await waitText("New quotation", 8000)));
await shot("3-quotations");
await go("/dashboard/cheques");
check("cheques: connected", (await noNotice()) && (await waitText("Add cheque", 8000)));

// ── service invoice for a customer
await go("/dashboard/service-invoices");
check("service invoices: connected", (await noNotice()) && (await waitText("New invoice", 8000)));
await clickText("New invoice", "button"); await sleep(600);
await clickText("Choose a customer", "[role=combobox]"); await sleep(400);
await clickText("Bilal Hussain", "[role=option]"); await sleep(300);
await page.type("input[placeholder='October 2026']", "October 2026");
const amt = await page.$$("[role=dialog] input[placeholder='0.00']");
await amt[0].type("12000");
await clickText("Issue invoice", "[role=dialog] button");
check("service invoice issued", await waitText("SINV-", 15000));
await sleep(600);
await shot("4-service-invoice");

// ── contract
await go("/dashboard/contracts");
await clickText("New contract", "button"); await sleep(600);
await page.type("input[placeholder^='Shop 4']", `Office rent ${stamp}`);
await clickText("Save contract", "[role=dialog] button");
check("contract saved", await waitText(`Office rent ${stamp}`, 15000));

// ── staff, leave, payroll
await go("/dashboard/staff");
await clickText("Add employee", "button"); await sleep(600);
const dlgInputs = await page.$$("[role=dialog] input");
await dlgInputs[0].type(`Imran Staff ${stamp}`);
const money = await page.$$("[role=dialog] input[placeholder='0.00']");
await money[0].type("80000");
await clickText("Add employee", "[role=dialog] button");
check("employee added", await waitText(`Imran Staff ${stamp}`, 15000));
await sleep(500);
await shot("5-staff");

await go("/dashboard/leave");
check("leave: connected", (await noNotice()) && (await waitText("Record leave", 8000)));
await go("/dashboard/payroll");
await clickText("Run payroll", "button"); await sleep(600);
await clickText("Create draft", "[role=dialog] button");
check("payroll draft lists the employee", await waitText(`Imran Staff ${stamp}`, 15000));
await sleep(500);
await shot("6-payroll-draft");
await clickText("Approve", "[role=dialog] button");
check("payroll approved and posted", await waitText("Pay salaries", 15000));
await clickText("Pay salaries", "[role=dialog] button"); await sleep(700);
await page.evaluate(() => { const b = [...document.querySelectorAll("[role=dialog] button")].filter((x) => x.textContent.trim() === "Pay"); b[b.length - 1]?.click(); });
await sleep(1200);
check("salaries paid", await waitText("Paid", 10000));
await shot("7-payroll-paid");

// ── contractor, agreement, bill
await go("/dashboard/contractors");
check("contractors: connected", (await noNotice()) && (await waitText("New agreement", 8000)));
await clickText("Add contractor", "button"); await sleep(600);
await page.type("input[placeholder='Ahmed Khan']", `Madina Builders ${stamp}`);
await clickText("Add", "[role=dialog] button");
await sleep(1500);
await clickText("New agreement", "button"); await sleep(700);
await clickText("Choose a contractor", "[role=combobox]"); await sleep(400);
await clickText(`Madina Builders ${stamp}`, "[role=option]"); await sleep(300);
await clickText("Choose a project", "[role=combobox]"); await sleep(400);
await clickText("Green Meadows", "[role=option]"); await sleep(300);
await page.type("input[placeholder^='Boundary wall']", `Boundary wall ${stamp}`);
const am = await page.$$("[role=dialog] input[placeholder='0.00']");
await am[0].type("2000000");
await clickText("Create agreement", "[role=dialog] button");
check("agreement created and opened", await waitText("Add a bill", 15000));
await sleep(600);
await shot("8-agreement");

// ── budget
await go("/dashboard/budgets");
await clickText("New budget", "button"); await sleep(700);
await clickText("Expense account", "[role=dialog] [role=combobox]"); await sleep(400);
await page.keyboard.type("Printing"); await sleep(300);
await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await sleep(300);
const bm = await page.$$("[role=dialog] input[placeholder='0.00']");
await bm[0].type("50000");
await shot("9-budget-dialog");
await clickText("Save as draft", "[role=dialog] button");
check("budget saved as a draft with a number", await waitText("BUD-", 15000));
await sleep(700);
await clickText("Send for approval", "[role=dialog] button");
check("budget can be sent for approval", await waitText("Waiting for approval", 10000));
await clickText("Approve", "[role=dialog] button");
check("budget approved", await waitText("Approved", 10000));
await shot("10-budget-approved");

// ── administration
await go("/dashboard/administration/users");
check("users: shows the signed-in owner and the plan", (await waitText("owner@bytecraft.local", 10000)) && (await text()).includes("Advanced"));
await clickText("Invite someone", "button"); await sleep(600);
await page.type("input[type=email]", `newhire${stamp}@bytecraft.local`);
await clickText("Choose a role", "[role=dialog] [role=combobox]"); await sleep(400);
await clickText("Sales Agent", "[role=option]"); await sleep(300);
await clickText("Send invitation", "[role=dialog] button");
check("invitation is listed as waiting", await waitText(`newhire${stamp}@bytecraft.local`, 10000) && (await text()).includes("Invited"));
await shot("11-users");
await go("/dashboard/administration/roles");
check("roles: standard roles and the permission grid", (await waitText("Sales Agent", 10000)) && (await text()).includes("Deals & Bookings"));
await shot("12-roles");
await go("/dashboard/administration/company-profile");
check("company profile loads with the plan and its features", (await waitText("Your plan: Advanced", 10000)));
await shot("13-profile");

// ── the dashboard still works
await go("/dashboard");
check("dashboard loads", await waitText("Cash & bank", 15000));

check("no JavaScript errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
