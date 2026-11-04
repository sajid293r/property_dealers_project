// QA (group 3, BUG-013): find pages that scroll sideways at phone/tablet widths, and name the elements that stick out.
// env: BASE, API (live: https://<site>/api), WIDTHS, ONLY (comma list of route substrings); QA_EMAIL / QA_PASSWORD for the live site (sandbox default otherwise)
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "http://localhost:3411", API = process.env.API ?? "http://localhost:4400";
const WIDTHS = (process.env.WIDTHS ?? "320,375,768,1024").split(",").map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"], defaultViewport: { width: 1440, height: 900 } });
const page = await browser.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle2", timeout: 120000 });
await sleep(6000); await page.type("#email", process.env.QA_EMAIL ?? "owner@bytecraft.local"); await page.type("#password", process.env.QA_PASSWORD ?? "sandbox-pass"); await page.click("button[type=submit]");
await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 120000 }); await sleep(2500);
const token = await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/auth-token$/.test(k)) return JSON.parse(localStorage[k]).access_token; });
const me = await (await fetch(API + "/v1/me", { headers: { authorization: `Bearer ${token}` } })).json(); const co = me.companies[0].companyId;
const first = async (p) => { const r = await (await fetch(API + p, { headers: { authorization: `Bearer ${token}`, "x-company-id": co } })).json(); return (Array.isArray(r) ? r : r.rows ?? [])[0]; };
const booking = (await first("/v1/bookings"))?.id, voucher = (await first("/v1/vouchers"))?.id, property = (await first("/v1/properties"))?.id, project = (await first("/v1/projects"))?.id;
const routes = ["/dashboard", "/dashboard/projects", `/dashboard/projects/${project}`, "/dashboard/properties", `/dashboard/properties/${property}`, "/dashboard/plot-map", "/dashboard/customers", "/dashboard/deals", `/dashboard/deals/${booking}`, "/dashboard/crm", "/dashboard/quotations", "/dashboard/sales-invoices", "/dashboard/service-invoices", "/dashboard/cheques", "/dashboard/contracts", "/dashboard/contractors", "/dashboard/accounts", "/dashboard/vouchers", `/dashboard/vouchers/${voucher}`, "/dashboard/vouchers/new", "/dashboard/bank-reconciliation", "/dashboard/expenses", "/dashboard/budgets", "/dashboard/reports", "/dashboard/staff", "/dashboard/payroll", "/dashboard/leave", "/dashboard/administration/users", "/dashboard/administration/roles", "/dashboard/administration/company-profile", "/dashboard/administration/activity", "/dashboard/account"];
const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
let bad = 0, total = 0;
for (const w of WIDTHS) {
  await page.setViewport({ width: w, height: 900 });
  for (const r of routes) {
    if (only.length && !only.some((o) => r.includes(o))) continue;
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
    for (let i = 0; i < 24; i++) { await sleep(500); const ok = await page.evaluate(() => !document.querySelector("[aria-busy=true]") && document.body.innerText.length > 150); if (ok) break; }
    await sleep(700);
    const info = await page.evaluate(() => {
      const iw = window.innerWidth, sw = document.documentElement.scrollWidth;
      const out = [];
      if (sw > iw + 1) for (const el of document.querySelectorAll("main *")) { const b = el.getBoundingClientRect(); if (b.width > 0 && b.right > iw + 1 && !el.closest("[data-radix-popper-content-wrapper]")) { let anc = el.parentElement, clipped = false; while (anc && anc !== document.body) { const s = getComputedStyle(anc); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && anc.getBoundingClientRect().right <= iw + 1) { clipped = true; break; } anc = anc.parentElement; } if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 4).join(".")} right=${Math.round(b.right)} w=${Math.round(b.width)}`); } }
      // the chain of ancestors of the widest culprit: who is wider than the screen, and why
      const chain = [];
      if (sw > iw + 1) { let el = [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > iw + 1 && e.getBoundingClientRect().width > 0).sort((x, y) => x.getBoundingClientRect().width - y.getBoundingClientRect().width)[0]; while (el && el !== document.documentElement) { const cs = getComputedStyle(el); chain.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} w=${Math.round(el.getBoundingClientRect().width)} disp=${cs.display} minw=${cs.minWidth} ovx=${cs.overflowX}`); el = el.parentElement; } }
      return { iw, sw, over: sw - iw, culprits: out.slice(0, 3), chain };
    });
    total++;
    if (info.over > 1) { bad++; console.log(`OVERFLOW ${w}px ${r.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, ":id")} by ${info.over}px`); for (const c of info.culprits) console.log("    ", c); if (process.env.CHAIN) for (const c of info.chain) console.log("      ^", c); }
  }
}
console.log(`DONE ${total} page/width combinations, ${bad} overflow`);
await browser.close();
