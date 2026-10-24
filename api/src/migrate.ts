import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

/**
 * Applies the database schema. Run with the OWNER login (MIGRATION_DATABASE_URL), never the API's login.
 *
 *   0001_core   = docs/schema/core.sql, the executable design (the same file the 260-check smoke test runs).
 *                 Until the first real deployment it may still be edited; use `npm run migrate:reset` on a dev
 *                 database to rebuild it. After the first deployment it is FROZEN: every change becomes a new
 *                 numbered file in api/db/migrations/ (0002_..., 0003_...).
 *   db/migrations/*.sql  applied in name order, each in its own transaction.
 *   db/roles.sql         re-applied every run (idempotent): the API's login and what it may touch.
 *
 * A fingerprint of every applied file is stored; if an applied file later changes, the run stops instead of
 * silently drifting away from what production actually has.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const BASELINE = join(root, "..", "docs", "schema", "core.sql");
const MIGRATIONS_DIR = join(root, "db", "migrations");
const ROLES = join(root, "db", "roles.sql");

export interface Migration {
  name: string;
  sql: string;
  sha: string;
}

const sha = (text: string) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

export function loadMigrations(): Migration[] {
  const list: Migration[] = [];
  const core = readFileSync(BASELINE, "utf8");
  list.push({ name: "0001_core", sql: core, sha: sha(core) });
  if (existsSync(MIGRATIONS_DIR)) {
    for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort()) {
      if (f.startsWith("0001_")) throw new Error("0001 is reserved for the baseline (docs/schema/core.sql)");
      const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
      list.push({ name: f.replace(/\.sql$/, ""), sql, sha: sha(sql) });
    }
  }
  return list;
}

export interface Runner {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export async function migrate(db: Runner, log: (msg: string) => void = console.log): Promise<{ applied: string[]; unchanged: string[] }> {
  await db.query(`create table if not exists schema_migrations (name text primary key, sha256 text not null, applied_at timestamptz not null default now())`);
  const done = new Map((await db.query(`select name, sha256 from schema_migrations`)).rows.map((r) => [String(r.name), String(r.sha256)]));
  const applied: string[] = [];
  const unchanged: string[] = [];

  for (const m of loadMigrations()) {
    const seen = done.get(m.name);
    if (seen !== undefined) {
      if (seen !== m.sha) {
        throw new Error(
          `${m.name} was already applied but its file has changed since.\n` +
            `  - On a development database: npm run migrate:reset (set ALLOW_DB_RESET=yes) rebuilds it from the current files.\n` +
            `  - Once deployed: never edit an applied migration; add a new numbered file in api/db/migrations/.`,
        );
      }
      unchanged.push(m.name);
      continue;
    }
    log(`applying ${m.name} ...`);
    await db.query("begin");
    try {
      await db.query(m.sql);
      await db.query(`insert into schema_migrations (name, sha256) values ($1, $2)`, [m.name, m.sha]);
      await db.query("commit");
    } catch (err) {
      await db.query("rollback");
      throw err;
    }
    applied.push(m.name);
  }

  await db.query(readFileSync(ROLES, "utf8"));
  return { applied, unchanged };
}

/** Development only: throws the schema away so it can be rebuilt from the current files. */
export async function reset(db: Runner): Promise<void> {
  await db.query(`drop schema if exists app cascade; drop schema if exists public cascade; create schema public; drop table if exists schema_migrations;`);
}

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is required (the owner login, not the API's login)");
  const wantReset = process.argv.includes("--reset");
  if (wantReset && process.env.ALLOW_DB_RESET !== "yes") {
    throw new Error("Refusing to reset: this deletes every table. Set ALLOW_DB_RESET=yes if this really is a throw-away database.");
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (wantReset) await reset(client);
    const r = await migrate(client);
    console.log(r.applied.length ? `done: applied ${r.applied.join(", ")}` : `up to date (${r.unchanged.length} migration(s) already applied)`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
