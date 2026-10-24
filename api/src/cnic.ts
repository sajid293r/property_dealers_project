import crypto from "node:crypto";
import { AppError } from "./errors.js";

/**
 * How a CNIC reaches the database (design: docs/BACKEND_DESIGN.md §9, reference: docs/schema/cnic.mjs).
 *   cnic_enc   AES-256-GCM ciphertext (a fresh random nonce each time)
 *   cnic_hash  HMAC-SHA-256 of the 13 digits under a server-held key: the only searchable / unique form
 *   cnic_last4 the last four digits, for display
 * The two keys live in the API's environment, never in the database. A leaked database alone reveals no CNICs.
 */
export interface CnicKeys {
  hmacKey: Buffer;
  dataKey: Buffer;
}

/** Reads the two 32-byte keys (base64) from the environment; null when CNIC storage is not configured. */
export function loadCnicKeys(env: Record<string, string | undefined>): CnicKeys | null {
  const h = env.CNIC_HMAC_KEY;
  const d = env.CNIC_DATA_KEY;
  if (!h || !d) return null;
  const hmacKey = Buffer.from(h, "base64");
  const dataKey = Buffer.from(d, "base64");
  if (hmacKey.length !== 32 || dataKey.length !== 32) throw new Error("CNIC_HMAC_KEY and CNIC_DATA_KEY must each be 32 bytes, base64 encoded");
  return { hmacKey, dataKey };
}

/** "35201-1234567-1" or "3520112345671" -> "3520112345671"; throws unless exactly 13 digits. */
export function normalizeCnic(input: string): string {
  const digits = String(input ?? "").replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(digits)) throw new AppError(400, "invalid_cnic", "A CNIC must have 13 digits (like 35201-1234567-1).");
  return digits;
}

export function protectCnic(input: string, keys: CnicKeys | null): { cnic_enc: string; cnic_hash: string; cnic_last4: string } {
  if (!keys) throw new AppError(503, "cnic_not_configured", "Storing a CNIC is not set up on this server yet.");
  const digits = normalizeCnic(input);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keys.dataKey, iv);
  const ct = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  return {
    cnic_enc: ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join("."),
    cnic_hash: crypto.createHmac("sha256", keys.hmacKey).update(digits).digest("hex"),
    cnic_last4: digits.slice(-4),
  };
}
