import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Config } from "./config.js";

export interface AuthUser {
  /** Supabase Auth's user id (the JWT `sub`). The same uuid is used as `users.id` in our database. */
  userId: string;
  email: string | null;
  fullName: string | null;
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthUser>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidToken extends Error {}

/**
 * Checks a Supabase Auth access token: signature, expiry, audience (and issuer when configured).
 * The token only proves WHO the person is. What they may do is decided from our own tables (memberships, roles).
 */
export function createVerifier(cfg: Pick<Config, "SUPABASE_JWKS_URL" | "SUPABASE_JWT_SECRET" | "SUPABASE_JWT_ISSUER" | "SUPABASE_JWT_AUDIENCE">): TokenVerifier {
  let key: JWTVerifyGetKey | Uint8Array;
  let algorithms: string[];
  if (cfg.SUPABASE_JWKS_URL) {
    key = createRemoteJWKSet(new URL(cfg.SUPABASE_JWKS_URL));
    algorithms = ["RS256", "ES256", "EdDSA"];
  } else if (cfg.SUPABASE_JWT_SECRET) {
    key = new TextEncoder().encode(cfg.SUPABASE_JWT_SECRET);
    algorithms = ["HS256"];
  } else {
    throw new Error("No way to verify tokens is configured");
  }

  return {
    async verify(token: string): Promise<AuthUser> {
      try {
        const options = { algorithms, audience: cfg.SUPABASE_JWT_AUDIENCE, ...(cfg.SUPABASE_JWT_ISSUER ? { issuer: cfg.SUPABASE_JWT_ISSUER } : {}) };
        const { payload } =
          key instanceof Uint8Array ? await jwtVerify(token, key, options) : await jwtVerify(token, key, options);
        if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) throw new InvalidToken("Token has no valid user id");
        const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
        return {
          userId: payload.sub.toLowerCase(),
          email: typeof payload.email === "string" ? payload.email : null,
          fullName: typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null,
        };
      } catch (err) {
        if (err instanceof InvalidToken) throw err;
        throw new InvalidToken("Sign-in is invalid or has expired");
      }
    },
  };
}
