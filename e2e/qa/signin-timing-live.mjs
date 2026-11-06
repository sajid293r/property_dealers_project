// QA diagnosis: where does sign-in time go on LIVE? Times every request made between pressing Sign in and the dashboard. env: QA_EMAIL, QA_PASSWORD, BASE
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, N = Number(process.env.N ?? 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) throw new Error("env");
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1280, height: 900 } });
for (let n = 1; n <= N; n++) {
  const page = await (await browser.createBrowserContext()).newPage();
  const reqs = new Map(); const log = [];
  page.on("request", (r) => reqs.set(r, Date.now()));
  page.on("requestfinished", (r) => { const t = Date.now() - (reqs.get(r) ?? Date.now()); if (t > 700) log.push(`${t} ms  ${r.method()} ${new URL(r.url()).host}${new URL(r.url()).pathname.slice(0, 50)}`); });
  page.on("requestfailed", (r) => log.push(`FAILED ${r.method()} ${new URL(r.url()).host}${new URL(r.url()).pathname.slice(0, 50)} ${r.failure()?.errorText}`));
  const t0 = Date.now();
  await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 });
  const tLogin = Date.now() - t0; await sleep(1500);
  await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD);
  const t1 = Date.now(); await page.click("button[type=submit]");
  let ok = true; try { await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 90000 }); } catch { ok = false; }
  const tRedirect = Date.now() - t1;
  let tContent = null; if (ok) { const t2 = Date.now(); for (let i = 0; i < 120; i++) { if ((await page.evaluate(() => document.body.innerText)).includes("ByteCraft")) { tContent = Date.now() - t2; break; } await sleep(500); } }
  console.log(`run ${n}: login page ${tLogin} ms | submit -> /dashboard ${ok ? tRedirect + " ms" : "TIMEOUT 90 s"} | then content ${tContent ?? "-"} ms`);
  for (const l of log) console.log("     slow:", l);
  await page.close();
}
await browser.close();
