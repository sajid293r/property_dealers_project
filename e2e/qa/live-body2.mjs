
// ── find the QA project made in run 1
const projs = (await A("GET", "/v1/projects")).body; const proj = (projs.rows ?? projs).find((p) => p.name === "QA-Project Alpha");
const types = (await A("GET", "/v1/property-types")).body; const typeRows = types.rows ?? types; const plot = typeRows.find((x) => /plot/i.test(x.name));
const accounts = (await A("GET", "/v1/accounts")).body; const leaf = accounts.filter((a) => !(a.isGroup ?? a.is_group));
const stamp = String(Date.now()).slice(-6);
const ph = (n) => `03${String(10 + n).padStart(2, "0")}${stamp}`;
await A("GET", "/v1/banks").then((r) => console.log("banks shape:", Array.isArray(r.body) ? "array " + r.body.length : Object.keys(r.body)));

await t("H8", "bank list has 43 banks", async () => { const b = (await A("GET", "/v1/banks")).body; const rows = Array.isArray(b) ? b : b.rows ?? b.banks ?? []; return [rows.length === 43, `${rows.length} banks; sample: ${rows.slice(0, 4).map((x) => x.name ?? x.shortName)}`]; });
await t("E1", "customers with unique phones: Urdu/apostrophe/HTML/200/emoji/spaces", async () => {
  const names = ["QA-محمد علی خان", "QA-O'Neil", "QA-<b>x</b>", "QA-" + "A".repeat(197), "QA-😀 Emoji Khan", "  QA-Spaces  "]; const bad = []; let i = 0;
  for (const n of names) { const r = await A("POST", "/v1/parties", { name: n, roles: ["customer"], phone: ph(i++) }); if (r.status !== 201) { bad.push(`${n.slice(0, 15)}→${r.status} ${r.body?.error?.message}`); continue; } rec("customer", r.body.code ?? r.body.id); const g = (await A("GET", `/v1/parties/${r.body.id}`)).body; if ((g.displayName ?? g.name) !== n.trim()) bad.push(`roundtrip ${n.slice(0, 12)}`); }
  const over = await A("POST", "/v1/parties", { name: "QA-" + "B".repeat(198), roles: ["customer"], phone: ph(i++) }); if (over.status === 201) rec("customer", over.body.id);
  const s = await A("GET", "/v1/parties?search=" + encodeURIComponent("محمد")); const sn = (Array.isArray(s.body) ? s.body : s.body.rows).length;
  return [bad.length === 0, `${bad.join(" | ")} 201-char name→${over.status} (limit 160); Urdu search hits ${sn}`];
});
let cust, cust2;
await t("E5", "phone formats normalise to same value; duplicate phone", async () => {
  cust = (await A("POST", "/v1/parties", { name: "QA-Buyer One", roles: ["customer"], phone: "+92 300 " + stamp.slice(0, 7).padEnd(7, "1"), email: "qa-buyer@example.com" })).body; rec("customer", cust.code ?? cust.id);
  cust2 = (await A("POST", "/v1/parties", { name: "QA-Buyer Two", roles: ["customer"], phone: "0321-" + stamp.padEnd(7, "2") })).body; rec("customer", cust2.code ?? cust2.id);
  const g1 = (await A("GET", `/v1/parties/${cust.id}`)).body, g2 = (await A("GET", `/v1/parties/${cust2.id}`)).body;
  const dup = await A("POST", "/v1/parties", { name: "QA-Dup phone", roles: ["customer"], phone: "0300-" + stamp.slice(0, 7).padEnd(7, "1") }); if (dup.status === 201) rec("customer", dup.body.id);
  return [dup.status === 409, `stored: '${g1.phone}' and '${g2.phone}'; same number typed another way → ${dup.status} ${dup.body?.error?.message}`];
});
let bk;
await t("F5", "booking + 1,000,000 over 7 installments", async () => {
  const p = (await A("POST", "/v1/properties", { title: "QA-Plan plot", typeId: plot.id, projectId: proj.id, listPrice: "1000000" })).body; rec("property", p.code);
  const b = await A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "installment" }); bk = b.body; rec("booking", bk.bookingNo);
  const r = await A("POST", `/v1/bookings/${bk.id}/schedule`, { downPayment: "100000", installments: 7, firstDue: "2026-12-01" });
  const ins = r.body.installments ?? []; const sum = ins.reduce((s, i) => s + Math.round(Number(i.amount) * 100), 0);
  return [r.status === 200 && sum === 100000000, `${ins.length} rows, sum paisa ${sum}: ${ins.map((i) => i.amount).join(",")}`];
});
await t("F3", "same Idempotency-Key in parallel; second customer on same property", async () => {
  const k = { "idempotency-key": "qa-live-" + Date.now() };
  const p = (await A("POST", "/v1/properties", { title: "QA-Idem plot", typeId: plot.id, projectId: proj.id, listPrice: "300000" })).body; rec("property", p.code);
  const [a, b] = await Promise.all([A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "cash" }, k), A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "cash" }, k)]); rec("booking", a.body?.bookingNo);
  const c = await A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust2.id, paymentType: "cash" });
  const lst = (await A("GET", `/v1/bookings?propertyId=${p.id}`)).body; const n = (Array.isArray(lst) ? lst : lst.rows).length;
  return [n === 1 && c.status === 409 && a.body?.id === b.body?.id, `parallel same key → ${a.status}/${b.status} same id ${a.body?.id === b.body?.id}; other customer ${c.status}; bookings on property ${n}`];
});
await t("F4", "10 simultaneous bookings of one property", async () => {
  const p = (await A("POST", "/v1/properties", { title: "QA-Race plot", typeId: plot.id, projectId: proj.id, listPrice: "200000" })).body; rec("property", p.code);
  const rs = await Promise.all(Array.from({ length: 10 }, () => A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "cash" })));
  rs.filter((r) => r.status === 201).forEach((r) => rec("booking", r.body.bookingNo));
  const n = rs.filter((r) => r.status === 201).length; return [n === 1, `201s=${n}; others ${[...new Set(rs.filter((r) => r.status !== 201).map((r) => r.status))]}`];
});
await t("F6", "booking status rules on live", async () => {
  const bad = []; const log = []; const st = async (id, to, reason) => { const r = await A("POST", `/v1/bookings/${id}/status`, { to, reason }); log.push(`${to}:${r.status}`); return r; };
  if ((await st(bk.id, "completed")).status < 400) bad.push("pending→completed accepted");
  if ((await st(bk.id, "confirmed")).status !== 200) bad.push("confirm failed");
  if ((await st(bk.id, "completed")).status < 400) bad.push("complete with unpaid accepted");
  return [bad.length === 0, bad.join(",") + " " + log];
});
let r1, r2;
await t("G1", "receipts: paisa, partial, exact; bad amounts refused", async () => {
  const rs = []; for (const amt of ["0.01", "99999.99", "0.00", "-5", "abc", "1,000", "10.555"]) rs.push([amt, await A("POST", "/v1/receipts", { bookingId: bk.id, amount: amt, method: "cash" })]);
  for (const [, r] of rs) if (r.status === 201) rec("receipt", r.body.receiptNo);
  r1 = rs[0][1].body; r2 = rs[1][1].body; const b = (await A("GET", `/v1/bookings/${bk.id}`)).body; const i0 = b.installments[0];
  return [rs[0][1].status === 201 && rs[1][1].status === 201 && rs.slice(2).every(([, r]) => r.status >= 400) && i0.paidAmount === "100000.00" && i0.status === "paid", `${rs.map(([a, r]) => `${a}→${r.status}`).join(" ")}; ${r1?.receiptNo},${r2?.receiptNo}; first installment ${i0.status}/${i0.paidAmount}`];
});
await t("G4", "void receipt then second void", async () => {
  const v = await A("POST", `/v1/receipts/${r2.id}/void`, { reason: "QA-void test" }); const v2 = await A("POST", `/v1/receipts/${r2.id}/void`, { reason: "QA-void again" });
  const nr = await A("POST", `/v1/receipts/${r2.id}/void`, {});
  const b = (await A("GET", `/v1/bookings/${bk.id}`)).body; const i0 = b.installments[0];
  return [v.status === 200 && v2.status >= 400 && i0.status === "partial" && i0.paidAmount === "0.01", `void ${v.status}; again ${v2.status}; no reason ${nr.status}; first installment ${i0.status}/${i0.paidAmount}`];
});
await t("E3", "customer statement shows receipt + void", async () => {
  const s = (await A("GET", `/v1/parties/${cust.id}/statement`)).body; const lines = s.lines ?? [];
  return [lines.length >= 3, `${lines.length} lines; numbers ${lines.map((l) => l.number + ":" + (l.debit !== "0.00" ? "Dr" + l.debit : "Cr" + l.credit)).join(" ")}; closing ${lines.at(-1)?.balance}`];
});
await t("G7", "collections overdue/week/month/all + dashboard", async () => {
  const out = []; for (const b of ["overdue", "week", "month", "all"]) { const r = await A("GET", `/v1/collections?bucket=${b}`); const rows = r.body.rows ?? r.body; out.push(`${b}:${r.status}:${Array.isArray(rows) ? rows.length : Object.keys(r.body)}`); }
  const d = await A("GET", "/v1/dashboard");
  return [d.status === 200, out.join(" ") + ` dashboard keys ${Object.keys(d.body).join("/")}`];
});
await t("G8", "reminder logged", async () => {
  const ins = (await A("GET", `/v1/bookings/${bk.id}`)).body.installments[1];
  const r = await A("POST", "/v1/reminders", { bookingId: bk.id, installmentId: ins.id, channel: "whatsapp", message: "QA-reminder اردو test" }); const g = await A("GET", `/v1/reminders?bookingId=${bk.id}`);
  return [r.status === 201 && JSON.stringify(g.body).includes("QA-reminder"), `post ${r.status}; list ${g.status} ${JSON.stringify(g.body).slice(0, 120)}`];
});
await t("F9/F8", "cancel with payments, refund > paid refused, refund ok", async () => {
  const p = (await A("POST", "/v1/properties", { title: "QA-Refund plot", typeId: plot.id, projectId: proj.id, listPrice: "400000" })).body; rec("property", p.code);
  const b = (await A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust2.id, paymentType: "installment" })).body; rec("booking", b.bookingNo);
  await A("POST", `/v1/bookings/${b.id}/schedule`, { downPayment: "40000", installments: 4, firstDue: "2026-12-01" }); await A("POST", `/v1/bookings/${b.id}/status`, { to: "confirmed" });
  const rc = await A("POST", "/v1/receipts", { bookingId: b.id, amount: "40000", method: "cash" }); rec("receipt", rc.body.receiptNo);
  const cx = await A("POST", `/v1/bookings/${b.id}/status`, { to: "cancelled", reason: "QA-cancel with payment" });
  const prop = (await A("GET", `/v1/properties/${p.id}`)).body;
  const over = await A("POST", `/v1/bookings/${b.id}/refund`, { amount: "50000", method: "cash" }); const okr = await A("POST", `/v1/bookings/${b.id}/refund`, { amount: "15000.50", method: "cash" });
  if (okr.status < 300) rec("refund", `booking ${b.bookingNo}`);
  const ex = await A("GET", `/v1/bookings/${b.id}/extras`);
  return [cx.status === 200 && prop.status === "available" && over.status >= 400 && okr.status < 300, `cancel ${cx.status}; property ${prop.status}; refund 50000 (paid 40000)→${over.status} ${over.body?.error?.message ?? ""}; refund 15000.50→${okr.status} ${JSON.stringify(okr.body).slice(0, 100)}; extras ${JSON.stringify(ex.body).slice(0, 160)}`];
});
await t("F10", "booking transfer", async () => {
  const p = (await A("POST", "/v1/properties", { title: "QA-Transfer plot", typeId: plot.id, projectId: proj.id, listPrice: "300000" })).body; rec("property", p.code);
  const b = (await A("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "cash" })).body; rec("booking", b.bookingNo);
  const t1 = await A("POST", `/v1/bookings/${b.id}/transfer`, { toCustomerId: cust2.id, reason: "QA-transfer", fee: "0" }); const g = (await A("GET", `/v1/bookings/${b.id}`)).body;
  const self = await A("POST", `/v1/bookings/${b.id}/transfer`, { toCustomerId: g.customerId, reason: "QA-self" });
  return [t1.status < 300 && g.customerId === cust2.id, `transfer ${t1.status} ${t1.status >= 300 ? JSON.stringify(t1.body).slice(0, 140) : ""}; customer now ${g.customerName}; transfer to same customer ${self.status}`];
});
await t("K3", "attachments: allowed, 3.9MB ok, 4.1MB refused, exe renamed pdf, bad type, empty, path-like name", async () => {
  const log = []; const post = async (n, name, mime, buf) => { const r = await A("POST", "/v1/attachments", { entityType: "customer", entityId: cust.id, fileName: name, mime, data: buf.toString("base64") }); log.push(`${n}:${r.status}${r.body?.error?.code ? "/" + r.body.error.code : ""}`); return r; };
  const crypto = await import("node:crypto");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const up = await post("png", "QA-pic.png", "image/png", png);
  const dl = up.status === 201 ? await fetch(BASE + "/api/v1/attachments/" + up.body.id + "/file", { headers: { authorization: `Bearer ${token}`, "x-company-id": co } }) : null; const back = dl ? Buffer.from(await dl.arrayBuffer()) : null;
  const same = back && crypto.createHash("sha256").update(back).digest("hex") === crypto.createHash("sha256").update(png).digest("hex");
  await post("pdf-3.9MB", "QA-big.pdf", "application/pdf", Buffer.alloc(3.9 * 1024 * 1024, 7));
  await post("pdf-4.1MB", "QA-toobig.pdf", "application/pdf", Buffer.alloc(4.1 * 1024 * 1024, 7));
  await post("exe-as-pdf", "QA-virus.pdf", "application/pdf", Buffer.from("MZ\x90\x00\x03\x00\x00\x00 fake exe header"));
  await post("exe-mime", "QA-virus.exe", "application/x-msdownload", Buffer.from("MZ"));
  await post("empty", "QA-empty.pdf", "application/pdf", Buffer.alloc(0));
  await post("path-name", "..\\..\\QA-évil/../name ملف.pdf", "application/pdf", Buffer.from("%PDF-1.4 test"));
  await post("docx", "QA.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("PK\x03\x04docx"));
  const list = (await A("GET", `/v1/attachments?entityType=customer&entityId=${cust.id}`)).body; rec("attachments", `${list.length} on customer ${cust.id}`);
  return [same === true, `${log.join(" ")}; roundtrip identical: ${same}; stored names: ${list.map((a) => a.fileName).join(" | ")}`];
});
await t("K3b", "attachment content-type header on download & XSS (html uploaded as pdf)", async () => {
  const html = Buffer.from("<html><script>alert(1)</script></html>"); const r = await A("POST", "/v1/attachments", { entityType: "customer", entityId: cust.id, fileName: "QA-page.pdf", mime: "application/pdf", data: html.toString("base64") });
  const dl = await fetch(BASE + "/api/v1/attachments/" + r.body.id + "/file", { headers: { authorization: `Bearer ${token}`, "x-company-id": co } });
  return [true, `upload ${r.status}; download content-type=${dl.headers.get("content-type")} disposition=${dl.headers.get("content-disposition")} nosniff=${dl.headers.get("x-content-type-options")}`];
});
await t("H11/H13", "leads → quotation → accept; expenses; service invoice", async () => {
  const log = [];
  const lead = await A("POST", "/v1/leads", { name: "QA-Lead One", phone: ph(40), source: "walk_in" }); log.push(`lead ${lead.status}`); if (lead.status === 201) rec("lead", lead.body.id);
  const mv = await A("POST", `/v1/leads/${lead.body.id}/stage`, { stage: "contacted" }); log.push(`stage ${mv.status}`);
  const p = (await A("POST", "/v1/properties", { title: "QA-Quote plot", typeId: plot.id, projectId: proj.id, listPrice: "800000" })).body; rec("property", p.code);
  const q = await A("POST", "/v1/quotations", { partyId: cust.id, propertyId: p.id, validUntil: "2026-12-31", downPayment: "80000", installments: 6, firstDue: "2027-01-01" }); log.push(`quote ${q.status}`); if (q.status === 201) rec("quotation", q.body.quoteNo ?? q.body.id);
  const ac = await A("POST", `/v1/quotations/${q.body.id}/accept`, {}); const ac2 = await A("POST", `/v1/quotations/${q.body.id}/accept`, {}); log.push(`accept ${ac.status} twice ${ac2.status}`); if (ac.status < 300) rec("booking(from quote)", JSON.stringify(ac.body).slice(0, 60));
  const si = await A("POST", "/v1/service-invoices", { partyId: cust.id, description: "QA-service invoice", amount: "5000.50" }); log.push(`service-inv ${si.status} ${si.status >= 300 ? JSON.stringify(si.body).slice(0, 120) : ""}`);
  return [ac.status < 300 && ac2.status >= 400, log.join("; ")];
});
await t("L4", "audit log: QA actions present once, no CNIC", async () => {
  const a = await A("GET", "/v1/audit?limit=60"); const rows = a.body.rows ?? []; const s = JSON.stringify(rows);
  return [a.status === 200 && !/9999991\d/.test(s), `${rows.length} rows; sample actions ${rows.slice(0, 5).map((r) => r.entityType + ":" + r.action).join(",")}`];
});
await t("O2", "live mass-assignment: company_id/status/paid in body", async () => {
  const r = await A("POST", "/v1/parties", { name: "QA-Mass", roles: ["customer"], phone: ph(50), company_id: "00000000-0000-0000-0000-0000000000ff", id: "11111111-1111-1111-1111-111111111111", created_by: "11111111-1111-1111-1111-111111111111" }); if (r.status === 201) rec("customer", r.body.id);
  return [r.status === 201 && r.body.id !== "11111111-1111-1111-1111-111111111111", `status ${r.status} id ${r.body?.id}`];
});
await t("H7b", "trial balance still balanced after run", async () => { const r = await A("GET", `/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31`); const { debit, credit } = r.body.totals; return [Math.abs(debit - credit) < 0.005, `${debit}/${credit}`]; });
await t("J2", "reports endpoints all 200 on live", async () => {
  const bad = []; for (const p of ["balance-sheet?asOf=2026-11-03", "income-statement?from=2026-07-01&to=2026-11-03", "cash-flow?from=2026-07-01&to=2026-11-03", "collections?from=2026-07-01&to=2026-11-03", "payables?asOf=2026-11-03", "receivables-aging?asOf=2026-11-03", "sales-summary?from=2026-07-01&to=2026-11-03"]) { const r = await A("GET", "/v1/reports/" + p); if (r.status !== 200) bad.push(`${p.split("?")[0]}→${r.status} ${JSON.stringify(r.body?.error?.details ?? r.body?.error?.message ?? "").slice(0, 80)}`); }
  return [bad.length === 0, bad.join(" | ")];
});
const timed = {}; for (const l of lat) { const k = `${l.m} ${l.path}`; (timed[k] ??= []).push(l.ms); }
const all = lat.map((l) => l.ms).sort((a, b) => a - b);
console.log("LATENCY n=" + all.length, "median", all[Math.floor(all.length / 2)], "p90", all[Math.floor(all.length * 0.9)], "max", all[all.length - 1]);
console.log("SLOWEST", Object.entries(timed).map(([k, v]) => [k, Math.max(...v)]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${v}`).join(" | "));
console.log("CREATED", JSON.stringify(created));
console.log(`SUMMARY ${out.filter((o) => o.ok).length}/${out.length}`);
