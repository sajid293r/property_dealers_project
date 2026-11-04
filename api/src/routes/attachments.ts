import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";
import { bookingInScope, requireBooking } from "../scope.js";
import type { Queryable } from "../db.js";

// 4 MB keeps an upload (sent as base64, about a third bigger) under the 6 MB request limit of serverless hosts such as Netlify
const MAX_BYTES = 4 * 1024 * 1024;

/** What an attachment can hang off, the table to check it exists in, and the permission area that governs it. */
const ENTITIES = {
  party: { table: "parties", module: "customers" },
  property: { table: "properties", module: "inventory" },
  project: { table: "projects", module: "inventory" },
  booking: { table: "bookings", module: "deals" },
  voucher: { table: "vouchers", module: "accounts" },
  contract: { table: "contracts", module: "contracts" },
  cheque: { table: "cheques", module: "deals" },
  quotation: { table: "quotations", module: "crm" },
  lead: { table: "leads", module: "crm" },
  employee: { table: "employees", module: "staff" },
  construction_contract: { table: "construction_contracts", module: "contractors" },
} as const;
type EntityType = keyof typeof ENTITIES;

const ALLOWED_MIME = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/**
 * What the file really is, judged from its first bytes, not from its name or the type the browser announced (a program
 * renamed to .pdf announces "application/pdf" just as well). A kind is only returned when the bytes carry that kind's signature.
 */
type Kind = "pdf" | "jpeg" | "png" | "webp" | "heic" | "zip" | "ole" | "text";
export function sniffKind(b: Buffer): Kind | null {
  const starts = (sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp"; // RIFF....WEBP
  if (starts([0x66, 0x74, 0x79, 0x70], 4)) return "heic"; // ....ftyp
  if (starts([0x50, 0x4b, 0x03, 0x04])) return "zip"; // docx and xlsx are zip packages
  if (starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole"; // old .doc / .xls
  // plain text and CSV: no NUL byte and no stray control characters in the first 8 KB
  const head = b.subarray(0, 8192);
  if (head.length > 0 && !head.some((v) => v === 0 || (v < 32 && v !== 9 && v !== 10 && v !== 13 && v !== 12))) return "text";
  return null;
}
const KINDS_FOR_MIME: Record<string, Kind[]> = {
  "application/pdf": ["pdf"], "image/jpeg": ["jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/heic": ["heic"],
  "text/plain": ["text"], "text/csv": ["text"],
  "application/msword": ["ole"],
  "application/vnd.ms-excel": ["ole", "text"], // old .xls, and the .csv that Windows announces as Excel
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["zip"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["zip"],
};

const entityEnum = z.enum(Object.keys(ENTITIES) as [EntityType, ...EntityType[]]);

function need(ctx: { permissions: string[] }, type: EntityType, action: "view" | "edit") {
  const p = `${ENTITIES[type].module}.${action}`;
  if (!ctx.permissions.includes(p)) throw new AppError(403, "not_permitted", `Your role does not allow this (${p}).`);
}

/** Files follow the record they hang off: a Sales Agent sees files of their own bookings, cheques, quotations and leads only. */
async function requireEntityInScope(c: Queryable, type: EntityType, id: string): Promise<void> {
  const q = {
    booking: null,
    cheque: `select 1 from cheques c left join bookings b on b.id = c.booking_id where c.id = $1 and (case when c.booking_id is not null then ${bookingInScope()} else app.user_in_scope('deals', c.created_by) end)`,
    quotation: `select 1 from quotations q where q.id = $1 and app.user_in_scope('crm', q.created_by)`,
    lead: `select 1 from leads l where l.id = $1 and app.user_in_scope('crm', coalesce(l.assigned_to, l.created_by))`,
  } as Partial<Record<EntityType, string | null>>;
  if (type === "booking") return requireBooking(c, id);
  const sql = q[type];
  if (!sql) return;
  if (!(await c.query(sql, [id])).rows[0]) throw new AppError(404, "not_found", "The record this file belongs to does not exist.");
}

export function attachmentRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/attachments", { preHandler: guards.inCompany() }, async (req) => {
    const q = parse(z.object({ entityType: entityEnum, entityId: uuid }), req.query);
    const ctx = ctxOf(req);
    need(ctx, q.entityType, "view");
    return db.inTenant(ctx, async (c) => {
      await requireEntityInScope(c, q.entityType, q.entityId);
      const r = await c.query(
        `select a.id, a.file_name as "fileName", a.mime, a.size_bytes as "sizeBytes", a.category, a.note, a.created_at as "createdAt", u.full_name as "uploadedBy"
           from attachments a left join users u on u.id = a.uploaded_by where a.entity_type = $1 and a.entity_id = $2 order by a.created_at desc`,
        [q.entityType, q.entityId],
      );
      return r.rows;
    });
  });

  // Files are sent as base64 inside JSON (up to 4 MB of file). Everything is checked here and again by the database.
  app.post("/v1/attachments", { preHandler: guards.inCompany(), bodyLimit: 6 * 1024 * 1024 }, async (req, reply) => {
    const b = parse(
      z.object({
        entityType: entityEnum,
        entityId: uuid,
        fileName: z.string().trim().min(1).max(200),
        mime: z.string().trim().max(120),
        data: z.string().min(4),
        category: z.string().trim().max(60).optional(),
        note: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const ctx = ctxOf(req);
    need(ctx, b.entityType, "edit");
    if (!ALLOWED_MIME.has(b.mime)) throw new AppError(415, "file_type", "This kind of file is not allowed. Use a PDF, a photo (JPG, PNG), a Word or Excel file.");
    const bytes = Buffer.from(b.data, "base64");
    if (bytes.length === 0) throw new AppError(400, "empty_file", "The file is empty.");
    if (bytes.length > MAX_BYTES) throw new AppError(413, "file_too_large", "This file is larger than 4 MB. Compress it or split it and try again.");
    const sha = createHash("sha256").update(bytes).digest("hex");
    const safeName = b.fileName.replace(/[\\/\u0000-\u001f]/g, "_");
    const out = await db.inTenant(ctx, async (c) => {
      await requireEntityInScope(c, b.entityType, b.entityId);
      const exists = await c.query(`select 1 from ${ENTITIES[b.entityType].table} where id = $1`, [b.entityId]);
      if (!exists.rows[0]) throw new AppError(404, "not_found", "The record this file belongs to does not exist.");
      // the file's own first bytes must match what it claims to be (checked after the access checks, so a person who may
      // not touch this record learns nothing from the answer)
      const real = sniffKind(bytes);
      if (!real || !KINDS_FOR_MIME[b.mime]?.includes(real)) {
        throw new AppError(415, "file_type", "This file is not what its name says it is. Use a real PDF, a photo (JPG, PNG), a Word or Excel file.");
      }
      const r = await c.query<{ id: string }>(
        `insert into attachments (company_id, entity_type, entity_id, file_name, mime, size_bytes, sha256, category, note, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [ctx.companyId, b.entityType, b.entityId, safeName, b.mime, bytes.length, sha, b.category ?? null, b.note ?? null, ctx.userId],
      );
      await c.query(`insert into attachment_blobs (attachment_id, company_id, content) values ($1,$2,$3)`, [r.rows[0]!.id, ctx.companyId, bytes]);
      return { id: r.rows[0]!.id, fileName: safeName, sizeBytes: bytes.length };
    });
    return reply.code(201).send(out);
  });

  app.get("/v1/attachments/:id/file", { preHandler: guards.inCompany() }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const ctx = ctxOf(req);
    const row = await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ entity_type: EntityType; entity_id: string; file_name: string; mime: string; content: Buffer }>(
        `select a.entity_type, a.entity_id, a.file_name, a.mime, b.content from attachments a join attachment_blobs b on b.attachment_id = a.id where a.id = $1`,
        [id],
      );
      if (r.rows[0]) await requireEntityInScope(c, r.rows[0].entity_type, r.rows[0].entity_id);
      return r.rows[0];
    });
    if (!row) throw new AppError(404, "not_found", "File not found.");
    need(ctx, row.entity_type, "view");
    const inline = row.mime === "application/pdf" || row.mime.startsWith("image/");
    return reply
      .header("content-type", row.mime)
      .header("content-disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`)
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "private, no-store")
      .send(row.content);
  });

  app.delete("/v1/attachments/:id", { preHandler: guards.inCompany() }, async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const ctx = ctxOf(req);
    await db.inTenant(ctx, async (c) => {
      const r = await c.query<{ entity_type: EntityType; entity_id: string }>(`select entity_type, entity_id from attachments where id = $1`, [id]);
      if (!r.rows[0]) throw new AppError(404, "not_found", "File not found.");
      need(ctx, r.rows[0].entity_type, "edit");
      await requireEntityInScope(c, r.rows[0].entity_type, r.rows[0].entity_id);
      await c.query(`delete from attachments where id = $1`, [id]);
    });
    return reply.code(204).send();
  });
}
