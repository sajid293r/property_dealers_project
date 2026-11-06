// For each screen (fully loaded, normal speed): how many DOM elements inside the guard's wrapper carry React's hydration mark, and which do not.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const routes = ["/dashboard", "/dashboard/projects", "/dashboard/properties", "/dashboard/plot-map", "/dashboard/customers", "/dashboard/deals", "/dashboard/crm", "/dashboard/quotations", "/dashboard/service-invoices", "/dashboard/cheques", "/dashboard/contracts", "/dashboard/contractors", "/dashboard/accounts", "/dashboard/vouchers", "/dashboard/expenses", "/dashboard/budgets", "/dashboard/reports", "/dashboard/staff", "/dashboard/payroll", "/dashboard/leave", "/dashboard/administration/users", "/dashboard/administration/roles", "/dashboard/administration/company-profile", "/dashboard/administration/activity", "/dashboard/bank-reconciliation", "/dashboard/account", "/dashboard/settings"];
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" }); await page.waitForSelector("#email"); await sleep(2000);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60000 }); await sleep(3000);
for (const r of routes) {
  await page.goto(BASE + r, { waitUntil: "domcontentloaded" }); await sleep(3500);
  const info = await page.evaluate(() => {
    const wrap = document.querySelector("main [aria-busy]")?.firstElementChild; if (!wrap) return { err: "no wrapper" };
    const all = [...wrap.querySelectorAll("*")]; const keyed = (n) => Object.keys(n).some((k) => k.startsWith("__reactFiber$"));
    const bad = all.filter((n) => !keyed(n)); const last = all[all.length - 1];
    return { total: all.length, unkeyed: bad.length, lastKeyed: last ? keyed(last) : null, sample: bad.slice(0, 3).map((n) => n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.split(" ")[0] : "")).join(", ") };
  });
  console.log(`${info.err ? "??" : info.unkeyed === 0 ? "ok" : "UNKEYED"}  ${r}: ${JSON.stringify(info)}`);
}
await browser.close();
