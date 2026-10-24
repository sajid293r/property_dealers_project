// End-to-end check of the live app in a real browser: sign in, create a project and a property through the API,
// sign out, and the demo. Run it against the SANDBOX (no cloud needed):
//
//   1. cd api && npm run sandbox                      (database + API + sign-in stand-in, seeded with ByteCraft)
//   2. in the project root, start the website against it (the sandbox prints the exact command)
//   3. cd e2e && npm install && npm run test          (set CHROME_PATH if Chrome is not in the usual place)
//
// Start from a fresh sandbox: the run expects the first project to be PRJ-00001. Screenshots go to e2e/shots.
import puppeteer from "puppeteer-core";

const BASE = "http://localhost:3000";
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
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("status of 400")) errors.push("console: " + m.text()); });  // the 400 is the deliberate wrong-password try

const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const text = () => page.evaluate(() => document.body.innerText);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitText(t, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if ((await text()).includes(t)) return true; await sleep(250); }
  return false;
}
async function clickText(t, sel = "button, a, [role=menuitem], [role=option], [role=combobox]") {
  const ok = await page.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().replace(/\s+/g, " ").includes(t) && e.offsetParent !== null);
    if (!el) return false; el.click(); return true;
  }, t, sel);
  return ok;
}
async function typeInto(selector, value) {
  await page.click(selector);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}

// ───────────────────────── 0. signed out: the dashboard sends you to sign in
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
await sleep(1200);
check("signed out: /dashboard redirects to /login", page.url().endsWith("/login"), page.url());
await shot("01-login");
check("login page offers sign-in and the demo", (await text()).includes("Sign in") && (await text()).includes("Explore the demo"));

// ───────────────────────── 1. wrong password
await typeInto("#email", "owner@bytecraft.local");
await typeInto("#password", "not-the-password");
await clickText("Sign in", "button[type=submit]");
check("wrong password: plain-language error", await waitText("That email or password isn't right."));
await shot("02-login-error");

// ───────────────────────── 2. right password
await typeInto("#password", "sandbox-pass");
await clickText("Sign in", "button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
check("signed in: lands on the dashboard", page.url().includes("/dashboard"), page.url());
check("shows the real company (ByteCraft)", await waitText("ByteCraft", 20000));
await sleep(1500);
const t1 = await text();
check("topbar says Live (not Demo)", t1.includes("Live") && !t1.includes("Demo"));
check("no demo data leaks in: no 'Ahmed Khan', 'Al-Noor' or demo cash pill", !/Ahmed Khan|Al-Noor|Cash in hand/.test(t1));
check("empty company shows the getting-started guide, not zeros", t1.includes("Welcome to ByteCraft"));
await shot("03-dashboard-live");

// sidebar
const links = await page.$$eval("[data-sidebar=menu] a", (as) => as.map((a) => a.textContent.trim()));
check("sidebar lists the real pages of an Advanced company", links.length >= 20 && (await text()).includes("Administration") && !links.includes("Group Overview"), links.join(", "));
check("'Group Overview' (demo-only) is not offered to a real company", !links.includes("Group Overview"), links.join(", "));
await page.goto(`${BASE}/dashboard/companies`, { waitUntil: "networkidle2" });
check("typing the demo-only address shows a plain message, not demo data", await waitText("Group overview isn't available yet", 8000) && !(await text()).includes("Al-Noor"));
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
check("empty company shows the getting-started steps", await waitText("Create your first project", 8000));

// ───────────────────────── 3. projects: create one for real
await page.goto(`${BASE}/dashboard/projects`, { waitUntil: "networkidle2" });
check("projects page: no 'not connected' notice", !(await text()).includes("isn't connected"));
await clickText("New Project", "button");
await sleep(600);
await page.type("input[placeholder='Willow Park Residencia']", "Green Meadows");
await page.type("input[placeholder='Main GT Road, near...']", "Main GT Road, Sheikhupura");
await page.type("input[placeholder='1200']", "1200");
await page.type("input[placeholder='0']", "250000000");
await shot("04-new-project-form");
await clickText("Create Project", "[role=dialog] button");
check("project saved through the API and listed", await waitText("Green Meadows", 15000));
await sleep(800);
check("project shows a database-made code PRJ-00001", (await text()).includes("PRJ-00001"));
await shot("05-projects");

// ───────────────────────── 4. properties: add one
await page.goto(`${BASE}/dashboard/properties`, { waitUntil: "networkidle2" });
await waitText("Properties", 8000);
await clickText("Add Property", "button");
await sleep(700);
// project select
await clickText("Select project", "[role=combobox]"); await sleep(300);
await clickText("Green Meadows", "[role=option]"); await sleep(300);
await clickText("Select category", "[role=combobox]"); await sleep(300);
await clickText("Residential Plot", "[role=option]"); await sleep(300);
await page.type("input[placeholder='Corner plot, Block A']", "Plot 12, Block C");
await page.type("input[placeholder='A']", "C");
await page.type("input[placeholder='10']", "5");
await page.type("input[placeholder='15000000']", "4500000");
await shot("06-new-property-form");
await clickText("Add Property", "[role=dialog] button");
const added = await waitText("Plot 12, Block C", 15000);
check("property saved through the API and listed", added);
await sleep(800);
const t2 = await text();
check("property shows its database code PRP-00001", t2.includes("PRP-00001"));
check("property shows its size in marla and square feet (5 Marla, 1,361)", /5 Marla/.test(t2) && /1,361/.test(t2));
check("property shows its block and project", t2.includes("Block C") && t2.includes("Green Meadows"));
await shot("07-properties");

// the project card now counts the new property
await page.goto(`${BASE}/dashboard/projects`, { waitUntil: "networkidle2" });
await waitText("Green Meadows", 10000); await sleep(1200);
const pcard = await page.evaluate(() => document.body.innerText);
check("project card counts the new property (1 available)", pcard.replace(/\s+/g, " ").includes("1 Available"), pcard.replace(/\s+/g, " ").slice(0, 400));
await shot("07b-project-card");
await page.goto(`${BASE}/dashboard/properties`, { waitUntil: "networkidle2" });

// survives a reload (really stored, not just in the browser)
await page.reload({ waitUntil: "networkidle2" });
check("after a reload the property is still there (stored on the server)", await waitText("Plot 12, Block C", 15000));

// ───────────────────────── 5. a rule refusal shows a plain message inside the dialog
await clickText("Add Property", "button");
await sleep(700);
await clickText("Select project", "[role=combobox]"); await sleep(300);
await clickText("Green Meadows", "[role=option]"); await sleep(300);
await clickText("Select category", "[role=combobox]"); await sleep(300);
await clickText("Residential Plot", "[role=option]"); await sleep(300);
await page.type("input[placeholder='10']", "5");
await page.type("input[placeholder='15000000']", "100");
await page.evaluate(() => { const i = document.querySelector("input[placeholder='10']"); i.value = "5"; });
await page.keyboard.press("Escape");
await sleep(300);

// ───────────────────────── 6. sign out
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
await sleep(1500);
await page.click("button[aria-label='Account menu']");
await sleep(400);
check("account menu shows who is signed in", (await text()).includes("owner@bytecraft.local"));
await shot("08-account-menu");
await clickText("Sign out", "[role=menuitem]");
await page.waitForFunction(() => location.pathname === "/login", { timeout: 15000 }).catch(() => {});
check("sign out returns to the login page", page.url().endsWith("/login"), page.url());
await page.goto(`${BASE}/dashboard/properties`, { waitUntil: "networkidle2" });
await sleep(1200);
check("after sign out the dashboard is closed again", page.url().endsWith("/login"), page.url());

// ───────────────────────── 7. the demo still works
await clickText("Explore the demo", "button");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 15000 }).catch(() => {});
await sleep(2500);
const t3 = await text();
check("demo mode: sample companies and data (Al-Noor), marked Demo", t3.includes("Al-Noor") && t3.includes("Demo"));
await shot("09-demo");

check("no JavaScript errors during the whole run", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
