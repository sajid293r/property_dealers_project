import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

const STAGES = ["new", "contacted", "site_visit", "negotiation", "won", "lost"] as const;
const SOURCES = ["walk_in", "phone", "website", "social_media", "referral", "dealer", "exhibition", "other"] as const;

/** +92… phone numbers are the only form the address book de-duplicates on; anything else is kept as typed on the lead. */
function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/[\s\-()]/g, "");
  if (/^\+92[0-9]{10}$/.test(d)) return d;
  if (/^0[0-9]{10}$/.test(d)) return "+92" + d.slice(1);
  if (/^92[0-9]{10}$/.test(d)) return "+" + d;
  if (/^3[0-9]{9}$/.test(d)) return "+92" + d;
  return null;
}

const LEAD_COLUMNS = `l.id, l.lead_no as "leadNo", l.name, l.phone, l.email, l.city, l.source, l.stage,
  l.interest_project_id as "interestProjectId", pr.name as "interestProject", l.interest_type as "interestType",
  l.budget_min as "budgetMin", l.budget_max as "budgetMax", l.assigned_to as "assignedTo", u.full_name as "assignedToName",
  l.dealer_id as "dealerId", d.display_name as "dealerName", l.next_followup as "nextFollowup", l.notes, l.lost_reason as "lostReason",
  l.party_id as "partyId", l.created_at as "createdAt", l.updated_at as "updatedAt"`;
const LEAD_FROM = `leads l left join projects pr on pr.id = l.interest_project_id left join users u on u.id = l.assigned_to left join parties d on d.id = l.dealer_id`;
const LEAD_SCOPE = `app.user_in_scope('crm', coalesce(l.assigned_to, l.created_by))`;

async function leadDetail(c: Queryable, id: string) {
  const r = await c.query(`select ${LEAD_COLUMNS} from ${LEAD_FROM} where l.id = $1 and ${LEAD_SCOPE}`, [id]);
  if (!r.rows[0]) throw new AppError(404, "not_found", "Lead not found.");
  const a = await c.query(
    `select a.id, a.kind, a.note, a.activity_at as "at", u.full_name as "by" from lead_activities a left join users u on u.id = a.created_by where a.lead_id = $1 order by a.activity_at desc limit 100`,
    [id],
  );
  return { ...r.rows[0], activities: a.rows };
}

const QUOTE_COLUMNS = `q.id, q.quote_no as "quoteNo", q.lead_id as "leadId", l.name as "leadName", q.party_id as "partyId", p.display_name as "customerName",
  q.property_id as "propertyId", pp.code as "propertyCode", pp.title as "propertyTitle", pr.name as "projectName",
  q.quote_date as "quoteDate", q.valid_until as "validUntil", q.list_price as "listPrice", q.discount, q.net_price as "netPrice",
  q.down_payment as "downPayment", q.installments, q.interval_months as "intervalMonths", q.first_due as "firstDue",
  q.status, q.booking_id as "bookingId", q.notes, q.created_at as "createdAt",
  case when q.status in ('draft','sent') and q.valid_until < current_date then true else false end as expired`;
const QUOTE_FROM = `quotations q left join leads l on l.id = q.lead_id left join parties p on p.id = q.party_id join properties pp on pp.id = q.property_id left join projects pr on pr.id = pp.project_id`;

export function crmRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  // ───────────────────────────── leads
  app.get("/v1/leads", { preHandler: guards.inCompany("crm.view") }, async (req) => {
    const q = parse(
      paging.extend({ stage: z.enum(STAGES).optional(), search: z.string().trim().max(80).optional(), assignedTo: uuid.optional(), limit: z.coerce.number().int().min(1).max(200).default(200) }),
      req.query,
    );
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${LEAD_COLUMNS} from ${LEAD_FROM}
          where ${LEAD_SCOPE} and ($1::text is null or l.stage = $1) and ($2::uuid is null or l.assigned_to = $2)
            and ($3::text is null or l.name ilike '%' || $3 || '%' or l.phone ilike '%' || $3 || '%' or l.lead_no ilike '%' || $3 || '%')
          order by l.created_at desc limit $4 offset $5`,
        [q.stage ?? null, q.assignedTo ?? null, q.search ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.get("/v1/leads/:id", { preHandler: guards.inCompany("crm.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => leadDetail(c, id));
  });

  app.post("/v1/leads", { preHandler: guards.inCompany("crm.create") }, async (req, reply) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(30).optional(),
        email: z.string().trim().email().max(120).optional(),
        city: z.string().trim().max(60).optional(),
        source: z.enum(SOURCES).default("walk_in"),
        interestProjectId: uuid.optional(),
        interestType: z.string().trim().max(60).optional(),
        budgetMin: money.optional(),
        budgetMax: money.optional(),
        assignedTo: uuid.optional(),
        dealerId: uuid.optional(),
        nextFollowup: isoDate.optional(),
        notes: z.string().trim().max(1000).optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const phone = b.phone ? normalizePhone(b.phone) ?? b.phone : null;
      const r = await c.query<{ id: string }>(
        `insert into leads (company_id, lead_no, name, phone, email, city, source, interest_project_id, interest_type, budget_min, budget_max, assigned_to, dealer_id, next_followup, notes, created_by)
         values ($1, app.next_doc_no($1, 'LEAD'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
        [ctx.companyId, b.name, phone, b.email ?? null, b.city ?? null, b.source, b.interestProjectId ?? null, b.interestType ?? null, b.budgetMin ?? null, b.budgetMax ?? null,
         b.assignedTo ?? ctx.userId, b.dealerId ?? null, b.nextFollowup ?? null, b.notes ?? null, ctx.userId],
      );
      return leadDetail(c, r.rows[0]!.id);
    });
    return reply.code(201).send(out);
  });

  app.patch("/v1/leads/:id", { preHandler: guards.inCompany("crm.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(
      z.object({
        name: z.string().trim().min(2).max(120).optional(),
        phone: z.string().trim().max(30).nullable().optional(),
        email: z.string().trim().email().max(120).nullable().optional(),
        city: z.string().trim().max(60).nullable().optional(),
        interestProjectId: uuid.nullable().optional(),
        interestType: z.string().trim().max(60).nullable().optional(),
        budgetMin: money.nullable().optional(),
        budgetMax: money.nullable().optional(),
        assignedTo: uuid.nullable().optional(),
        nextFollowup: isoDate.nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      }),
      req.body,
    );
    const cols: Record<string, string> = {
      name: "name", phone: "phone", email: "email", city: "city", interestProjectId: "interest_project_id", interestType: "interest_type",
      budgetMin: "budget_min", budgetMax: "budget_max", assignedTo: "assigned_to", nextFollowup: "next_followup", notes: "notes",
    };
    const sets: string[] = [];
    const vals: unknown[] = [id];
    for (const [k, col] of Object.entries(cols)) {
      const v = (b as Record<string, unknown>)[k];
      if (v === undefined) continue;
      vals.push(k === "phone" && typeof v === "string" ? normalizePhone(v) ?? v : v);
      sets.push(`${col} = $${vals.length}`);
    }
    return db.inTenant(ctxOf(req), async (c) => {
      if (sets.length) await c.query(`update leads set ${sets.join(", ")} where id = $1`, vals);
      return leadDetail(c, id);
    });
  });

  // Move a lead along the pipeline. Losing one needs a reason; every move is written to its history.
  app.post("/v1/leads/:id/stage", { preHandler: guards.inCompany("crm.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ stage: z.enum(["new", "contacted", "site_visit", "negotiation", "lost"]), reason: z.string().trim().min(3).max(300).optional() }), req.body);
    if (b.stage === "lost" && !b.reason) throw new AppError(400, "reason_required", "Please say why this lead was lost.");
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      const cur = await c.query<{ stage: string; party_id: string | null }>(`select stage, party_id from leads l where l.id = $1 and ${LEAD_SCOPE}`, [id]);
      if (!cur.rows[0]) throw new AppError(404, "not_found", "Lead not found.");
      if (cur.rows[0].stage === "won") throw new AppError(409, "already_won", "This lead is already a customer.");
      await c.query(`update leads set stage = $2, lost_reason = $3 where id = $1`, [id, b.stage, b.stage === "lost" ? b.reason : null]);
      await c.query(`insert into lead_activities (company_id, lead_id, kind, note, created_by) values ($1,$2,'stage_change',$3,$4)`, [
        ctx.companyId, id, `${cur.rows[0].stage} → ${b.stage}${b.reason ? `: ${b.reason}` : ""}`, ctx.userId,
      ]);
      return leadDetail(c, id);
    });
  });

  app.post("/v1/leads/:id/activities", { preHandler: guards.inCompany("crm.edit") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ kind: z.enum(["call", "whatsapp", "meeting", "site_visit", "note"]), note: z.string().trim().min(1).max(500), nextFollowup: isoDate.optional() }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const seen = await c.query(`select 1 from leads l where l.id = $1 and ${LEAD_SCOPE}`, [id]);
      if (!seen.rows[0]) throw new AppError(404, "not_found", "Lead not found.");
      await c.query(`insert into lead_activities (company_id, lead_id, kind, note, created_by) values ($1,$2,$3,$4,$5)`, [ctx.companyId, id, b.kind, b.note, ctx.userId]);
      if (b.nextFollowup) await c.query(`update leads set next_followup = $2 where id = $1`, [id, b.nextFollowup]);
      if (["call", "whatsapp", "meeting", "site_visit"].includes(b.kind)) {
        await c.query(`update leads set stage = case when stage = 'new' then case when $2 = 'site_visit' then 'site_visit' else 'contacted' end else stage end where id = $1`, [id, b.kind]);
      }
      return leadDetail(c, id);
    });
    return reply.code(201).send(out);
  });

  app.post("/v1/leads/:id/convert", { preHandler: guards.inCompany("customers.create") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      const seen = await c.query(`select 1 from leads l where l.id = $1 and ${LEAD_SCOPE}`, [id]);
      if (!seen.rows[0]) throw new AppError(404, "not_found", "Lead not found.");
      await c.query(`select app.convert_lead($1, $2)`, [id, ctx.userId]);
      return leadDetail(c, id);
    });
  });

  app.get("/v1/leads-summary", { preHandler: guards.inCompany("crm.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select stage, count(*)::int as n from leads l where ${LEAD_SCOPE} group by stage`,
      );
      const due = await c.query(`select count(*)::int as n from leads l where ${LEAD_SCOPE} and stage not in ('won','lost') and next_followup <= current_date`);
      return { byStage: r.rows, followupsDue: due.rows[0].n };
    });
  });

  // ───────────────────────────── quotations
  app.get("/v1/quotations", { preHandler: guards.inCompany("crm.view") }, async (req) => {
    const q = parse(paging.extend({ status: z.enum(["draft", "sent", "accepted", "rejected"]).optional(), search: z.string().trim().max(80).optional(), limit: z.coerce.number().int().min(1).max(200).default(200) }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${QUOTE_COLUMNS} from ${QUOTE_FROM}
          where app.user_in_scope('crm', q.created_by) and ($1::text is null or q.status = $1)
            and ($2::text is null or q.quote_no ilike '%' || $2 || '%' or coalesce(l.name, '') ilike '%' || $2 || '%' or coalesce(p.display_name, '') ilike '%' || $2 || '%' or pp.code ilike '%' || $2 || '%')
          order by q.created_at desc limit $3 offset $4`,
        [q.status ?? null, q.search ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.post("/v1/quotations", { preHandler: guards.inCompany("crm.create") }, async (req, reply) => {
    const b = parse(
      z.object({
        leadId: uuid.optional(),
        partyId: uuid.optional(),
        propertyId: uuid,
        validUntil: isoDate,
        quoteDate: isoDate.optional(),
        listPrice: money.optional(),
        discount: money.default("0"),
        downPayment: money.default("0"),
        installments: z.number().int().min(0).max(600).default(0),
        intervalMonths: z.number().int().min(1).max(24).default(1),
        firstDue: isoDate.optional(),
        notes: z.string().trim().max(1000).optional(),
      }),
      req.body,
    );
    if (!b.leadId && !b.partyId) throw new AppError(400, "validation", "Choose the lead or customer this quotation is for.");
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `insert into quotations (company_id, quote_no, lead_id, party_id, property_id, quote_date, valid_until, list_price, discount, down_payment, installments, interval_months, first_due, notes, created_by)
         select $1, app.next_doc_no($1, 'QUO'), $2, $3, p.id, coalesce($5::date, current_date), $6, coalesce($7::numeric, p.list_price), $8, $9, $10, $11, $12, $13, $14
           from properties p where p.id = $4 returning id`,
        [ctx.companyId, b.leadId ?? null, b.partyId ?? null, b.propertyId, b.quoteDate ?? null, b.validUntil, b.listPrice ?? null, b.discount, b.downPayment, b.installments, b.intervalMonths, b.firstDue ?? null, b.notes ?? null, ctx.userId],
      );
      if (!r.rows[0]) throw new AppError(404, "not_found", "Property not found.");
      const row = await c.query(`select ${QUOTE_COLUMNS} from ${QUOTE_FROM} where q.id = $1`, [r.rows[0].id]);
      return row.rows[0];
    });
    return reply.code(201).send(out);
  });

  app.post("/v1/quotations/:id/status", { preHandler: guards.inCompany("crm.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ to: z.enum(["sent", "rejected"]) }), req.body);
    return db.inTenant(ctxOf(req), async (c) => {
      const cur = await c.query<{ status: string }>(`select status from quotations where id = $1`, [id]);
      if (!cur.rows[0]) throw new AppError(404, "not_found", "Quotation not found.");
      if (cur.rows[0].status === "accepted") throw new AppError(409, "already_accepted", "This quotation was already accepted.");
      await c.query(`update quotations set status = $2 where id = $1`, [id, b.to]);
      const row = await c.query(`select ${QUOTE_COLUMNS} from ${QUOTE_FROM} where q.id = $1`, [id]);
      return row.rows[0];
    });
  });

  // The customer says yes: the property is booked, the lead becomes a customer, the quoted payment plan is built.
  app.post("/v1/quotations/:id/accept", { preHandler: guards.inCompany("deals.create") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      const r = await c.query<{ b: string }>(`select app.accept_quotation($1, $2) as b`, [id, ctx.userId]);
      const row = await c.query(`select ${QUOTE_COLUMNS} from ${QUOTE_FROM} where q.id = $1`, [id]);
      return { ...row.rows[0], bookingId: r.rows[0]!.b };
    });
  });
}
