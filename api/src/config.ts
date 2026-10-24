import { z } from "zod";

/**
 * Everything the API needs from its environment. Fails fast, with a readable message, if something is missing.
 *
 * Two database logins exist on purpose:
 *   DATABASE_URL            the day-to-day login (role propiq_app). It can NOT bypass row-level security.
 *   MIGRATION_DATABASE_URL  the owner login, used only by `npm run migrate`. Never given to the running API.
 */
const schema = z
  .object({
    PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required (the propiq_app role, via the Supabase pooler)"),
    MIGRATION_DATABASE_URL: z.string().optional(),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
    /** Local/test only: SET ROLE to this after connecting (when the connection itself is not already that role). */
    DB_SESSION_ROLE: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/, "DB_SESSION_ROLE must be a plain role name")
      .optional(),

    /** Supabase Auth. New projects sign tokens with a key pair: set the JWKS URL. Older ones share a secret. */
    SUPABASE_JWKS_URL: z.string().url().optional(),
    SUPABASE_JWT_SECRET: z.string().min(16).optional(),
    SUPABASE_JWT_ISSUER: z.string().optional(),
    SUPABASE_JWT_AUDIENCE: z.string().default("authenticated"),

    /** Origins allowed to call the API from a browser, comma separated. */
    CORS_ORIGIN: z.string().optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .refine((c) => c.SUPABASE_JWKS_URL || c.SUPABASE_JWT_SECRET, {
    message: "Set SUPABASE_JWKS_URL (or, for older projects, SUPABASE_JWT_SECRET) so the API can verify sign-ins",
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "config"}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  return parsed.data;
}
