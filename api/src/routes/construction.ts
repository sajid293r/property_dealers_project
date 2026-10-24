import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Queryable } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, isoDate, money, paging, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

const CONTRACT_COLUMNS = `id, contract_no as "contractNo", contractor_id as "contractorId", contractor_name as "contractorName", project_id as "projectId", project_name as "projectName",
  title, scope, contract_value as "contractValue", retention_pct as "retentionPct", start_date as "startDate", end_date as "endDate", status, closed_on as "closedOn",
  billed, retention_held as "retentionHeld", billed_net as "billedNet", remaining, created_at as "createdAt"`;

const BILL_COLUMNS = `b.id, b.bill_no as "billNo", b.contract_id as "contractId", b.bill_date as "billDate", b.description, b.gross_amount as "grossAmount",
  b.retention_amount as "retentionAmount", b.net_amount as "netAmount", b.status, b.created_at as "createdAt"`;

/** What we still owe a contractor (a positive number): credits less debits on their payable lines, per contract party. */
async function payableByContractor(c: Queryable) {
  const r = await c.query<{ party_id: string; owed: string }>(
    `select l.party_id, sum(l.credit - l.debit) as owed
       from journal_lines l join gl_accounts a on a.id = l.account_id
      where a.code = '02.01.01.0006' and l.party_id is not null group by l.party_id`,
  );
  return new Map(r.rows.map((x) => [x.party_id, Number(x.owed)]));
}

async function contractDetail(c: Queryable, id: string) {
  const r = await c.query(`select ${CONTRACT_COLUMNS} from v_construction_contracts where id = $1`, [id]);
  if (!r.rows[0]) throw new AppError(404, "not_found", "Contract not found.");
  const bills = await c.query(`select ${BILL_COLUMNS} from contractor_bills b where b.contract_id = $1 order by b.bill_date desc, b.created_at desc`, [id]);
  return { ...r.rows[0], bills: bills.rows };
}

export function constructionRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  // Contractors are people in the address book with the "contractor" role; this adds what they are building and what they are owed.
  app.get("/v1/contractors", { preHandler: guards.inCompany("contractors.view") }, async (req) => {
    return db.inTenant(ctxOf(req), async (c) => {
      const people = await c.query(
        `select p.id, p.display_name as name, p.phone_e164 as phone, p.city,
                coalesce(sum(k.contract_value) filter (where k.status <> 'terminated'), 0) as "contractValue",
                count(k.id) filter (where k.status = 'active')::int as "activeContracts"
           from parties p join party_roles r on r.party_id = p.id and r.role = 'contractor'
           left join construction_contracts k on k.contractor_id = p.id
          where p.deleted_at is null group by p.id order by p.display_name`,
      );
      const billed = await c.query(
        `select k.contractor_id as id, coalesce(sum(b.gross_amount), 0) as billed, coalesce(sum(b.retention_amount), 0) as retention
           from construction_contracts k join contractor_bills b on b.contract_id = k.id and b.status = 'approved' group by k.contractor_id`,
      );
      const owed = await payableByContractor(c);
      const bm = new Map(billed.rows.map((x) => [x.id, x]));
      return people.rows.map((p) => ({
        ...p,
        billed: bm.get(p.id)?.billed ?? "0",
        retentionHeld: bm.get(p.id)?.retention ?? "0",
        owed: String(owed.get(p.id) ?? 0),
      }));
    });
  });

  app.get("/v1/construction/contracts", { preHandler: guards.inCompany("contractors.view") }, async (req) => {
    const q = parse(paging.extend({ projectId: uuid.optional(), contractorId: uuid.optional(), status: z.enum(["active", "completed", "terminated"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(200) }), req.query);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(
        `select ${CONTRACT_COLUMNS} from v_construction_contracts
          where ($1::uuid is null or project_id = $1) and ($2::uuid is null or contractor_id = $2) and ($3::text is null or status = $3)
          order by created_at desc limit $4 offset $5`,
        [q.projectId ?? null, q.contractorId ?? null, q.status ?? null, q.limit, q.offset],
      );
      return r.rows;
    });
  });

  app.get("/v1/construction/contracts/:id", { preHandler: guards.inCompany("contractors.view") }, async (req) => {
    const { id } = parse(idParams, req.params);
    return db.inTenant(ctxOf(req), (c) => contractDetail(c, id));
  });

  app.post("/v1/construction/contracts", { preHandler: guards.inCompany("contractors.create") }, async (req, reply) => {
    const b = parse(
      z.object({
        contractorId: uuid,
        projectId: uuid,
        title: z.string().trim().min(3).max(160),
        scope: z.string().trim().max(2000).optional(),
        contractValue: money,
        retentionPct: z.number().min(0).max(30).default(5),
        startDate: isoDate,
        endDate: isoDate.optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ id: string }>(
        `insert into construction_contracts (company_id, contract_no, contractor_id, project_id, title, scope, contract_value, retention_pct, start_date, end_date, created_by)
         values ($1, app.next_doc_no($1, 'CC'), $2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [ctx.companyId, b.contractorId, b.projectId, b.title, b.scope ?? null, b.contractValue, b.retentionPct, b.startDate, b.endDate ?? null, ctx.userId],
      );
      return contractDetail(c, r.rows[0]!.id);
    });
    return reply.code(201).send(out);
  });

  app.post("/v1/construction/contracts/:id/close", { preHandler: guards.inCompany("contractors.edit") }, async (req) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ status: z.enum(["completed", "terminated"]), date: isoDate.optional() }), req.body);
    return db.inTenant(ctxOf(req), async (c) => {
      const r = await c.query(`update construction_contracts set status = $2, closed_on = coalesce($3::date, current_date) where id = $1 and status = 'active' returning id`, [id, b.status, b.date ?? null]);
      if (!r.rows[0]) throw new AppError(409, "not_active", "Only an active contract can be closed.");
      return contractDetail(c, id);
    });
  });

  app.post("/v1/construction/contracts/:id/bills", { preHandler: guards.inCompany("contractors.create") }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const b = parse(z.object({ billDate: isoDate, grossAmount: money, description: z.string().trim().max(300).optional(), retentionAmount: money.optional() }), req.body);
    const ctx = ctxOf(req);
    const out = await db.inTenant(ctx, async (c) => {
      await c.query(`select app.create_contractor_bill($1, $2, $3, $4, $5, $6)`, [id, b.billDate, b.grossAmount, b.description ?? null, b.retentionAmount ?? null, ctx.userId]);
      return contractDetail(c, id);
    });
    return reply.code(201).send(out);
  });

  app.post("/v1/construction/bills/:id/:action", { preHandler: guards.inCompany("contractors.approve") }, async (req) => {
    const { id, action } = parse(z.object({ id: uuid, action: z.enum(["approve", "void"]) }), req.params);
    const b = parse(z.object({ reason: z.string().trim().min(3).max(300).optional(), date: isoDate.optional() }), req.body ?? {});
    const ctx = ctxOf(req);
    return db.inTenant(ctx, async (c) => {
      const bill = await c.query<{ contract_id: string }>(`select contract_id from contractor_bills where id = $1`, [id]);
      if (!bill.rows[0]) throw new AppError(404, "not_found", "Bill not found.");
      if (action === "approve") await c.query(`select app.approve_contractor_bill($1, $2)`, [id, ctx.userId]);
      else {
        if (!b.reason) throw new AppError(400, "reason_required", "Please say why this bill is being voided.");
        await c.query(`select app.void_contractor_bill($1, $2, $3, coalesce($4::date, current_date))`, [id, ctx.userId, b.reason, b.date ?? null]);
      }
      return contractDetail(c, bill.rows[0].contract_id);
    });
  });
}
