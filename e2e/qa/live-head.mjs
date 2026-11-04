// QA scratch (live ByteCraft): signs in through the real page, then runs the flows through the API with the page's session.
// Everything created is prefixed QA-. Credentials only from QA_EMAIL / QA_PASSWORD. Nothing secret is printed.
import puppeteer from "puppeteer-core";
const BASE = "https://property-dealers-project.netlify.app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD);
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 40000 });
const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
await browser.close();

const lat = [];
async function raw(method, path, { co, body, headers = {}, auth = true } = {}) {
  const h = { ...headers }; if (auth) h.authorization = `Bearer ${token}`; if (co) h["x-company-id"] = co;
  if (body !== undefined && typeof body !== "string") h["content-type"] = "application/json";
  const t0 = Date.now();
  const r = await fetch(BASE + "/api" + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const ms = Date.now() - t0; lat.push({ m: method, path: path.replace(/[0-9a-f-]{36}/g, ":id").split("?")[0], ms, s: r.status });
  let b = null; const tx = await r.text(); try { b = JSON.parse(tx); } catch { b = tx; }
  return { status: r.status, body: b, ms };
}
const me = (await raw("GET", "/v1/me")).body; const co = me.companies[0].companyId;
console.log("companies:", me.companies.map((c) => `${c.name}/${c.plan}/${c.role}`).join(","));
const A = (m, p, body, headers) => raw(m, p, { co, body, headers });
const out = []; const created = [];
const t = async (id, name, fn) => { try { const [ok, note] = await fn(); out.push({ id, name, ok, note }); console.log(JSON.stringify({ id, name, ok, note: String(note ?? "").slice(0, 900) })); } catch (e) { out.push({ id, name, ok: false, note: "THREW " + e.message }); console.log(JSON.stringify({ id, name, ok: false, note: "THREW " + e.message })); } };
const rec = (type, ref) => created.push({ type, ref, at: new Date().toISOString() });
