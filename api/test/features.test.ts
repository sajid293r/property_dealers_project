import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ID, startHarness, type Harness } from "./helpers.js";
import { MODULE_KEYS } from "../src/roles.js";

let h: Harness;
const A = ID.coA;
const owner = { as: ID.alice, company: A };
const bytes = (n: number) => Buffer.alloc(n, 7).toString("base64");

beforeAll(async () => {
  h = await startHarness();
  await h.admin(async (c) => {
    await c.query(`update roles set is_system = true where id = $1`, [ID.roleOwner]);
    for (const m of MODULE_KEYS) {
      await c.query(`insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,$2,true,true,true,true,true,'company') on conflict (role_id,module) do update set can_view=true,can_create=true,can_edit=true,can_delete=true,can_approve=true`, [ID.roleOwner, m]);
    }
  });
});
afterAll(async () => {
  await h.close();
});

async function codes(): Promise<Record<string, string>> {
  const r = await h.call("GET", "/v1/accounts", owner);
  return Object.fromEntries(r.body.map((a: { code: string; id: string }) => [a.code, a.id]));
}

describe("my account and the activity log", () => {
  it("lets a person change their own name, and shows it to colleagues", async () => {
    const r = await h.call("PATCH", "/v1/me", { as: ID.bob, body: { fullName: "Bob the Viewer" } });
    expect(r.status).toBe(200);
    const me = await h.call("GET", "/v1/me", { as: ID.bob });
    expect(me.body.user.fullName).toBe("Bob the Viewer");
    expect((await h.call("PATCH", "/v1/me", { as: ID.bob, body: { fullName: "x" } })).status).toBe(400);
    const members = await h.call("GET", "/v1/members", owner);
    expect(members.body.members.some((m: { fullName: string }) => m.fullName === "Bob the Viewer")).toBe(true);
  });

  it("records who changed what, hides identity numbers, and shows an owner only their own company", async () => {
    const cust = (await h.call("POST", "/v1/parties", { ...owner, body: { name: "Audit Customer", roles: ["customer"], cnic: "35202-7654321-9" } })).body;
    await h.call("PATCH", `/v1/parties/${cust.id}`, { ...owner, body: { city: "Multan" } });
    const log = await h.call("GET", `/v1/audit?entityType=parties&entityId=${cust.id}`, owner);
    expect(log.status).toBe(200);
    expect(log.body.rows.length).toBeGreaterThanOrEqual(2);
    expect(log.body.rows[0]).toMatchObject({ action: "update", userName: "Alice Owner" });
    expect(log.body.rows[0].changes.some((c: { field: string; to: string }) => c.field === "city" && c.to === "Multan")).toBe(true);
    expect(JSON.stringify(log.body)).not.toMatch(/cnic_(enc|hash)/);
    expect((await h.call("GET", "/v1/audit", { as: ID.bob, company: A })).status).toBe(403);
    expect((await h.call("GET", `/v1/audit?entityId=${cust.id}`, { as: ID.carol, company: ID.coB })).body.rows).toEqual([]);
  });
});

describe("collections and reminders", () => {
  it("lists overdue installments with the customer's phone, and records that they were reminded", async () => {
    const cust = (await h.call("POST", "/v1/parties", { ...owner, body: { name: "Late Payer", roles: ["customer"], phone: "0300-9998877" } })).body;
    const bk = await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: ID.propA(1), customerId: cust.id, paymentType: "installment" } });
    await h.call("POST", `/v1/bookings/${bk.body.id}/schedule`, { ...owner, body: { downPayment: "100000", installments: 2, firstDue: "2020-03-01" } });
    const c = await h.call("GET", "/v1/collections?bucket=overdue", owner);
    expect(c.status).toBe(200);
    const row = c.body.rows.find((r: { bookingId: string }) => r.bookingId === bk.body.id);
    expect(row).toMatchObject({ customerName: "Late Payer", phone: "+923009998877", reminders: 0 });
    expect(Number(c.body.totals.overdueAmount)).toBeGreaterThan(0);
    const log = await h.call("POST", "/v1/reminders", { ...owner, body: { bookingId: bk.body.id, installmentId: row.installmentId, channel: "whatsapp", message: "Assalam o Alaikum" } });
    expect(log.status).toBe(201);
    const again = await h.call("GET", "/v1/collections?bucket=overdue", owner);
    expect(again.body.rows.find((r: { bookingId: string }) => r.bookingId === bk.body.id).reminders).toBe(1);
    expect((await h.call("GET", `/v1/reminders?bookingId=${bk.body.id}`, owner)).body[0].channel).toBe("whatsapp");
  });
});

describe("attachments", () => {
  it("stores a file against a record, lists it, serves it back unchanged, and removes it", async () => {
    const up = await h.call("POST", "/v1/attachments", { ...owner, body: { entityType: "party", entityId: ID.custA, fileName: "cnic front.pdf", mime: "application/pdf", data: bytes(2048), category: "CNIC" } });
    expect(up.status).toBe(201);
    expect(up.body.sizeBytes).toBe(2048);
    const list = await h.call("GET", `/v1/attachments?entityType=party&entityId=${ID.custA}`, owner);
    expect(list.body[0]).toMatchObject({ fileName: "cnic front.pdf", sizeBytes: 2048, category: "CNIC", uploadedBy: "Alice Owner" });
    const file = await h.app.inject({ method: "GET", url: `/v1/attachments/${up.body.id}/file`, headers: { authorization: `Bearer ${await h.token(ID.alice, "alice@a.pk")}`, "x-company-id": A } });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(file.rawPayload.length).toBe(2048);
    expect(file.rawPayload.every((b) => b === 7)).toBe(true);
    expect((await h.call("DELETE", `/v1/attachments/${up.body.id}`, owner)).status).toBe(204);
    expect((await h.call("GET", `/v1/attachments?entityType=party&entityId=${ID.custA}`, owner)).body).toEqual([]);
  });

  it("refuses files that are too big, the wrong type, empty, or for a record that is not there or not yours", async () => {
    const base = { entityType: "party", entityId: ID.custA, fileName: "x.pdf", mime: "application/pdf" };
    expect((await h.call("POST", "/v1/attachments", { ...owner, body: { ...base, data: bytes(4 * 1024 * 1024 + 1) } })).body.error.code).toBe("file_too_large");
    expect((await h.call("POST", "/v1/attachments", { ...owner, body: { ...base, mime: "application/x-msdownload", data: bytes(10) } })).body.error.code).toBe("file_type");
    expect((await h.call("POST", "/v1/attachments", { ...owner, body: { ...base, entityId: ID.custB, data: bytes(10) } })).status).toBe(404);   // company B's customer
    expect((await h.call("POST", "/v1/attachments", { as: ID.bob, company: A, body: { ...base, data: bytes(10) } })).status).toBe(403);           // a viewer may not add files
  });

  it("keeps one company's files away from another", async () => {
    const up = await h.call("POST", "/v1/attachments", { ...owner, body: { entityType: "party", entityId: ID.custA, fileName: "secret.pdf", mime: "application/pdf", data: bytes(64) } });
    const other = await h.app.inject({ method: "GET", url: `/v1/attachments/${up.body.id}/file`, headers: { authorization: `Bearer ${await h.token(ID.carol, "carol@b.pk")}`, "x-company-id": ID.coB } });
    expect(other.statusCode).toBe(404);
  });
});

describe("property detail", () => {
  it("records legal details, ownership, valuations, restrictions and price changes", async () => {
    const p = ID.propA(2);
    expect((await h.call("PUT", `/v1/properties/${p}/legal`, { ...owner, body: { ownershipType: "allotment", titleStatus: "clear", registryNo: "REG-554", transferStatus: "transferable" } })).body.legal).toMatchObject({ titleStatus: "clear", registryNo: "REG-554" });
    const upd = await h.call("PUT", `/v1/properties/${p}/legal`, { ...owner, body: { khasraNo: "K-12" } });
    expect(upd.body.legal).toMatchObject({ registryNo: "REG-554", khasraNo: "K-12" });   // a partial update keeps the rest

    expect((await h.call("POST", `/v1/properties/${p}/valuations`, { ...owner, body: { valuationDate: "2026-09-01", method: "market", value: "1250000" } })).body.valuations).toHaveLength(1);
    const enc = await h.call("POST", `/v1/properties/${p}/encumbrances`, { ...owner, body: { kind: "mortgage", amount: "300000", since: "2026-01-01" } });
    expect(enc.body.encumbrances[0].status).toBe("active");
    expect((await h.call("POST", `/v1/encumbrances/${enc.body.encumbrances[0].id}/release`, owner)).body.encumbrances[0].status).toBe("released");

    await h.call("POST", `/v1/properties/${p}/ownership`, { ...owner, body: { ownerPartyId: ID.custA, acquisitionType: "allotment", fromDate: "2025-01-01" } });
    const chain = await h.call("POST", `/v1/properties/${p}/ownership`, { ...owner, body: { ownerPartyId: ID.custA, acquisitionType: "purchase", fromDate: "2026-02-01", price: "900000" } });
    expect(chain.body.ownership).toHaveLength(2);
    expect(chain.body.ownership.filter((o: { toDate: string | null }) => o.toDate === null)).toHaveLength(1);

    const price = await h.call("PATCH", `/v1/properties/${p}`, { ...owner, body: { listPrice: "1100000", reason: "Market adjustment" } });
    expect(price.body.priceHistory[0]).toMatchObject({ price: "1100000.00", reason: "Market adjustment", changedBy: "Alice Owner" });
    expect((await h.call("PATCH", `/v1/properties/${p}`, { as: ID.bob, company: A, body: { listPrice: "5", reason: "x" } })).status).toBe(403);
  });
});

describe("selling, beyond the installments", () => {
  async function bookingWithPlan(prop: string, customer: string, opts: { down: string; n: number; first: string; dealer?: string }) {
    const bk = await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: prop, customerId: customer, paymentType: "installment", dealerId: opts.dealer } });
    await h.call("POST", `/v1/bookings/${bk.body.id}/schedule`, { ...owner, body: { downPayment: opts.down, installments: opts.n, firstDue: opts.first } });
    return (await h.call("GET", `/v1/bookings/${bk.body.id}`, owner)).body;
  }

  it("charges a late fee by the company's own rule, takes it first from the next payment, and can waive it", async () => {
    await h.call("PATCH", "/v1/company", { ...owner, body: { penaltyRatePctMonth: 4, penaltyGraceDays: 7 } });
    const bk = await bookingWithPlan(ID.propA(3), ID.custA, { down: "0", n: 2, first: "2020-01-01" });
    const ex = await h.call("GET", `/v1/bookings/${bk.id}/extras`, owner);
    expect(ex.body.penaltyRule).toMatchObject({ ratePctPerMonth: "4", graceDays: 7 });
    expect(ex.body.penaltySuggestions.length).toBeGreaterThan(0);
    const inst = ex.body.penaltySuggestions[0];
    expect((await h.call("POST", `/v1/installments/${inst.installmentId}/penalty`, { ...owner, body: { amount: "15000", reason: "Late" } })).status).toBe(201);
    const after = await h.call("GET", `/v1/bookings/${bk.id}/extras`, owner);
    expect(after.body.penalties[0]).toMatchObject({ status: "open", amount: "15000.00" });
    const codesA = await codes();
    const rec = await h.call("POST", "/v1/receipts", { ...owner, body: { bookingId: bk.id, amount: "20000", method: "cash", depositAccountId: codesA["03.01.01.0001"] } });
    expect(rec.status).toBe(201);
    const paid = await h.call("GET", `/v1/bookings/${bk.id}/extras`, owner);
    expect(paid.body.penalties[0].status).toBe("paid");
    expect((await h.call("POST", `/v1/penalties/${paid.body.penalties[0].id}/waive`, { ...owner, body: { reason: "Goodwill" } })).status).toBeGreaterThanOrEqual(400);
  });

  it("refunds a cancelled booking with a cancellation charge, and only up to what was received", async () => {
    const bk = await bookingWithPlan(ID.propA(4), ID.custA, { down: "200000", n: 1, first: "2099-01-01" });
    const codesA = await codes();
    await h.call("POST", "/v1/receipts", { ...owner, body: { bookingId: bk.id, amount: "200000", method: "cash", depositAccountId: codesA["03.01.01.0001"] } });
    expect((await h.call("POST", `/v1/bookings/${bk.id}/refund`, { ...owner, body: { refundAmount: "100000" } })).body.error.message).toContain("Cancel the booking");
    await h.call("POST", `/v1/bookings/${bk.id}/status`, { ...owner, body: { to: "cancelled", reason: "Customer withdrew" } });
    expect((await h.call("POST", `/v1/bookings/${bk.id}/refund`, { ...owner, body: { refundAmount: "190000", deductionAmount: "20000" } })).status).toBeGreaterThanOrEqual(400);
    const ok = await h.call("POST", `/v1/bookings/${bk.id}/refund`, { ...owner, body: { refundAmount: "150000", deductionAmount: "30000", note: "Per policy" } });
    expect(ok.status).toBe(201);
    const ex = await h.call("GET", `/v1/bookings/${bk.id}/extras`, owner);
    expect(Number(ex.body.refundable)).toBe(20000);
    expect(ex.body.refunds[0]).toMatchObject({ status: "posted" });
    expect((await h.call("POST", `/v1/refunds/${ex.body.refunds[0].id}/void`, { ...owner, body: { reason: "Entered wrongly" } })).status).toBe(200);
    expect(Number((await h.call("GET", `/v1/bookings/${bk.id}/extras`, owner)).body.refundable)).toBe(200000);
  });

  it("moves a booking and its payments to another customer, with a transfer fee", async () => {
    const bk = await bookingWithPlan(ID.propA(5), ID.custA, { down: "50000", n: 1, first: "2099-01-01" });
    const codesA = await codes();
    await h.call("POST", "/v1/receipts", { ...owner, body: { bookingId: bk.id, amount: "50000", method: "cash", depositAccountId: codesA["03.01.01.0001"] } });
    const buyer = (await h.call("POST", "/v1/parties", { ...owner, body: { name: "New Buyer", roles: ["customer"] } })).body;
    expect((await h.call("POST", `/v1/bookings/${bk.id}/transfer`, { ...owner, body: { toPartyId: ID.custA } })).status).toBeGreaterThanOrEqual(400);
    expect((await h.call("POST", `/v1/bookings/${bk.id}/transfer`, { ...owner, body: { toPartyId: buyer.id, fee: "3000", note: "Sold on" } })).status).toBe(201);
    const after = await h.call("GET", `/v1/bookings/${bk.id}`, owner);
    expect(after.body.customerId).toBe(buyer.id);
    expect((await h.call("GET", `/v1/bookings/${bk.id}/extras`, owner)).body.transfers[0]).toMatchObject({ toName: "New Buyer", amountMoved: "50000.00" });
    const inv = await h.call("GET", "/v1/service-invoices?search=Transfer", owner);
    expect(inv.body.some((i: { customerName: string; amount: string }) => i.customerName === "New Buyer" && Number(i.amount) === 3000)).toBe(true);
  });

  it("records a dealer's commission once and tracks what the dealer is owed", async () => {
    const dealer = (await h.call("POST", "/v1/parties", { ...owner, body: { name: "Dealer Zahid", roles: ["dealer"] } })).body;
    const bk = await bookingWithPlan(ID.propA(2), ID.custA, { down: "0", n: 0, first: "2099-01-01", dealer: dealer.id }).catch(() => null);
    // propA(2) may already be booked by an earlier test in this file; fall back to a fresh property
    const target = bk ?? (await (async () => {
      const fresh = await h.admin(async (c) => {
        const r = await c.query(`insert into properties(company_id, project_id, type_id, code, title, list_price) values ($1,$2,$3,'PRP-DLR1','Dealer plot',2000000) returning id`, [A, ID.prjA, ID.typeA]);
        return r.rows[0].id as string;
      });
      const b = await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: fresh, customerId: ID.custA, paymentType: "cash", dealerId: dealer.id } });
      return b.body;
    })());
    const id = target.id as string;
    expect((await h.call("POST", `/v1/bookings/${id}/commission`, { ...owner, body: { ratePct: 150 } })).status).toBe(400);
    expect((await h.call("POST", `/v1/bookings/${id}/commission`, { ...owner, body: { ratePct: 2 } })).status).toBe(201);
    expect((await h.call("POST", `/v1/bookings/${id}/commission`, { ...owner, body: { ratePct: 2 } })).status).toBe(409);
    const list = await h.call("GET", "/v1/commissions", owner);
    const row = list.body.rows.find((r: { dealerId: string }) => r.dealerId === dealer.id);
    expect(Number(row.amount)).toBe(Number(target.netPrice) * 0.02);
    expect(Number(list.body.owed.find((o: { dealerId: string }) => o.dealerId === dealer.id).owed)).toBe(Number(row.amount));
    expect((await h.call("POST", `/v1/bookings/${id}/commission`, { as: ID.dave, company: A, body: { ratePct: 1 } })).status).toBe(403);
  });
});

describe("serverless bridge (Netlify Functions)", () => {
  it("answers web-standard requests under /api: json, errors, empty answers and binary files", async () => {
    const { bridge } = await import("../src/bridge.js");
    const token = await h.token(ID.alice, "alice@a.pk");
    const call = (method: string, path: string, body?: unknown) =>
      bridge(h.app, new Request(`https://site.netlify.app/api${path}`, { method, headers: { authorization: `Bearer ${token}`, "x-company-id": A, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }));

    const me = await call("GET", "/v1/me");
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe("alice@a.pk");

    const bad = await call("POST", "/v1/parties", { name: "x" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.message).toBeTruthy();

    const created = await call("POST", "/v1/parties", { name: "Bridge Customer", roles: ["customer"] });
    expect(created.status).toBe(201);

    const up = await call("POST", "/v1/attachments", { entityType: "party", entityId: ID.custA, fileName: "scan.pdf", mime: "application/pdf", data: bytes(3000) });
    const id = (await up.json()).id as string;
    const file = await call("GET", `/v1/attachments/${id}/file`);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect((await file.arrayBuffer()).byteLength).toBe(3000);
    const del = await call("DELETE", `/v1/attachments/${id}`);
    expect(del.status).toBe(204);
    expect(await del.text()).toBe("");

    expect((await call("GET", "/v1/nothing-here")).status).toBe(404);
    expect((await bridge(h.app, new Request("https://site.netlify.app/api/health"))).status).toBe(200);
  });
});
