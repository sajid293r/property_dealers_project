// How the API must handle a CNIC before it reaches the database (see BACKEND_DESIGN.md §9).
//
//   cnic_enc   AES-256-GCM ciphertext (random nonce, so the same CNIC encrypts differently every time)
//   cnic_hash  HMAC-SHA-256 of the normalized CNIC under a SERVER-HELD key -> the only thing that can be unique/searched
//   cnic_last4 the last four digits, for showing "*********5671" and for support lookups
//
// The keys never touch the database: the data key comes from the KMS-wrapped per-organization key, the
// HMAC key is a separate secret. A leaked database alone reveals no CNICs and cannot be used to guess them
// (a CNIC has only ~10^13 values, so an unkeyed hash would be brute-forced in hours).
import crypto from "node:crypto";

/** "35201-1234567-1" / "3520112345671" -> "3520112345671"; throws unless it is exactly 13 digits. */
export function normalizeCnic(input) {
  const digits = String(input ?? "").replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(digits)) throw new Error("A CNIC must have 13 digits");
  return digits;
}

export function cnicHash(input, hmacKey) {
  return crypto.createHmac("sha256", hmacKey).update(normalizeCnic(input)).digest("hex");
}

export function cnicLast4(input) {
  return normalizeCnic(input).slice(-4);
}

/** AES-256-GCM. Returns "v1.<iv>.<tag>.<ciphertext>" (base64url parts); dataKey is 32 bytes. */
export function encryptCnic(input, dataKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dataKey, iv);
  const ct = Buffer.concat([cipher.update(normalizeCnic(input), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptCnic(blob, dataKey) {
  const [v, iv, tag, ct] = String(blob).split(".");
  if (v !== "v1") throw new Error("Unknown CNIC encryption version");
  const decipher = crypto.createDecipheriv("aes-256-gcm", dataKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** The three columns to store for a party. */
export function protectCnic(input, { hmacKey, dataKey }) {
  return { cnic_enc: encryptCnic(input, dataKey), cnic_hash: cnicHash(input, hmacKey), cnic_last4: cnicLast4(input) };
}
