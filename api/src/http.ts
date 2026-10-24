import { z, type ZodType } from "zod";

/** Small validation helpers shared by the routes. Anything that fails becomes a 400 with the field named. */
export const uuid = z.guid(); // any 8-4-4-4-12 hex id; real ids are v4/v7, tests use readable ones
export const idParams = z.object({ id: uuid });

/** Money arrives as a number or a string and stays a string all the way to Postgres (never a float). */
export const money = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "must be an amount with at most 2 decimals"));

/** Like money, but may be negative (an overdrawn bank balance, a credit balance). */
export const signedMoney = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(/^-?\d+(\.\d{1,2})?$/, "must be an amount with at most 2 decimals"));

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2026-09-20");

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

/** `?limit=` / `?offset=` with sane bounds, for list endpoints. */
export const paging = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
