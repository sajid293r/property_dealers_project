// QA scratch: seed a fresh sandbox with a little of everything through the API. env: API, AUTH
const API = process.env.API ?? "http://localhost:4400", AUTH = process.env.AUTH ?? "http://localhost:54369";
const tok = (await (await fetch(`${AUTH}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "owner@bytecraft.local", password: "sandbox-pass" }) })).json()).access_token;
const co = (await (await fetch(`${API}/v1/me`, { headers: { authorization: `Bearer ${tok}` } })).json()).companies[0].companyId;
const api = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: { authorization: `Bearer ${tok}`, "x-company-id": co, "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const types = (await api("GET", "/v1/property-types")).body; const typeId = (types.rows ?? types)[0].id;
const proj = (await api("POST", "/v1/projects", { name: "Seed Valley", type: "residential", city: "Lahore" })).body;
const cust = (await api("POST", "/v1/parties", { name: "Seed Customer With A Fairly Long Name", roles: ["customer"], phone: "0300-5550100" })).body;
const accts = (await api("GET", "/v1/accounts")).body.filter((a) => !a.isGroup);
for (let i = 1; i <= 4; i++) {
  const p = (await api("POST", "/v1/properties", { title: `Seed plot ${i}`, typeId, projectId: proj.id, listPrice: "2500000" })).body;
  const b = (await api("POST", "/v1/bookings", { propertyId: p.id, customerId: cust.id, paymentType: "installment" })).body;
  await api("POST", `/v1/bookings/${b.id}/schedule`, { downPayment: "250000", installments: 6, firstDue: "2026-12-01" });
  if (i < 3) { await api("POST", `/v1/bookings/${b.id}/status`, { to: "confirmed" }); await api("POST", "/v1/receipts", { bookingId: b.id, amount: String(100000 * i), method: "cash" }); }
}
for (let i = 0; i < 3; i++) {
  const v = (await api("POST", "/v1/vouchers", { type: "JV", date: "2026-11-03", description: "Seed journal voucher with a description that is quite long indeed", lines: [{ accountId: accts[0].id, debit: "1250000.50" }, { accountId: accts[1].id, credit: "1250000.50" }] })).body;
  if (i < 2) { await api("POST", `/v1/vouchers/${v.id}/submit`); if (i < 1) await api("POST", `/v1/vouchers/${v.id}/approve`, {}); }
}
await api("POST", "/v1/service-invoices", { customerId: cust.id, dueDate: "2026-12-15", amount: "5000.50", description: "Seed service invoice" });
console.log("seeded");
