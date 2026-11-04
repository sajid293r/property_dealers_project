import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Queryable } from "./db.js";
import { AppError } from "./errors.js";

/**
 * Duplicate protection for money-creating requests (QA finding BUG-006). The website sends one request id per action in
 * the Idempotency-Key header; the first request with an id does the work and the database remembers which record it
 * made (app.claim_idempotency / app.finish_idempotency, migration 0018); a repeat gets that same record back.
 * No header = no protection (scripts, older screens), exactly as before.
 */
export function requestKey(req: FastifyRequest): string | null {
  const raw = req.headers["idempotency-key"];
  if (raw === undefined) return null;
  const key = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (key.length < 8 || key.length > 120) throw new AppError(400, "invalid_request_id", "The request id must be 8 to 120 characters.");
  return key;
}

/**
 * Run `make` once per request id. `make` returns the id of the record it created (or acted on) and the answer to
 * send; `replay` rebuilds the same answer for that id when the request is repeated. Call it inside the tenant
 * transaction so the claim and the work commit (or roll back) together.
 */
export async function idempotent<T>(
  c: Queryable,
  key: string | null,
  scope: string,
  body: unknown,
  make: () => Promise<{ id: string; result: T }>,
  replay: (id: string) => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  if (!key) return { result: (await make()).result, replayed: false };
  const hash = createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
  const claim = await c.query<{ replay: boolean; resource_id: string | null }>(`select replay, resource_id from app.claim_idempotency($1, $2, $3)`, [key, scope, hash]);
  if (claim.rows[0]!.replay) return { result: await replay(claim.rows[0]!.resource_id!), replayed: true };
  const made = await make();
  await c.query(`select app.finish_idempotency($1, $2)`, [key, made.id]);
  return { result: made.result, replayed: false };
}
