// QA re-test: release smoke test (Q) on LIVE, as a person in the browser, plus the new fix checks. QA- records only.
// env: QA_EMAIL, QA_PASSWORD, BASE, RUN (label), PDF (path of a real PDF)
import puppeteer from "puppeteer-core";
import { createHash } from "node:crypto";
import fs from "node:fs";

const BASE = process.env.BASE, API = BASE + "/api", RUN = process.env.RUN ?? "1", stamp = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.QA_EMAIL || !process.env.QA_PASSWORD) throw new Error("env");
const res = [];
const check = (n, ok, x = "") => { res.push(!!ok); console.log((ok ? "  PASS " : "  FAIL ") + n + (x ? "  — " + String(x).slice(0, 220) : "")); };
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 1000 } });
const page = await (await browser.createBrowserContext()).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const text = () => page.evaluate(() => document.body.innerText);
async function waitText(t, ms = 20000) { const end = Date.now() + ms; while (Date.now() < end) { if ((await text()).includes(t)) return true; await sleep(300); } return false; }
const clickText = (t, sel = "button, a, [role=menuitem], [role=option], [role=combobox], [role=tab]") => page.evaluate((t, sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().replace(/\s+/g, " ").includes(t) && e.offsetParent !== null); if (!el) return false; el.click(); return true; }, t, sel);
async function realClick(t, sel = "[role=tab]") { const h = await page.evaluateHandle((t, sel) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(t) && e.offsetParent !== null) ?? null, t, sel); const el = h.asElement(); if (!el) return false; await el.click(); return true; }
const shot = (n) => page.screenshot({ path: `e2e/shots/qa/smoke-${RUN}-${n}.png` });
const dlg = () => page.evaluate(() => [...document.querySelectorAll("[role=dialog],[role=alert],[data-sonner-toast]")].map((e) => e.innerText.replace(/\s+/g, " ").slice(0, 200)).join(" || "));
const go = async (p) => { await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 120000 }); await sleep(1500); };

console.log(`=== SMOKE RUN ${RUN} ${new Date().toISOString()}`);
const t0 = Date.now();
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 150000 });
await page.waitForSelector("#email", { timeout: 150000 });
await sleep(2500);
await page.type("#email", process.env.QA_EMAIL);
await page.type("#password", process.env.QA_PASSWORD);
await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 150000 });
check("1 signed in, dashboard loads", await waitText("ByteCraft", 30000), `${Date.now() - t0} ms`);
const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const co = (await (await fetch(API + "/v1/me", { headers: { authorization: `Bearer ${token}` } })).json()).companies[0].companyId;
const api = async (m, p, b, h = {}) => {
  const r = await fetch(API + p, { method: m, headers: { authorization: `Bearer ${token}`, "x-company-id": co, ...(b !== undefined ? { "content-type": "application/json" } : {}), ...h }, body: b !== undefined ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch { /* none */ }
  return { s: r.status, b: j, h: r.headers };
};
const rows = (x) => (Array.isArray(x) ? x : x?.rows ?? []);
const typeId = rows((await api("GET", "/v1/property-types")).b).find((x) => /plot/i.test(x.name)).id;
const title = `QA-Smoke${RUN} plot ${stamp}`, cname = `QA-Smoke${RUN} Buyer ${stamp}`;
await api("POST", "/v1/properties", { title, typeId, listPrice: "200000" });

// customer through the screen
await go("/dashboard/customers");
await waitText("Add new", 20000);
await clickText("Add new", "button"); await sleep(700);
await page.type("input[placeholder='Ahmed Khan']", cname);
await page.type("input[placeholder='0300-1234567']", "0347" + String(stamp).slice(-7));
await clickText("Add", "[role=dialog] button");
check("2 customer added through the screen", await waitText(cname, 20000));

// booking through the screen
await go("/dashboard/deals");
await waitText("New booking", 20000);
await clickText("New booking", "button"); await sleep(900);
await clickText("Choose an available property", "[role=combobox]"); await sleep(600);
let gotProp = false; for (let i = 0; i < 60 && !gotProp; i++) { gotProp = await clickText(title, "[role=option]"); if (!gotProp) await sleep(500); } await sleep(400);
await clickText("Choose a customer", "[role=combobox]"); await sleep(600);
let gotCust = false; for (let i = 0; i < 60 && !gotCust; i++) { gotCust = await clickText(cname, "[role=option]"); if (!gotCust) await sleep(500); } await sleep(400);
await clickText("Create booking", "[role=dialog] button");
check("3 booking created, its page opens", gotProp && gotCust && (await waitText("Payment plan", 40000)), `property option ${gotProp}, customer option ${gotCust}`);
const bookingId = page.url().split("/").pop();
await sleep(800);

// plan
await clickText("Set payment plan", "button"); await sleep(800);
const inp = await page.$$("[role=dialog] input[inputmode='decimal'], [role=dialog] input[placeholder='0.00']");
await inp[0].type("40000");
await page.type("[role=dialog] input[type=date]", "01012027"); await sleep(300);
await clickText("Create plan", "[role=dialog] button");
check("4 payment plan created", await waitText("Down payment", 20000));

// receipt
await sleep(600);
await clickText("Receive payment", "button"); await sleep(800);
// only the dialog titled "Receive payment" counts: the payment-plan dialog can still be fading out when this one opens, and typing into it
// looked like a vanishing amount (QA "BUG-021", withdrawn: it was this script, not the product; see e2e/qa/bug021.mjs)
let amtField = null;
for (let i = 0; i < 80 && !amtField; i++) { const h = await page.evaluateHandle(() => { const d = [...document.querySelectorAll("[role=dialog]")].find((x) => x.textContent.includes("Receive payment") && x.querySelector("input[inputmode=decimal]")); return d ? d.querySelector("input[inputmode=decimal]") : null; }); amtField = h.asElement(); if (!amtField) await sleep(150); }
await amtField.click(); await page.keyboard.type("15000"); await sleep(500);
const typedOk = await page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].find((x) => x.textContent.includes("Receive payment")); const i = d?.querySelector("input[inputmode=decimal]"); return i ? i.value : null; });
if (!typedOk) { console.log("   NOTE amount field was EMPTY after typing"); await shot("5-amount-lost"); }
await clickText("Save receipt", "[role=dialog] button");
const rok = await waitText("RCT-", 20000);
check("5 receipt saved with a number", rok, rok ? "" : "dialogs/toasts: " + (await dlg()));
if (!rok) await shot("5-receipt");
await sleep(1200);
const bk = (await api("GET", `/v1/bookings/${bookingId}`)).b;
const rc = rows((await api("GET", `/v1/receipts?bookingId=${bookingId}`)).b);
check("5b exactly one receipt on the booking", rc.length === 1, `receipts ${rc.length}`);

// statement + trial balance
await go("/dashboard/reports");
await waitText("Debits equal credits", 25000);
await realClick("Customer / supplier statement"); await sleep(500);
await clickText("Choose a customer or supplier", "[role=combobox]"); await sleep(500);
await clickText(cname, "[role=option]"); await sleep(2500);
check("6 receipt is on the customer statement", (await text()).includes("RCT-"));
const tb = (await api("GET", "/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31")).b.totals;
check("6b trial balance balances", Math.abs(tb.debit - tb.credit) < 0.005, `${tb.debit}/${tb.credit}`);

// print page + attachment on the booking
await go(`/dashboard/deals/${bookingId}`);
await waitText("Payment plan", 25000);
await sleep(1500);
const href = await page.evaluate(() => [...document.querySelectorAll("a[href^='/print/receipt/']")].map((a) => a.getAttribute("href"))[0] ?? null);
if (href) {
  const d = await page.browserContext().newPage();
  await d.goto(BASE + href, { waitUntil: "domcontentloaded" }); await sleep(3500);
  const t = await d.evaluate(() => document.body.innerText);
  check("7 print page renders the receipt", t.includes("ByteCraft") && /RCT-\d+/.test(t) && /Thousand|Rupees/i.test(t), t.replace(/\s+/g, " ").slice(0, 80));
  await d.close();
} else check("7 print page renders the receipt", false, "no print link");
await clickText("Documents", "button"); await sleep(1500);
const fin = await page.$("input[type=file]");
const pdfPath = process.env.PDF;
if (fin) { await fin.uploadFile(pdfPath); check("8 attachment uploaded and listed", await waitText("QA-real.pdf", 25000)); } else check("8 attachment uploaded and listed", false, "no file input");
const atts = rows((await api("GET", `/v1/attachments?entityType=booking&entityId=${bookingId}`)).b);
const att = atts.find((a) => /QA-real/.test(a.fileName ?? a.file_name ?? ""));
if (att) {
  const r = await fetch(`${API}/v1/attachments/${att.id}/file`, { headers: { authorization: `Bearer ${token}`, "x-company-id": co } });
  const buf = Buffer.from(await r.arrayBuffer());
  check("8b download equals the upload (sha-256)", r.status === 200 && createHash("sha256").update(buf).digest("hex") === createHash("sha256").update(fs.readFileSync(pdfPath)).digest("hex"), `${r.status} ${r.headers.get("content-type")}`);
} else check("8b download equals the upload (sha-256)", false, "attachment not found by API");

// refused uploads
const up = (fileName, mime, bytes) => api("POST", "/v1/attachments", { entityType: "booking", entityId: bookingId, fileName, mime, data: Buffer.from(bytes).toString("base64") });
const mz = await up(`QA-fake${RUN}.pdf`, "application/pdf", Buffer.from("MZ\x90\x00\x03\x00\x00\x00 this is a program"));
check("9a text file named .pdf containing MZ refused", mz.s >= 400 && mz.s < 500 && /name says/i.test(mz.b?.error?.message ?? ""), `${mz.s} ${mz.b?.error?.message}`);
const pn = await up(`QA-fake${RUN}.png`, "image/png", fs.readFileSync(pdfPath));
check("9b PDF renamed .png refused", pn.s >= 400 && pn.s < 500 && /name says/i.test(pn.b?.error?.message ?? ""), `${pn.s} ${pn.b?.error?.message}`);

// print of an unknown id
const d2 = await page.browserContext().newPage();
const tp = Date.now();
await d2.goto(BASE + "/print/receipt/00000000-0000-0000-0000-0000000000ff", { waitUntil: "domcontentloaded" });
let nf = false;
for (let i = 0; i < 40; i++) { await sleep(250); if (/could not be found|couldn't be found|not found/i.test(await d2.evaluate(() => document.body.innerText))) { nf = true; break; } }
check("10 print of an unknown receipt says 'could not be found' quickly", nf && Date.now() - tp < 6000, `${Date.now() - tp} ms; ${(await d2.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 80)}`);
await d2.close();

// bank statement twice, wrong closing, override
const bank = rows((await api("GET", "/v1/bank-accounts")).b)[0];
if (bank) {
  const st = { label: `QA-stmt ${stamp}`, periodFrom: "2026-10-01", periodTo: "2026-10-31", openingBalance: "1000.00", closingBalance: "1700.00", lines: [{ date: "2026-10-05", description: `QA-dep ${stamp}`, deposit: "1000.00" }, { date: "2026-10-09", description: `QA-wd ${stamp}`, withdrawal: "300.00" }] };
  const s1 = await api("POST", `/v1/bank-accounts/${bank.id}/statements`, st);
  const s2 = await api("POST", `/v1/bank-accounts/${bank.id}/statements`, st);
  check("11a QA statement imported once, the second import refused", s1.s === 201 && s2.s === 409, `${s1.s} then ${s2.s} ${s2.b?.error?.message}`);
  const bad = { ...st, label: `QA-stmt bad ${stamp}`, closingBalance: "9999.00" };
  const s3 = await api("POST", `/v1/bank-accounts/${bank.id}/statements`, bad);
  check("11b wrong closing balance refused with the figures", s3.s === 422 && /1700|1,700/.test(s3.b?.error?.message ?? ""), `${s3.s} ${s3.b?.error?.message}`);
  const s4 = await api("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...bad, allowMismatch: true });
  check("11c 'Save it anyway' lets it through", s4.s === 201, String(s4.s));
} else check("11 bank statement checks", false, "no bank account");

// cheque twice
const chq = { chequeNo: `QA-CHQ-${stamp}`, bankName: "QA Bank", partyId: bk.customerId, amount: "5000", chequeDate: "2027-02-01" };
const c1 = await api("POST", "/v1/cheques", chq);
const c2 = await api("POST", "/v1/cheques", chq);
check("12 same cheque number twice for the same person and bank refused", c1.s === 201 && c2.s === 409, `${c1.s} then ${c2.s} ${c2.b?.error?.message}`);

// late fee twice, on a booking whose first installment is long overdue (a late fee needs a late installment)
{
  const p2t = (await api("POST", "/v1/properties", { title: `QA-Smoke${RUN} late plot ${stamp}`, typeId, listPrice: "100000" })).b;
  const bk2 = (await api("POST", "/v1/bookings", { propertyId: p2t.id, customerId: bk.customerId, paymentType: "installment" })).b;
  await api("POST", `/v1/bookings/${bk2.id}/schedule`, { downPayment: "10000", installments: 3, firstDue: "2026-03-01" });
  const full = (await api("GET", `/v1/bookings/${bk2.id}`)).b;
  const inst = (full.installments ?? []).find((i) => String(i.dueDate ?? i.due_date ?? "").startsWith("2026-03")) ?? (full.installments ?? [])[1];
  if (inst) {
    const p1 = await api("POST", `/v1/installments/${inst.id}/penalty`, { amount: "100.00", reason: "QA-late fee" });
    const p2 = await api("POST", `/v1/installments/${inst.id}/penalty`, { amount: "100.00", reason: "QA-late fee again" });
    check("13 a second late fee while one is open is refused", p1.s === 201 && p2.s === 409, `${p1.s} then ${p2.s} ${p2.b?.error?.message}`);
  } else check("13 second late fee refused", false, "no installment: keys " + Object.keys(full ?? {}).join(","));
}

// void from the screen (Deals page, Receipts tab, the row of this run's customer)
await go("/dashboard/deals");
await waitText("New booking", 25000);
await realClick("Receipts");
const voidBtn = () => page.evaluate((cn) => { const tr = [...document.querySelectorAll("tr")].find((r) => r.innerText.includes(cn)); const b = tr && [...tr.querySelectorAll("button")].find((x) => /void/i.test(x.textContent)); if (b) { b.click(); return true; } return false; }, cname);
let clicked = false;
for (let i = 0; i < 40 && !clicked; i++) { await sleep(500); clicked = await voidBtn(); }
await sleep(1000);
console.log("   void dialog:", await dlg()); await shot("14-void");
await page.type("[role=dialog] textarea, [role=dialog] input[type=text], [role=dialog] input:not([type])", "QA-smoke void");
await clickText("Void receipt", "[role=dialog] button");
await sleep(2500);
const rc2 = rows((await api("GET", `/v1/receipts?bookingId=${bookingId}`)).b);
check("14 receipt voided from the screen", rc2.length === 1 && /void/i.test(rc2[0].status ?? ""), JSON.stringify(rc2.map((r) => r.status)));
const tb2 = (await api("GET", "/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31")).b.totals;
check("14b trial balance still balances after the void", Math.abs(tb2.debit - tb2.credit) < 0.005, `${tb2.debit}/${tb2.credit}`);

// bank reconciliation opens
await go("/dashboard/bank-reconciliation");
check("15 bank reconciliation opens", (await waitText("Bank Reconciliation", 25000)) && !/couldn't load this page/i.test(await text()));

// language persists, then back to English
const docLang = () => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
const openMenu = async () => {
  for (let k = 0; k < 12; k++) {
    const h = await page.evaluateHandle(() => [...document.querySelectorAll("header button")].find((b) => b.querySelector("svg.lucide-globe")) ?? null);
    if (h.asElement()) await h.asElement().click();
    await sleep(900);
    if (await page.evaluate(() => document.querySelectorAll("[role=menuitem]").length > 0)) return true;
    await sleep(1500);
  }
  return false;
};
await openMenu(); await clickText("اردو", "[role=menuitem]");
for (let i = 0; i < 60 && (await docLang()).lang !== "ur"; i++) await sleep(500);
const d1 = await docLang();
await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
await waitText("ByteCraft", 120000); await sleep(2500); // the language attribute is server-rendered at once; wait for the page itself
for (let i = 0; i < 60 && (await docLang()).lang !== "ur"; i++) await sleep(500);
const d3 = await docLang();
check("16 Urdu chosen, kept after reload (rtl)", d1.lang === "ur" && d3.lang === "ur" && d3.dir === "rtl", JSON.stringify([d1, d3]));
await openMenu(); await clickText("English", "[role=menuitem]");
for (let i = 0; i < 60 && (await docLang()).lang !== "en"; i++) await sleep(500);
const d4 = await docLang();
check("16b English restored", d4.lang === "en", JSON.stringify(d4));
await api("PATCH", "/v1/me", { language: "en" }); // safety net: never leave the owner account on another language
check("no page errors in the browser", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
console.log(`SUMMARY RUN ${RUN}: ${res.filter(Boolean).length}/${res.length} pass`);
process.exit(res.every(Boolean) ? 0 : 1);
