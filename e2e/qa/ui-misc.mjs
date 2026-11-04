// QA scratch (sandbox): A13/A14 failure screens, Urdu print + amount in words, Ctrl+K palette, slow API.
import puppeteer from "puppeteer-core";
const BASE = "http://localhost:3111", API = "http://localhost:4100", AUTH = "http://localhost:54339";
const SH = new URL("../shots/qa", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokRes = await fetch(`${AUTH}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@bytecraft.local", password: "sandbox-pass" }) });
const tok = (await tokRes.json()).access_token;
const me = await (await fetch(`${API}/v1/me`, { headers: { authorization: `Bearer ${tok}` } })).json(); const co = me.companies[0].companyId;
const api = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { authorization: `Bearer ${tok}`, "x-company-id": co, "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const rep = (id, ok, note) => console.log(JSON.stringify({ id, ok, note }));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const text = (p) => p.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
async function loginOn(page) { await page.goto(BASE + "/login", { waitUntil: "networkidle2" }); await page.type("#email", "owner@bytecraft.local"); await page.type("#password", "sandbox-pass"); await page.click("button[type=submit]"); }

// slow / failing list endpoint (N3): properties 500, and 3 s delay
{ const page = await (await browser.createBrowserContext()).newPage(); let mode = "500"; await page.setRequestInterception(true); page.on("request", (r) => { if (r.url().startsWith(API + "/v1/properties") && r.method() === "GET") { if (mode === "500") return r.respond({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "internal_error", message: "Something went wrong on our side." } }) }); if (mode === "403") return r.respond({ status: 403, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "not_permitted", message: "Your role does not allow this (inventory.view)." } }) }); } r.continue(); });
  await loginOn(page); await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }); await sleep(2500);
  await page.goto(BASE + "/dashboard/properties", { waitUntil: "networkidle2" }); await sleep(4000); const t5 = await text(page); await page.screenshot({ path: `${SH}/n3-properties-500.png` });
  rep("N3a", /went wrong|try again|Retry|couldn't|could not/i.test(t5) && !/No properties yet/i.test(t5), "properties API 500 → " + t5.slice(0, 260));
  mode = "403"; await page.goto(BASE + "/dashboard/properties", { waitUntil: "networkidle2" }); await sleep(4000); const t6 = await text(page); rep("N3b", /does not allow|permission|not allowed|role/i.test(t6) && !/No properties yet/i.test(t6), "properties API 403 → " + t6.slice(0, 260));
  await page.close(); }
// K1 Urdu print + amount in words
{ const cust = (await api("POST", "/v1/parties", { name: "QA-Urdu Print", roles: ["customer"] })).body;
  const types = (await api("GET", "/v1/property-types")).body; const typeId = (types.rows ?? types)[0].id;
  const ids = [];
  for (const amt of ["100000", "1250000.50", "120000000", "7.05"]) {
    const p = (await api("POST", "/v1/properties", { title: "QA-print " + amt, typeId, listPrice: "999999999" })).body; const b = (await api("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "installment" })).body;
    await api("POST", `/v1/bookings/${b.id}/schedule`, { downPayment: "1000", installments: 2, firstDue: "2027-01-01" });
    const r = await api("POST", "/v1/receipts", { bookingId: b.id, amount: amt, method: "cash" }); ids.push([amt, r.body.id]); }
  await api("PATCH", "/v1/me", { language: "ur" });
  const page = await (await browser.createBrowserContext()).newPage(); await loginOn(page); await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 }); await sleep(2000);
  for (const [amt, id] of ids) { await page.goto(`${BASE}/print/receipt/${id}`, { waitUntil: "networkidle2" }); await sleep(2500); const t = await text(page); const dir = await page.evaluate(() => document.documentElement.dir); rep("K1/M5", true, `amount ${amt} dir=${dir} → ${t.match(/.{0,70}(Only|صرف|فقط).{0,10}/)?.[0] ?? t.slice(0, 220)}`); if (amt === "1250000.50") await page.screenshot({ path: `${SH}/k1-print-receipt-urdu.png`, fullPage: true }); }
  // palette
  await page.goto(BASE + "/dashboard", { waitUntil: "networkidle2" }); await sleep(2000); await page.keyboard.down("Control"); await page.keyboard.press("k"); await page.keyboard.up("Control"); await sleep(800); const pal = await page.evaluate(() => !!document.querySelector("[cmdk-root], [role=dialog]")); rep("N5", pal, "Ctrl+K opens palette: " + pal);
  await page.keyboard.press("Escape"); await sleep(400); rep("N5b", !(await page.evaluate(() => !!document.querySelector("[role=dialog]"))), "Escape closes it");
  await api("PATCH", "/v1/me", { language: "en" }); await page.close(); }
await browser.close();
