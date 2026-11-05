// Read-only inventory of QA- records on LIVE, plus final books check. env: QA_EMAIL, QA_PASSWORD, BASE
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE, API = BASE + "/api";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 }); await sleep(2500);
await page.type("#email", process.env.QA_EMAIL); await page.type("#password", process.env.QA_PASSWORD); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 60000 }); await sleep(2500);
const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const meR = await (await fetch(API + "/v1/me", { headers: { authorization: `Bearer ${token}` } })).json();
const co = meR.companies[0].companyId;
console.log("my saved language:", JSON.stringify(meR.user?.preferredLanguage ?? meR.user?.language ?? ("fields: " + Object.keys(meR.user ?? {}).join(","))));
const get = async (p) => { const r = await fetch(API + p, { headers: { authorization: `Bearer ${token}`, "x-company-id": co } }); let j = null; try { j = await r.json(); } catch { /* none */ } if (Array.isArray(j)) return j; if (j && !j.rows && !j.totals) { const a = Object.values(j).find((v) => Array.isArray(v)); if (a) return a; if (j.error) console.log('   (' + p + ' -> ' + r.status + ' ' + j.error.message + ')'); return []; } return j?.rows ?? j; };
const qa = (arr, ...keys) => (arr ?? []).filter((x) => keys.some((k) => /^QA-/i.test(String(x?.[k] ?? ""))));
const parties = await get("/v1/parties?limit=200"), props = await get("/v1/properties?limit=200"), books = await get("/v1/bookings?limit=200");
const vouchers = await get("/v1/vouchers?limit=200"), cheques = await get("/v1/cheques"), projects = await get("/v1/projects?limit=200"), emps = await get("/v1/employees");
console.log("customers QA-:", qa(parties, "name").length, "| properties QA-:", qa(props, "title").length, "| projects QA-:", qa(projects, "name").length);
const qaBooks = (books ?? []).filter((b) => /^QA-/i.test(b.customerName ?? "") || /QA-/.test(b.propertyTitle ?? ""));
const by = {}; for (const b of qaBooks) by[b.status] = (by[b.status] ?? 0) + 1;
console.log("bookings QA-:", qaBooks.length, JSON.stringify(by));
const vby = {}; for (const v of (vouchers ?? []).filter((x) => /^QA-/i.test(x.description ?? x.narration ?? ""))) vby[v.status] = (vby[v.status] ?? 0) + 1;
console.log("vouchers QA-:", JSON.stringify(vby));
const draftV = (vouchers ?? []).filter((x) => /^QA-/i.test(x.description ?? x.narration ?? "") && ["draft", "rejected"].includes(x.status)).map((x) => `${x.number ?? x.id}:${x.status}`);
console.log("QA vouchers still draft/rejected (can be deleted in the screen):", draftV.join(", ") || "none");
console.log("cheques QA-:", qa(cheques, "chequeNo").length, "| employees QA-:", qa(emps, "fullName").length);
let live = 0, voidR = 0; for (const b of qaBooks) { const r = await get(`/v1/receipts?bookingId=${b.id}`); for (const x of r ?? []) (x.status === "void" ? voidR++ : live++); }
console.log("receipts on QA bookings: not voided", live, "| voided", voidR);
const banks = await get("/v1/bank-accounts"); let st = 0; for (const b of banks ?? []) { const s = await get(`/v1/bank-accounts/${b.id}/statements`); st += qa(s, "label").length; }
console.log("bank statements QA-:", st);
const tb = (await (await fetch(API + "/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31", { headers: { authorization: `Bearer ${token}`, "x-company-id": co } })).json()).totals;
console.log("FINAL trial balance:", tb.debit, "/", tb.credit, Math.abs(tb.debit - tb.credit) < 0.005 ? "BALANCED" : "NOT BALANCED");
await browser.close();
