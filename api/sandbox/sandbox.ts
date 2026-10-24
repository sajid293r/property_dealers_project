/**
 * A complete PropIQ in one command, with no cloud accounts: an in-memory Postgres, the real API on top, and a tiny
 * stand-in for Supabase's sign-in service. Seeded with the ByteCraft organization and one owner you can sign in as.
 *
 *     cd api && npm run sandbox
 *
 * then start the website pointed at it (the command is printed below). Everything resets when you stop it.
 * NOT for production: the sign-in stand-in accepts one fixed password.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { SignJWT } from "jose";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { createVerifier } from "../src/auth.js";
import { Db } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { parseConfig, runSetup } from "../src/setup.js";

const AUTH_PORT = Number(process.env.SANDBOX_AUTH_PORT ?? 54321);
const API_PORT = Number(process.env.SANDBOX_API_PORT ?? 4000);
const WEB_ORIGIN = process.env.SANDBOX_WEB_ORIGIN ?? "http://localhost:3000";
const SECRET = "sandbox-secret-sandbox-secret-sandbox-secret";
const USER = { id: "5b000000-0000-0000-0000-000000000001", email: "owner@bytecraft.local", password: "sandbox-pass", name: "Sandbox Owner" };

// ── database ────────────────────────────────────────────────────────────────────────────────────────────────
const lite = await PGlite.create();
const socket = new PGLiteSocketServer({ db: lite, port: 0, host: "127.0.0.1" });
await socket.start();
const dbUrl = `postgres://postgres@${socket.getServerConn()}/postgres`;

const owner = new pg.Client({ connectionString: dbUrl });
await owner.connect();
await migrate(owner, () => {});
await runSetup(
  owner,
  parseConfig({
    organization: { name: "ByteCraft", slug: "bytecraft", plan: "premium" },
    company: { name: "ByteCraft", shortName: "ByteCraft" },
    people: [{ name: USER.name, email: USER.email, role: "Owner", orgRole: "owner" }],
  }),
  async (email) => (email.toLowerCase() === USER.email ? USER.id : null),
  () => {},
);
await owner.end();

// ── the API ─────────────────────────────────────────────────────────────────────────────────────────────────
const db = Db.create({ DATABASE_URL: dbUrl, DB_POOL_MAX: 1, DB_SESSION_ROLE: "propiq_app" });
const verifier = createVerifier({ SUPABASE_JWT_SECRET: SECRET, SUPABASE_JWT_AUDIENCE: "authenticated", SUPABASE_JWKS_URL: undefined, SUPABASE_JWT_ISSUER: undefined });
const api = buildApp({ config: { LOG_LEVEL: "warn", CORS_ORIGIN: WEB_ORIGIN }, db, verifier });
await api.listen({ port: API_PORT, host: "127.0.0.1" });

// ── a stand-in for Supabase Auth (only what the website uses) ───────────────────────────────────────────────
const key = new TextEncoder().encode(SECRET);
const refreshTokens = new Set<string>();

async function session() {
  const now = Math.floor(Date.now() / 1000);
  const access_token = await new SignJWT({ email: USER.email, user_metadata: { full_name: USER.name }, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(USER.id)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const refresh_token = `rt-${randomUUID()}`;
  refreshTokens.add(refresh_token);
  return {
    access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token,
    user: { id: USER.id, aud: "authenticated", role: "authenticated", email: USER.email, app_metadata: {}, user_metadata: { full_name: USER.name }, created_at: new Date().toISOString() },
  };
}

function cors(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, apikey, content-type, x-client-info, x-supabase-api-version");
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
}

const readBody = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const auth = createServer(async (req, res) => {
  cors(res);
  const url = new URL(req.url ?? "/", "http://x");
  const send = (status: number, body?: unknown) => {
    res.statusCode = status;
    if (body !== undefined) res.setHeader("content-type", "application/json");
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return send(204);
  if (req.method === "POST" && url.pathname === "/auth/v1/token") {
    const body = await readBody(req);
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      if (String(body.email).toLowerCase() === USER.email && body.password === USER.password) return send(200, await session());
      return send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    if (grant === "refresh_token" && refreshTokens.has(String(body.refresh_token))) {
      refreshTokens.delete(String(body.refresh_token));
      return send(200, await session());
    }
    return send(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
  }
  if (req.method === "GET" && url.pathname === "/auth/v1/user") return send(200, (await session()).user);
  if (req.method === "POST" && url.pathname === "/auth/v1/logout") return send(204);
  return send(404, { msg: "not found" });
});
await new Promise<void>((resolve) => auth.listen(AUTH_PORT, "127.0.0.1", resolve));

console.log(`
PropIQ sandbox is running (in-memory; everything resets when you stop it)

  API            http://localhost:${API_PORT}
  Sign-in        http://localhost:${AUTH_PORT}   (stand-in for Supabase Auth)
  Sign in as     ${USER.email}  /  ${USER.password}   (Owner of ByteCraft)

Start the website against it (a second terminal, from the project root):

  NEXT_PUBLIC_SUPABASE_URL=http://localhost:${AUTH_PORT} NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sandbox NEXT_PUBLIC_API_URL=http://localhost:${API_PORT} npm run dev

Press Ctrl+C to stop.
`);

const stop = async () => {
  await api.close();
  auth.close();
  await db.close();
  await socket.stop();
  await lite.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
