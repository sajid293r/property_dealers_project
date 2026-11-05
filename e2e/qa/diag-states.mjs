import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, API = BASE + "/api"; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
let block = null; const seen = [];
await page.setRequestInterception(true);
page.on("request", (r) => {
  if (r.url().startsWith(API) && r.method() === "GET") { seen.push(r.url().replace(API, "")); if (block && r.url().startsWith(API + block)) return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on our side." } }) }); }
  r.continue();
});
await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 }); await sleep(3000);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60000 }); await sleep(3000);
const txt = () => page.evaluate(() => ({ alert: [...document.querySelectorAll("main [role=alert]")].map((x) => x.innerText.slice(0, 80)).join("|"), main: (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").slice(0, 200) }));
for (const route of ["/dashboard/projects", "/dashboard/reports", "/dashboard/bank-reconciliation"]) {
  seen.length = 0; block = null; await page.goto(BASE + route, { waitUntil: "domcontentloaded" }); await sleep(6000);
  console.log("\n" + route, "\n GETs:", [...new Set(seen)].join(", "));
  // block each distinct path (without query) one at a time
  for (const p of [...new Set(seen.map((s) => s.split("?")[0]))].filter((s) => !/\/v1\/(me|company)$/.test(s))) {
    block = p; await page.goto(BASE + route, { waitUntil: "domcontentloaded" }); await sleep(9000); const t = await txt();
    console.log(` block ${p}: alert=[${t.alert}] main=${t.main.slice(0, 110)}`);
  }
  block = null;
}
await browser.close();
