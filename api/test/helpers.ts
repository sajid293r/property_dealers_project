import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { SignJWT } from "jose";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { createVerifier } from "../src/auth.js";
import { Db } from "../src/db.js";
import { migrate } from "../src/migrate.js";

/**
 * A real Postgres wire connection to an in-memory database, the real API on top, and a fake "Supabase" that signs
 * tokens with a local secret. The API connects through the same code path and the same restricted role it uses in
 * production (propiq_app); only the way the connection learns its role differs (SET ROLE, because PGlite has one
 * session). CI against a real Postgres comes next; the rules under test are the same.
 */
export const JWT_SECRET = "test-secret-test-secret-test-secret-123";

export const ID = {
  org: "00000000-0000-0000-0000-0000000000a1",
  coA: "00000000-0000-0000-0000-0000000000c1",
  coB: "00000000-0000-0000-0000-0000000000c2",
  alice: "a1000000-0000-0000-0000-000000000001", // owner of company A: everything
  bob: "a1000000-0000-0000-0000-000000000002", //   company A, viewer: can look, not change
  dave: "a1000000-0000-0000-0000-000000000003", //  company A, agent: sells, but cannot cancel; sees only own bookings
  carol: "a1000000-0000-0000-0000-000000000004", // owner of company B
  eve: "a1000000-0000-0000-0000-000000000005", //   signed in, belongs to nobody
  frank: "a1000000-0000-0000-0000-000000000006", // company A, accountant: prepares vouchers but cannot approve
  roleAccountant: "b2000000-0000-0000-0000-000000000004",
  roleOwner: "b2000000-0000-0000-0000-000000000001",
  roleViewer: "b2000000-0000-0000-0000-000000000002",
  roleAgent: "b2000000-0000-0000-0000-000000000003",
  custA: "c3000000-0000-0000-0000-000000000001",
  custB: "c3000000-0000-0000-0000-000000000002",
  prjA: "d4000000-0000-0000-0000-000000000001",
  prjB: "d4000000-0000-0000-0000-000000000002",
  typeA: "e5000000-0000-0000-0000-000000000001",
  typeB: "e5000000-0000-0000-0000-000000000002",
  propA: (n: number) => `f6000000-0000-0000-0000-00000000000${n}`,
  propB1: "f7000000-0000-0000-0000-000000000001",
};

export interface Harness {
  app: FastifyInstance;
  db: Db;
  /** Run SQL as the database owner (bypasses row-level security) to set up or inspect data. */
  admin: <T>(fn: (c: pg.PoolClient) => Promise<T>) => Promise<T>;
  token: (userId: string, email: string, opts?: { secret?: string; expiresIn?: string; audience?: string }) => Promise<string>;
  /** Make an authenticated request. */
  call: (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, opts?: { as?: string; company?: string | null; body?: unknown; headers?: Record<string, string> }) => Promise<{ status: number; body: any }>;
  close: () => Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const lite = await PGlite.create();
  const server = new PGLiteSocketServer({ db: lite, port: 0, host: "127.0.0.1" });
  await server.start();
  const url = `postgres://postgres@${server.getServerConn()}/postgres`;

  // 1. schema, roles and test data, as the database owner, over its own connection (closed before the API connects:
  //    this in-memory server serves one session at a time)
  const owner = new pg.Client({ connectionString: url });
  await owner.connect();
  await migrate(owner, () => {});
  await (async (c: pg.Client) => {
    const grants = (role: string, rows: [string, boolean, boolean, boolean, boolean, boolean, string][]) =>
      rows.map(([m, v, cr, e, d, a, scope]) => `('${role}','${m}',${v},${cr},${e},${d},${a},'${scope}')`).join(",");
    await c.query(`
      insert into organizations(id,name,slug,plan) values ('${ID.org}','Test Group','test-group','premium');
      insert into companies(id,org_id,name) values ('${ID.coA}','${ID.org}','Company A'),('${ID.coB}','${ID.org}','Company B');
      insert into users(id,email,full_name) values
        ('${ID.alice}','alice@a.pk','Alice Owner'),('${ID.bob}','bob@a.pk','Bob Viewer'),('${ID.dave}','dave@a.pk','Dave Agent'),('${ID.carol}','carol@b.pk','Carol Owner'),('${ID.frank}','frank@a.pk','Frank Accountant');
      insert into roles(id,org_id,name) values ('${ID.roleOwner}','${ID.org}','Owner'),('${ID.roleViewer}','${ID.org}','Viewer'),('${ID.roleAgent}','${ID.org}','Agent'),('${ID.roleAccountant}','${ID.org}','Accountant');
      insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values
        ${grants(ID.roleOwner, [["deals", true, true, true, true, true, "company"], ["inventory", true, true, true, true, true, "company"], ["accounts", true, true, true, true, true, "company"], ["customers", true, true, true, true, true, "company"], ["reports", true, true, true, true, true, "company"]])},
        ${grants(ID.roleViewer, [["deals", true, false, false, false, false, "company"], ["inventory", true, false, false, false, false, "company"]])},
        ${grants(ID.roleAgent, [["deals", true, true, true, false, false, "own"], ["inventory", true, false, false, false, false, "company"]])},
        ${grants(ID.roleAccountant, [["accounts", true, true, true, false, false, "company"], ["reports", true, false, false, false, false, "company"], ["customers", true, true, true, false, false, "company"]])};
      insert into company_members(company_id,user_id,role_id) values
        ('${ID.coA}','${ID.alice}','${ID.roleOwner}'),('${ID.coA}','${ID.bob}','${ID.roleViewer}'),('${ID.coA}','${ID.dave}','${ID.roleAgent}'),('${ID.coA}','${ID.frank}','${ID.roleAccountant}'),('${ID.coB}','${ID.carol}','${ID.roleOwner}');
    `);
    await c.query(`
      insert into parties(id,company_id,display_name) values ('${ID.custA}','${ID.coA}','Customer of A'),('${ID.custB}','${ID.coB}','Customer of B');
      insert into projects(id,company_id,code,name,type) values ('${ID.prjA}','${ID.coA}','PRJ-A','Alpha Valley','residential'),('${ID.prjB}','${ID.coB}','PRJ-B','Beta Heights','residential');
      insert into property_types(id,company_id,code,name,property_group) values ('${ID.typeA}','${ID.coA}','plot','Plot','residential'),('${ID.typeB}','${ID.coB}','plot','Plot','residential');
      insert into properties(id,company_id,project_id,type_id,code,title,list_price) values
        ${[1, 2, 3, 4, 5].map((n) => `('${ID.propA(n)}','${ID.coA}','${ID.prjA}','${ID.typeA}','PRP-A${n}','Plot A${n}',1000000)`).join(",")},
        ('${ID.propB1}','${ID.coB}','${ID.prjB}','${ID.typeB}','PRP-B1','Plot B1',2000000);
    `);
  })(owner);
  await owner.query(`select app.seed_company_defaults('${ID.coA}'), app.seed_company_defaults('${ID.coB}')`);
  await owner.end();

  // 2. the API, connecting the way it does in production, as the restricted propiq_app role
  const db = Db.create({ DATABASE_URL: url, DB_POOL_MAX: 1, DB_SESSION_ROLE: "propiq_app" });
  const admin: Harness["admin"] = async (fn) => {
    const c = await db.pool.connect();
    try {
      await c.query("reset role");
      return await fn(c);
    } finally {
      await c.query("set role propiq_app");
      c.release();
    }
  };

  const verifier = createVerifier({ SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_JWT_AUDIENCE: "authenticated", SUPABASE_JWKS_URL: undefined, SUPABASE_JWT_ISSUER: undefined });
  const app = buildApp({ config: { LOG_LEVEL: "silent" }, db, verifier, cnic: { hmacKey: Buffer.alloc(32, 5), dataKey: Buffer.alloc(32, 6) } });
  await app.ready();

  const token: Harness["token"] = (userId, email, opts = {}) =>
    new SignJWT({ email, user_metadata: { full_name: email.split("@")[0] } })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setAudience(opts.audience ?? "authenticated")
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? "1h")
      .sign(new TextEncoder().encode(opts.secret ?? JWT_SECRET));

  const emails: Record<string, string> = {
    [ID.alice]: "alice@a.pk", [ID.bob]: "bob@a.pk", [ID.dave]: "dave@a.pk", [ID.carol]: "carol@b.pk", [ID.eve]: "eve@nowhere.pk", [ID.frank]: "frank@a.pk",
  };

  const call: Harness["call"] = async (method, url, opts = {}) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.as) headers.authorization = `Bearer ${await token(opts.as, emails[opts.as] ?? "x@x.pk")}`;
    if (opts.company !== null && opts.company !== undefined) headers["x-company-id"] = opts.company;
    const res = await app.inject({ method, url, headers, ...(opts.body !== undefined ? { payload: opts.body as object } : {}) });
    let body: unknown = null;
    try {
      body = res.body ? JSON.parse(res.body) : null;
    } catch {
      body = res.body;
    }
    return { status: res.statusCode, body };
  };

  return {
    app, db, admin, token, call,
    close: async () => {
      await app.close();
      await db.close();
      await server.stop();
      await lite.close();
    },
  };
}
