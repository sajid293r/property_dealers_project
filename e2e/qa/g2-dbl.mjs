// QA scratch: double-click / double-Enter on Record receipt and New booking in the real UI (sandbox). Prints findings.
import puppeteer from "puppeteer-core";
const BASE = "http://localhost:3311", API = "http://localhost:4300", AUTH = "http://localhost:54359";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokRes = await fetch(`${AUTH}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@bytecraft.local", password: "sandbox-pass" }) });
const tok = (await tokRes.json()).access_token;
const me = await (await fetch(`${API}/v1/me`, { headers: { authorization: `Bearer ${tok}` } })).json();
const co = me.companies[0].companyId;
const api = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { authorization: `Bearer ${tok}`, "x-company-id": co, "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };

const types = (await api("GET", "/v1/property-types")).body;
const typeId = (types.rows ?? types)[0].id;
const cust = (await api("POST", "/v1/parties", { name: "QA-Double Click", roles: ["customer"] })).body;
const mkBooking = async (title) => {
  const p = (await api("POST", "/v1/properties", { title, typeId, listPrice: "500000" })).body;
  const b = (await api("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "installment" })).body;
  await api("POST", `/v1/bookings/${b.id}/schedule`, { downPayment: "100000", installments: 4, firstDue: "2026-12-01" });
  return b;
};
const b1 = await mkBooking("QA-dbl plot 1");

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const typeInto = async (sel, v) => { await page.click(sel, { clickCount: 3 }); await page.type(sel, v); };
await page.goto(BASE + "/login", { waitUntil: "networkidle2" });
await typeInto("#email", "owner@bytecraft.local"); await typeInto("#password", "sandbox-pass");
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 20000 });

const count = async (bookingId) => (await api("GET", `/v1/receipts?bookingId=${bookingId}`)).body;
const clickText = (t, sel) => page.evaluate((t, sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null); if (!el) return false; el.click(); return true; }, t, sel);

async function trial(label, how) {
  const b = await mkBooking("QA-dbl " + label);
  await page.goto(`${BASE}/dashboard/deals/${b.id}`, { waitUntil: "networkidle2" }); await sleep(1500);
  await clickText("Receive payment", "button"); await sleep(800);
  const amt = await page.$$("[role=dialog] input[inputmode='decimal'], [role=dialog] input[placeholder='0.00']");
  await amt[0].type("1000");
  await sleep(300);
  if (how === "double-click") {
    await page.evaluate(() => { const b = [...document.querySelectorAll("[role=dialog] button")].find((e) => e.textContent.includes("Save receipt")); b.click(); b.click(); });
  } else if (how === "triple-click-mouse") {
    const h = await page.evaluateHandle(() => [...document.querySelectorAll("[role=dialog] button")].find((e) => e.textContent.includes("Save receipt")));
    await h.asElement().click({ clickCount: 3, delay: 10 });
  } else {
    await amt[0].focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Enter");
  }
  await sleep(4000);
  const r = await count(b.id);
  const rows = r.rows ?? r;
  console.log(`${label}: receipts created = ${rows.length}`);
  return rows.length;
}
const a = await trial("double-click", "double-click");
const c = await trial("triple-click-mouse", "triple-click-mouse");
const d = await trial("enter-enter", "enter");

// New booking double submit
console.log("page errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
