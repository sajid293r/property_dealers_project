import pg from "pg";
import type { Config } from "./config.js";

// Keep Postgres `date` columns as plain "YYYY-MM-DD" strings (the default would shift them by the server's time zone).
pg.types.setTypeParser(1082, (v) => v);

/** Anything you can run SQL on: a pooled connection inside a transaction. */
export type Queryable = Pick<pg.PoolClient, "query">;

/** Who is doing what, for one request. Every value ends up in the database session, not just in this process. */
export interface TenantContext {
  userId: string;
  companyId: string;
  /** "module.action" strings, e.g. "deals.edit". The database checks status changes against these. */
  permissions: string[];
  requestId: string;
  /** The subscription plan of the company's organization ("basic" | "moderate" | "premium"). */
  plan: "basic" | "moderate" | "premium";
}

/**
 * The only way the API touches the database.
 *
 * Every call is ONE transaction that first tells Postgres who is asking (`set_config(..., true)` = this transaction
 * only, so nothing can leak to the next request that reuses the pooled connection). Row-level security, the status
 * rules and the audit trail all read those settings. The API does no tenant filtering of its own: if it forgot, the
 * database would still show nothing.
 */
export class Db {
  constructor(readonly pool: pg.Pool) {}

  static create(cfg: Pick<Config, "DATABASE_URL" | "DB_POOL_MAX" | "DB_SESSION_ROLE">): Db {
    const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: cfg.DB_POOL_MAX });
    // a connection the host dropped while idle (a paused serverless instance) must not crash the process
    pool.on("error", () => undefined);
    if (cfg.DB_SESSION_ROLE) {
      const role = cfg.DB_SESSION_ROLE; // validated as a plain identifier in config.ts
      pool.on("connect", (client) => {
        void client.query(`set role ${role}`);
      });
    }
    return new Db(pool);
  }

  /** A signed-in person with no company chosen yet: only their own memberships are visible. */
  asUser<T>(userId: string, fn: (q: Queryable) => Promise<T>): Promise<T> {
    return this.run({ "app.user_id": userId }, fn);
  }

  /** The normal case: a person acting inside one company. */
  inTenant<T>(ctx: TenantContext, fn: (q: Queryable) => Promise<T>): Promise<T> {
    return this.run(
      {
        "app.user_id": ctx.userId,
        "app.company_id": ctx.companyId,
        "app.permissions": ctx.permissions.join(","),
        "app.request_id": ctx.requestId,
      },
      fn,
    );
  }

  private async run<T>(settings: Record<string, string>, fn: (q: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      // one round trip for "begin" and every setting (each trip to a far-away database costs real time)
      const sets = Object.entries(settings).map(([key, value]) => `set_config(${client.escapeLiteral(key)}, ${client.escapeLiteral(value)}, true)`);
      await client.query(sets.length ? `begin; select ${sets.join(", ")}` : "begin");
      const result = await fn(client);
      await client.query("commit"); // deferred rules (balanced entries, schedules that add up) are checked here
      return result;
    } catch (err) {
      try {
        await client.query("rollback");
      } catch {
        /* the connection is already gone; nothing more to undo */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    const r = await this.pool.query("select 1 as ok");
    return r.rows[0]?.ok === 1;
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}
