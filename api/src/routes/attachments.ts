import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import type { Guards } from "../context.js";
import { ctxOf } from "../context.js";
import { idParams, parse, uuid } from "../http.js";
import { AppError } from "../errors.js";

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

const entityEnum = z.enum(Object.keys(ENTITIES) as [EntityType, ...EntityType[]]);

function need(ctx: { permissions: string[] }, type: EntityType, action: "view" | "edit") {
  const p = `${ENTITIES[type].module}.${action}`;
  if (!ctx.permissions.includes(p)) throw new AppError(403, "not_permitted", `Your role does not allow this (${p}).`);
}

export function attachmentRoutes(app: FastifyInstance, db: Db, guards: Guards) {
  app.get("/v1/attachments", { preHandler: guards.inCompany() }, async (req) => {
    const q = parse(z.object({ entityType: entityEnum, entityId: uuid }), req.query);
    const ctx = ctxOf(req);
    need(ctx, q.entityType, "view");
    return db.inTenant(ctx, async (c) => {
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
      const exists = await c.query(`select 1 from ${ENTITIES[b.entityType].table} where id = $1`, [b.entityId]);
      if (!exists.rows[0]) throw new AppError(404, "not_found", "The record this file belongs to does not exist.");
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
      const r = await c.query<{ entity_type: EntityType; file_name: string; mime: string; content: Buffer }>(
        `select a.entity_type, a.file_name, a.mime, b.content from attachments a join attachment_blobs b on b.attachment_id = a.id where a.id = $1`,
        [id],
      );
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
      const r = await c.query<{ entity_type: EntityType }>(`select entity_type from attachments where id = $1`, [id]);
      if (!r.rows[0]) throw new AppError(404, "not_found", "File not found.");
      need(ctx, r.rows[0].entity_type, "edit");
      await c.query(`delete from attachments where id = $1`, [id]);
    });
    return reply.code(204).send();
  });
}
