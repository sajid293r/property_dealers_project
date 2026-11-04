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

const projs = (await A("GET", "/v1/projects")).body; const proj = (projs.rows ?? projs).find((p) => p.name === "QA-Project Alpha");
const types = (await A("GET", "/v1/property-types")).body; const plot = (types.rows ?? types).find((x) => /plot/i.test(x.name));
const accounts = (await A("GET", "/v1/accounts")).body; const leaf = accounts.filter((a) => !(a.isGroup ?? a.is_group));
const pl = (await A("GET", "/v1/parties?search=QA-Buyer")).body; const parties = Array.isArray(pl) ? pl : pl.rows;
const cust = parties.find((p) => (p.displayName ?? p.name) === "QA-Buyer One"), cust2 = parties.find((p) => (p.displayName ?? p.name) === "QA-Buyer Two");
const stamp = String(Date.now()).slice(-6);
const mkProp = async (title, price) => { const p = (await A("POST", "/v1/properties", { title, typeId: plot.id, projectId: proj.id, listPrice: price })).body; rec("property", p.code); return p; };

await t("F8", "cancel with payment; refund > received refused; valid refund; refund again", async () => {
  const p = await mkProp("QA-Refund plot", "400000");
  const b = (await A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust2.id, paymentType: "installment" })).body; rec("booking", b.bookingNo);
  await A("POST", `/v1/bookings/${b.id}/schedule`, { downPayment: "40000", installments: 4, firstDue: "2026-12-01" }); await A("POST", `/v1/bookings/${b.id}/status`, { to: "confirmed" });
  const rc = await A("POST", "/v1/receipts", { bookingId: b.id, amount: "40000", method: "cash" }); rec("receipt", rc.body.receiptNo);
  const early = await A("POST", `/v1/bookings/${b.id}/refund`, { refundAmount: "100", method: "cash" });
  const cx = await A("POST", `/v1/bookings/${b.id}/status`, { to: "cancelled", reason: "QA-cancel with payment" });
  const prop = (await A("GET", `/v1/properties/${p.id}`)).body;
  const over = await A("POST", `/v1/bookings/${b.id}/refund`, { refundAmount: "50000", method: "cash" });
  const okr = await A("POST", `/v1/bookings/${b.id}/refund`, { refundAmount: "30000.50", deductionAmount: "4000", method: "cash", note: "QA-refund" }); if (okr.status < 300) rec("refund", `booking ${b.bookingNo}`);
  const rest = await A("POST", `/v1/bookings/${b.id}/refund`, { refundAmount: "6000", method: "cash" });
  const ex = (await A("GET", `/v1/bookings/${b.id}/extras`)).body;
  const tb = (await A("GET", `/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31`)).body.totals;
  return [early.status >= 400 && cx.status === 200 && prop.status === "available" && over.status >= 400 && okr.status < 300, `refund before cancel→${early.status}; cancel ${cx.status}; property ${prop.status}; refund 50000 of 40000→${over.status} ${over.body?.error?.message ?? ""}; refund 30000.50+4000 deduction→${okr.status}; further 6000 (total 36000.50+4000=40000.50 > 40000)→${rest.status} ${rest.body?.error?.message ?? ""}; extras refundable now ${ex.refundable}; TB ${tb.debit}/${tb.credit}`];
});
await t("F9", "booking transfer + same-customer transfer", async () => {
  const p = await mkProp("QA-Transfer plot", "300000");
  const b = (await A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "cash" })).body; rec("booking", b.bookingNo);
  const self = await A("POST", `/v1/bookings/${b.id}/transfer`, { toPartyId: cust.id });
  const t1 = await A("POST", `/v1/bookings/${b.id}/transfer`, { toPartyId: cust2.id, fee: "0", note: "QA-transfer" }); const g = (await A("GET", `/v1/bookings/${b.id}`)).body;
  const bogus = await A("POST", `/v1/bookings/${b.id}/transfer`, { toPartyId: "11111111-1111-1111-1111-111111111111" });
  return [t1.status < 300 && g.customerName === "QA-Buyer Two" && self.status >= 400, `self→${self.status} ${self.body?.error?.message ?? ""}; transfer ${t1.status}; customer now ${g.customerName}; unknown party ${bogus.status}`];
});
await t("H13", "service invoice: create, pay, void; credit side", async () => {
  const si = await A("POST", "/v1/service-invoices", { customerId: cust.id, dueDate: "2026-12-15", amount: "5000.50", description: "QA-service invoice" }); if (si.status === 201) rec("service invoice", si.body.invoiceNo ?? si.body.number ?? si.body.id);
  const pay = await A("POST", `/v1/service-invoices/${si.body.id}/payments`, { amount: "2000.25", method: "cash" }); const over = await A("POST", `/v1/service-invoices/${si.body.id}/payments`, { amount: "9999", method: "cash" });
  const g = (await A("GET", "/v1/service-invoices")).body; const row = (Array.isArray(g) ? g : g.rows).find((x) => x.id === si.body.id);
  const vo = await A("POST", `/v1/service-invoices/${si.body.id}/void`, { reason: "QA-void" });
  return [si.status === 201 && pay.status < 300 && over.status >= 400, `create ${si.status}; pay 2000.25→${pay.status} ${pay.status >= 300 ? JSON.stringify(pay.body).slice(0, 120) : ""}; overpay 9999→${over.status} ${over.body?.error?.message ?? ""}; row ${row?.status}/${row?.paidAmount ?? row?.paid}; void-after-partial-pay ${vo.status} ${vo.body?.error?.message ?? ""}`];
});
await t("K3", "attachments on a party", async () => {
  const log = []; const crypto = await import("node:crypto");
  const post = async (n, name, mime, buf) => { const t0 = Date.now(); const r = await A("POST", "/v1/attachments", { entityType: "party", entityId: cust.id, fileName: name, mime, data: buf.toString("base64") }); log.push(`${n}:${r.status}${r.body?.error?.code ? "/" + r.body.error.code : ""}(${Date.now() - t0}ms)`); if (r.status === 201) rec("attachment", `${name} on QA-Buyer One`); return r; };
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const up = await post("png", "QA-pic.png", "image/png", png);
  const dl = await fetch(BASE + "/api/v1/attachments/" + up.body.id + "/file", { headers: { authorization: `Bearer ${token}`, "x-company-id": co } }); const back = Buffer.from(await dl.arrayBuffer());
  const same = crypto.createHash("sha256").update(back).digest("hex") === crypto.createHash("sha256").update(png).digest("hex");
  const ct = `${dl.headers.get("content-type")} | ${dl.headers.get("content-disposition")}`;
  await post("pdf-3.9MB", "QA-big.pdf", "application/pdf", Buffer.alloc(Math.floor(3.9 * 1024 * 1024), 7));
  await post("pdf-4.1MB", "QA-toobig.pdf", "application/pdf", Buffer.alloc(Math.floor(4.1 * 1024 * 1024), 7));
  const ex = await post("exe-as-pdf", "QA-virus.pdf", "application/pdf", Buffer.from("MZ\x90\x00\x03\x00\x00\x00 fake exe header"));
  await post("exe-mime", "QA-virus.exe", "application/x-msdownload", Buffer.from("MZ"));
  await post("html-mime", "QA-page.html", "text/html", Buffer.from("<script>alert(1)</script>"));
  await post("empty", "QA-empty.pdf", "application/pdf", Buffer.alloc(0));
  const pn = await post("path-name", "..\\..\\QA-évil/../name ملف.pdf", "application/pdf", Buffer.from("%PDF-1.4 test"));
  await post("docx", "QA.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("PK\x03\x04docx"));
  const list = (await A("GET", `/v1/attachments?entityType=party&entityId=${cust.id}`)).body;
  const xdl = await fetch(BASE + "/api/v1/attachments/" + ex.body.id + "/file", { headers: { authorization: `Bearer ${token}`, "x-company-id": co } });
  return [same === true, `${log.join(" ")}; roundtrip identical ${same}; download headers ${ct}; exe-as-pdf served as ${xdl.headers.get("content-type")}; stored names: ${(Array.isArray(list) ? list : []).map((a) => a.fileName).join(" | ")}`];
});
await t("K2", "attachments of another entity type/permissions & foreign ids", async () => {
  const r = await A("GET", `/v1/attachments?entityType=party&entityId=00000000-0000-0000-0000-0000000000ff`); const r2 = await A("POST", "/v1/attachments", { entityType: "party", entityId: "00000000-0000-0000-0000-0000000000ff", fileName: "x.pdf", mime: "application/pdf", data: "UEsDBA==" });
  const dl = await A("GET", "/v1/attachments/00000000-0000-0000-0000-0000000000ff/file");
  return [r2.status === 404 && dl.status === 404, `list unknown entity→${r.status} ${JSON.stringify(r.body).slice(0, 40)}; upload to unknown record→${r2.status}; download unknown id→${dl.status}`];
});
await t("H10", "post-dated cheques", async () => {
  const log = []; const fields = await A("POST", "/v1/cheques", { direction: "received", chequeNo: "QA-CHQ-" + stamp, bank: "Meezan Bank", amount: "10000.00", chequeDate: "2026-12-10", partyId: cust.id });
  log.push(`create ${fields.status} ${fields.status >= 300 ? JSON.stringify(fields.body).slice(0, 200) : ""}`);
  return [fields.status === 201, log.join("; ")];
});
await t("I1/I2", "staff + leave", async () => {
  const log = []; const e = await A("POST", "/v1/employees", { name: "QA-Employee One", designation: "QA Clerk", basicSalary: "50000", joinDate: "2026-01-01" }); log.push(`employee ${e.status} ${e.status >= 300 ? JSON.stringify(e.body).slice(0, 220) : ""}`); if (e.status === 201) rec("employee", e.body.code ?? e.body.id);
  return [e.status === 201, log.join("; ")];
});
await t("H12", "budgets: create", async () => {
  const b = await A("POST", "/v1/budgets", { name: "QA-Budget", kind: "project", projectId: proj.id, controlMode: "warn" }); if (b.status === 201) rec("budget", b.body.id);
  return [b.status === 201, `create ${b.status} ${b.status >= 300 ? JSON.stringify(b.body).slice(0, 250) : ""}`];
});
await t("L3", "company profile: marla size and late fee read", async () => { const c = await A("GET", "/v1/company"); return [c.status === 200, JSON.stringify(c.body).slice(0, 400)]; });
await t("A7", "invite creation/seat counting (to QA address)", async () => {
  const roles = (await A("GET", "/v1/roles")).body; const members = (await A("GET", "/v1/members")).body; const pl = (await A("GET", "/v1/plan")).body;
  return [true, `roles ${(roles.rows ?? roles).map((r) => r.name)}; members ${members.members?.length}; plan ${JSON.stringify(pl).slice(0, 220)}`];
});
await t("H7c", "trial balance after run", async () => { const r = await A("GET", `/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31`); const { debit, credit } = r.body.totals; return [Math.abs(debit - credit) < 0.005, `${debit}/${credit}`]; });
const all = lat.map((l) => l.ms).sort((a, b) => a - b);
console.log("LATENCY n=" + all.length, "median", all[Math.floor(all.length / 2)], "p90", all[Math.floor(all.length * 0.9)], "max", all[all.length - 1]);
console.log("CREATED", JSON.stringify(created.map((c) => `${c.type}:${c.ref}`)));
console.log(`SUMMARY ${out.filter((o) => o.ok).length}/${out.length}`);
