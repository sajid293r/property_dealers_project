import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, paging, parse } from "../http.js";
import { AppError } from "../errors.js";
import { protectCnic, type CnicKeys } from "../cnic.js";

const ROLES = ["customer", "vendor", "contractor", "dealer", "employee", "lead", "investor", "landowner"] as const;

// The balance is what the customer owes (positive) or what we owe a supplier (negative), straight from the ledger.
const PARTY_SELECT = `
  select p.id, p.display_name as "name", p.legal_name as "legalName", p.kind, p.phone_e164 as "phone", p.email, p.city, p.address,
         p.ntn, p.cnic_last4 as "cnicLast4", p.notes, p.created_at as "createdAt",
         coalesce((select array_agg(r.role order by r.role) from party_roles r where r.party_id = p.id), '{}') as roles,
         coalesce((select sum(l.debit - l.credit) from journal_lines l join gl_accounts a on a.id = l.account_id
                    where l.party_id = p.id and a.category in ('asset_receivable','liability_payable','liability_current')), 0) as "balance"
    from parties p`;

/** Pakistani mobile numbers are stored as +923XXXXXXXXX so the same person is never entered twice. */
export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^\d+]/g, "");
  let n = d.startsWith("+") ? d.slice(1) : d;
  if (n.startsWith("0092")) n = n.slice(2);
  if (n.startsWith("0")) n = "92" + n.slice(1);
  if (!/^\d{10,13}$/.test(n)) throw new AppError(400, "invalid_phone", "That phone number doesn't look right (for example 0300-1234567).");
  return "+" + n;
}

async function loadParty(c: Queryable, id: string) {
  const r = await c.query(`${PARTY_SELECT} where p.id = $1 and p.deleted_at is null`, [id]);
  if (!r.rows[0]) throw new AppError(404, "not_found", "Not found.");
  return r.rows[0];
}

/** Customers, suppliers, dealers: one address book where a person can hold several roles. */
export function partyRoutes(app: FastifyInstance, db: Db, guards: Guards, cnic: CnicKeys | null) {
  app.get("/v1/parties", { preHandler: guards.inCompany("customers.view") }, async (req) => {
    const q = parse(paging.extend({ role: z.enum(ROLES).optional(), search: z.string().trim().min(1).max(80).optional() }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `${PARTY_SELECT}
          where p.deleted_at is null
            and ($1::text is null or exists (select 1 from party_roles r where r.party_id = p.id and r.role = $1))
            and ($2::text is null or p.display_name ilike '%' || $2 || '%' or p.phone_e164 like '%' || $2 || '%' or p.cnic_last4 = $2)
          order by p.display_name limit $3 offset $4`,
        [q.role ?? null, q.search ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.get("/v1/parties/:id", { preHandler: guards.inCompany("customers.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => loadParty(c, id));
  });

  app.post("/v1/parties", { preHandler: guards.inCompany("customers.create") }, async (req, reply) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(160),
        legalName: z.string().trim().max(200).optional(),
        kind: z.enum(["person", "organization"]).default("person"),
        roles: z.array(z.enum(ROLES)).min(1).default(["customer"]),
        cnic: z.string().trim().max(20).optional(),
        ntn: z.string().trim().max(30).optional(),
        phone: z.string().trim().max(30).optional(),
        email: z.string().trim().email().max(160).optional(),
        city: z.string().trim().max(80).optional(),
        address: z.string().trim().max(300).optional(),
        notes: z.string().trim().max(1000).optional(),
      }),
      req.body,
    );
    const protectedCnic = body.cnic ? protectCnic(body.cnic, cnic) : null;
    const phone = normalizePhone(body.phone);
    const ctx = ctxOf(req);
    const party = await db.inTenant(ctx, async (c) => {
      if (phone) {
        const dup = await c.query(`select display_name from parties where phone_e164 = $1 and deleted_at is null limit 1`, [phone]);
        if (dup.rows[0]) throw new AppError(409, "duplicate_phone", `${dup.rows[0].display_name} already has this phone number.`);
      }
      const r = await c.query<{ id: string }>(
        `insert into parties (company_id, kind, display_name, legal_name, cnic_enc, cnic_hash, cnic_last4, ntn, phone_e164, email, city, address, notes, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [ctx.companyId, body.kind, body.name, body.legalName ?? null, protectedCnic?.cnic_enc ?? null, protectedCnic?.cnic_hash ?? null, protectedCnic?.cnic_last4 ?? null,
         body.ntn ?? null, phone, body.email ?? null, body.city ?? null, body.address ?? null, body.notes ?? null, ctx.userId],
      );
      for (const role of body.roles) {
        await c.query(`insert into party_roles (company_id, party_id, role) values ($1, $2, $3) on conflict do nothing`, [ctx.companyId, r.rows[0]!.id, role]);
      }
      return loadParty(c, r.rows[0]!.id);
    });
    return reply.code(201).send(party);
  });

  app.patch("/v1/parties/:id", { preHandler: guards.inCompany("customers.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(160).optional(),
        phone: z.string().trim().max(30).nullish(),
        email: z.string().trim().email().max(160).nullish(),
        city: z.string().trim().max(80).nullish(),
        address: z.string().trim().max(300).nullish(),
        notes: z.string().trim().max(1000).nullish(),
        addRoles: z.array(z.enum(ROLES)).optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      const phone = body.phone === undefined ? undefined : normalizePhone(body.phone);
      await loadParty(c, id);
      await c.query(
        `update parties set display_name = coalesce($2, display_name), phone_e164 = case when $3::boolean then $4 else phone_e164 end,
                email = case when $5::boolean then $6 else email end, city = case when $7::boolean then $8 else city end,
                address = case when $9::boolean then $10 else address end, notes = case when $11::boolean then $12 else notes end
          where id = $1`,
        [id, body.name ?? null, phone !== undefined, phone ?? null, body.email !== undefined, body.email ?? null, body.city !== undefined, body.city ?? null,
         body.address !== undefined, body.address ?? null, body.notes !== undefined, body.notes ?? null],
      );
      for (const role of body.addRoles ?? []) {
        await c.query(`insert into party_roles (company_id, party_id, role) values ($1, $2, $3) on conflict do nothing`, [ctx.companyId, id, role]);
      }
      return loadParty(c, id);
    });
  });

  // A customer's or supplier's statement of account: every entry on their receivable / payable accounts, with a running balance.
  app.get("/v1/parties/:id/statement", { preHandler: guards.inCompany("customers.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const q = parse(z.object({ from: isoDate.default("2000-01-01"), to: isoDate.default("2999-12-31") }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const party = await loadParty(c, id);
      const opening = await c.query(`select app.party_opening($1, $2::date) as o`, [id, q.from]);
      const lines = await c.query(
        `select entry_date as "date", entry_no as "number", source_type as "sourceType", source_id as "sourceId", account_code as "accountCode",
                account_name as "accountName", description, debit, credit, running_balance as "balance"
           from app.party_ledger($1, $2::date, $3::date)`,
        [id, q.from, q.to],
      );
      return { party, from: q.from, to: q.to, openingBalance: opening.rows[0].o, lines: lines.rows };
    });
  });
}

