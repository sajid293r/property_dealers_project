// QA (group 3): BUG-014 print page says "not found" at once / offers Try again on a server failure; BUG-015 workspace error screen.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3411", API = process.env.API ?? "http://localhost:4400";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1200, height: 900 } });
const rep = (id, ok, note) => console.log(JSON.stringify({ id, ok, note }));
const text = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
async function signIn(page) { await page.goto(BASE + "/login", { waitUntil: "networkidle2" }); await sleep(800); await page.type("#email", "owner@bytecraft.local"); await page.type("#password", "sandbox-pass"); await page.click("button[type=submit]"); }

// ── BUG-014
{
  const page = await (await browser.createBrowserContext()).newPage();
  let failReceipts = false;
  await page.setRequestInterception(true);
  page.on("request", (r) => { if (failReceipts && r.url().startsWith(API + "/v1/receipts/")) return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "x" } }) }); r.continue(); });
  await signIn(page); await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }); await sleep(2500);
  for (const [label, id] of [["unknown id", "00000000-0000-0000-0000-0000000000ff"], ["not a valid id", "not-a-uuid"]]) {
    const t0 = Date.now(); await page.goto(`${BASE}/print/receipt/${id}`, { waitUntil: "domcontentloaded" });
    let t = ""; for (let i = 0; i < 20; i++) { await sleep(300); t = await text(page); if (/could not be found/.test(t)) break; }
    rep("BUG-014 " + label, /could not be found/.test(t) && Date.now() - t0 < 6000, `${Date.now() - t0} ms → ${t.slice(0, 90)}`);
  }
  failReceipts = true;
  await page.goto(`${BASE}/print/receipt/00000000-0000-0000-0000-0000000000ee`, { waitUntil: "domcontentloaded" });
  let t = ""; for (let i = 0; i < 40; i++) { await sleep(500); t = await text(page); if (/couldn't load/.test(t)) break; }
  rep("BUG-014 server failure", /couldn't load this page/.test(t) && /Try again/.test(t) && !/could not be found/.test(t), t.slice(0, 140));
  await page.close();
}
// ── BUG-015
{
  const page = await (await browser.createBrowserContext()).newPage();
  let blockMe = true;
  await page.setRequestInterception(true);
  page.on("request", (r) => { if (blockMe && r.url() === API + "/v1/me" && r.method() === "GET") return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "RAW-SERVER-TEXT-x" } }) }); r.continue(); });
  await signIn(page);
  let t = ""; for (let i = 0; i < 40; i++) { await sleep(500); t = await text(page); if (/can't open your workspace/.test(t)) break; }
  rep("BUG-015 screen", /can't open your workspace/.test(t) && /Try again/.test(t) && /Sign out/.test(t) && !/RAW-SERVER-TEXT/.test(t), t.slice(0, 200));
  blockMe = false;
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => /Try again/.test(b.textContent))?.click(); });
  for (let i = 0; i < 40; i++) { await sleep(500); if ((await text(page)).includes("ByteCraft") && !/can't open/.test(await text(page))) break; }
  rep("BUG-015 retry recovers", /\/dashboard/.test(page.url()) && !/can't open your workspace/.test(await text(page)) && (await text(page)).includes("ByteCraft"), page.url());
  await page.close();
}
await browser.close();
