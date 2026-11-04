import puppeteer from "puppeteer-core";
const BASE = "http://localhost:3111", API = "http://localhost:4100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await (await browser.createBrowserContext()).newPage();
let prefix = null;
await page.setRequestInterception(true);
page.on("request", (r) => { if (prefix && r.url().startsWith(API + prefix) && r.method() === "GET") return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on our side." } }) }); r.continue(); });
await page.goto(BASE + "/login", { waitUntil: "networkidle2" }); await page.type("#email", "owner@bytecraft.local"); await page.type("#password", "sandbox-pass"); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }); await sleep(2500);
for (const [route, p] of [["/dashboard/customers", "/v1/parties"], ["/dashboard", "/v1/dashboard"]]) {
  prefix = p; await page.goto(BASE + route, { waitUntil: "domcontentloaded" }); await sleep(9000); console.log("toasts:", await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast],[role=status],[role=alert]")].map((x) => x.innerText).join("|") || "none"));
  const t = await page.evaluate(() => (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " "));
  const err = /went wrong|try again|retry|couldn't load|could not load|error/i.test(t);
  console.log(`${route} (${p} → 500): error shown=${err} | ${t.slice(0, 230)}`);
}
await browser.close();
