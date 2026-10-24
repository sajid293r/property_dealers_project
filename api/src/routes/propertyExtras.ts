import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

async function assertProperty(c: Queryable, id: string) {
  const r = await c.query(`select 1 from properties where id = $1 and deleted_at is null`, [id]);
  if (!r.rows[0]) throw new AppError(404, "not_found", "Property not found.");
}

async function detail(c: Queryable, id: string) {
  await assertProperty(c, id);
  const legal = await c.query(
    `select ownership_type as "ownershipType", title_status as "titleStatus", registry_no as "registryNo", fard_no as "fardNo", khasra_no as "khasraNo", allotment_no as "allotmentNo",
            allotment_date as "allotmentDate", mutation_status as "mutationStatus", noc_status as "nocStatus", transfer_status as "transferStatus", lease_start as "leaseStart",
            lease_end as "leaseEnd", ground_rent as "groundRent", legal_notes as "legalNotes", verified_on as "verifiedOn", u.full_name as "verifiedBy"
       from property_legal l left join users u on u.id = l.verified_by where l.property_id = $1`,
    [id],
  );
  const ownership = await c.query(
    `select o.id, o.owner_party_id as "ownerPartyId", p.display_name as "ownerName", o.acquisition_type as "acquisitionType", o.from_date as "fromDate", o.to_date as "toDate", o.price, o.deed_ref as "deedRef"
       from property_ownership_history o join parties p on p.id = o.owner_party_id where o.property_id = $1 order by o.from_date desc, o.to_date nulls first`,
    [id],
  );
  const enc = await c.query(
    `select e.id, e.kind, e.holder_party_id as "holderPartyId", p.display_name as "holderName", e.amount, e.since, e.released_on as "releasedOn", e.status, e.notes
       from property_encumbrances e left join parties p on p.id = e.holder_party_id where e.property_id = $1 order by e.since desc`,
    [id],
  );
  const val = await c.query(`select id, valuation_date as "valuationDate", method, value, notes from property_valuations where property_id = $1 order by valuation_date desc`, [id]);
  const price = await c.query(
    `select h.price, h.effective_from as "effectiveFrom", u.full_name as "changedBy", h.reason from property_price_history h left join users u on u.id = h.changed_by where h.property_id = $1 order by h.effective_from desc limit 30`,
    [id],
  );
  const booking = await c.query(
    `select b.id, b.booking_no as "bookingNo", b.status, p.display_name as "customerName", b.net_price as "netPrice", b.booking_date as "bookingDate"
       from bookings b join parties p on p.id = b.customer_id where b.property_id = $1 and b.status in ('pending','confirmed','completed') limit 1`,
    [id],
  );
  return { legal: legal.rows[0] ?? null, ownership: ownership.rows, encumbrances: enc.rows, valuations: val.rows, priceHistory: price.rows, currentBooking: booking.rows[0] ?? null };
}

const legalBody = z.object({
  ownershipType: z.enum(["freehold", "leasehold", "allotment", "power_of_attorney", "file"]).nullable().optional(),
  titleStatus: z.enum(["clear", "under_verification", "disputed"]).nullable().optional(),
  registryNo: z.string().trim().max(60).nullable().optional(),
  fardNo: z.string().trim().max(60).nullable().optional(),
  khasraNo: z.string().trim().max(60).nullable().optional(),
  allotmentNo: z.string().trim().max(60).nullable().optional(),
  allotmentDate: isoDate.nullable().optional(),
  mutationStatus: z.string().trim().max(60).nullable().optional(),
  nocStatus: z.string().trim().max(60).nullable().optional(),
  transferStatus: z.enum(["transferable", "restricted", "transferred"]).nullable().optional(),
  leaseStart: isoDate.nullable().optional(),
  leaseEnd: isoDate.nullable().optional(),
  groundRent: money.nullable().optional(),
  legalNotes: z.string().trim().max(1000).nullable().optional(),
});

export function propertyExtraRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/properties/:id/detail", { preHandler: guards.inCompany("inventory.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => detail(c, id));
  });

  app.put("/v1/properties/:id/legal", { preHandler: guards.inCompany("inventory.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(legalBody, req.body);
    const ctx = ctxOf(req);
    const cols: Record<string, string> = {
      ownershipType: "ownership_type", titleStatus: "title_status", registryNo: "registry_no", fardNo: "fard_no", khasraNo: "khasra_no", allotmentNo: "allotment_no", allotmentDate: "allotment_date",
      mutationStatus: "mutation_status", nocStatus: "noc_status", transferStatus: "transfer_status", leaseStart: "lease_start", leaseEnd: "lease_end", groundRent: "ground_rent", legalNotes: "legal_notes",
    };
    const keys = Object.keys(cols).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    return db.inTenant(ctx, async (c) => {
      await assertProperty(c, id);
      await c.query(`insert into property_legal (company_id, property_id) values ($1, $2) on conflict (property_id) do nothing`, [ctx.companyId, id]);
      if (keys.length) {
        const vals: unknown[] = [id, ...keys.map((k) => (b as Record<string, unknown>)[k])];
        await c.query(`update property_legal set ${keys.map((k, i) => `${cols[k]} = $${i + 2}`).join(", ")} where property_id = $1`, vals);
      }
      return detail(c, id);
    });
  });

  app.post("/v1/properties/:id/valuations", { preHandler: guards.inCompany("inventory.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ valuationDate: isoDate, method: z.enum(["market", "bank", "internal"]), value: money, notes: z.string().trim().max(300).optional() }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      await assertProperty(c, id);
      await c.query(`insert into property_valuations (company_id, property_id, valuation_date, method, value, notes) values ($1,$2,$3,$4,$5,$6)`, [ctx.companyId, id, b.valuationDate, b.method, b.value, b.notes ?? null]);
      return detail(c, id);
    });
    return reply.code(201).send(out);
  });

  app.post("/v1/properties/:id/encumbrances", { preHandler: guards.inCompany("inventory.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ kind: z.enum(["mortgage", "lien", "court_stay", "litigation", "tenancy_right"]), holderPartyId: uuid.optional(), amount: money.optional(), since: isoDate, notes: z.string().trim().max(300).optional() }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      await assertProperty(c, id);
      await c.query(`insert into property_encumbrances (company_id, property_id, kind, holder_party_id, amount, since, notes) values ($1,$2,$3,$4,$5,$6,$7)`, [ctx.companyId, id, b.kind, b.holderPartyId ?? null, b.amount ?? null, b.since, b.notes ?? null]);
      return detail(c, id);
    });
    return reply.code(201).send(out);
  });

  app.post("/v1/encumbrances/:id/release", { preHandler: guards.inCompany("inventory.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query<{ property_id: string }>(`update property_encumbrances set status = 'released', released_on = current_date where id = $1 and status = 'active' returning property_id`, [id]);
      if (!r.rows[0]) throw new AppError(409, "not_active", "This restriction is already released.");
      return detail(c, r.rows[0].property_id);
    });
  });

  // chain of title: a new owner closes the current row and opens the next
  app.post("/v1/properties/:id/ownership", { preHandler: guards.inCompany("inventory.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ ownerPartyId: uuid, acquisitionType: z.enum(["purchase", "inheritance", "gift", "allotment", "transfer"]), fromDate: isoDate, price: money.optional(), deedRef: z.string().trim().max(60).optional() }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      await assertProperty(c, id);
      await c.query(`update property_ownership_history set to_date = $2 where property_id = $1 and to_date is null`, [id, b.fromDate]);
      await c.query(`insert into property_ownership_history (company_id, property_id, owner_party_id, acquisition_type, from_date, price, deed_ref) values ($1,$2,$3,$4,$5,$6,$7)`, [ctx.companyId, id, b.ownerPartyId, b.acquisitionType, b.fromDate, b.price ?? null, b.deedRef ?? null]);
      return detail(c, id);
    });
    return reply.code(201).send(out);
  });

  // a new list price is kept with who changed it and why
  app.patch("/v1/properties/:id", { preHandler: guards.inCompany("inventory.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ listPrice: money, reason: z.string().trim().min(3).max(200) }), req.body);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      const cur = await c.query<{ list_price: string }>(`select list_price from properties where id = $1 and deleted_at is null`, [id]);
      if (!cur.rows[0]) throw new AppError(404, "not_found", "Property not found.");
      if (Number(cur.rows[0].list_price) === Number(b.listPrice)) return detail(c, id);
      await c.query(`update properties set list_price = $2 where id = $1`, [id, b.listPrice]);
      await c.query(`insert into property_price_history (company_id, property_id, price, changed_by, reason) values ($1,$2,$3,$4,$5)`, [ctx.companyId, id, b.listPrice, ctx.userId, b.reason]);
      return detail(c, id);
    });
  });
}
