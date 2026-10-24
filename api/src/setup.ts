import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { z } from "zod";
import { MODULE_KEYS, STANDARD_ROLES } from "./roles.js";
import type { Runner } from "./migrate.js";

/**
 * Creates (or tops up) an organization, its first company, the standard roles, and the people who work there.
 * Run with the OWNER login. Safe to run again: it only adds what is missing and corrects names and roles.
 *
 * People must already have a Supabase Auth account (Dashboard > Authentication > Users > Add user). The account's
 * id becomes users.id, which is how a sign-in finds its company. A person without an account yet is reported as
 * "waiting" and is linked the next time the script runs.
 */
const configSchema = z.object({
  organization: z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and dashes only"),
    plan: z.enum(["basic", "moderate", "premium"]).default("basic"),
  }),
  company: z.object({
    name: z.string().min(1),
    shortName: z.string().optional(),
    city: z.string().optional(),
  }),
  people: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email().nullable().optional(),
        role: z.string().min(1),
        orgRole: z.enum(["owner", "admin", "member"]).default("member"),
      }),
    )
    .min(1),
});
export type SetupConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): SetupConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid setup file:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  const roleNames = new Set(STANDARD_ROLES.map((r) => r.name.toLowerCase()));
  for (const p of parsed.data.people) {
    if (!roleNames.has(p.role.toLowerCase())) {
      throw new Error(`Unknown role "${p.role}" for ${p.name}. Available: ${STANDARD_ROLES.map((r) => r.name).join(", ")}`);
    }
  }
  return parsed.data;
}

export interface PersonResult {
  name: string;
  email: string | null;
  role: string;
  state: "linked" | "waiting-for-email" | "waiting-for-login";
}

export interface SetupResult {
  organizationId: string;
  companyId: string;
  people: PersonResult[];
}

/** Finds a person's Supabase Auth id by email. Overridable so tests need no `auth` schema. */
export type FindAuthUser = (email: string) => Promise<string | null>;

export const findInSupabaseAuth =
  (db: Runner): FindAuthUser =>
  async (email) => {
    const r = await db.query(`select id from auth.users where lower(email) = lower($1) limit 1`, [email]);
    return r.rows[0] ? String(r.rows[0].id) : null;
  };

export async function runSetup(
  db: Runner,
  cfg: SetupConfig,
  findAuthUser: FindAuthUser,
  log: (msg: string) => void = console.log,
): Promise<SetupResult> {
  await db.query("begin");
  try {
    // organization (by its slug)
    const org = await db.query(
      `insert into organizations (name, slug, plan) values ($1, $2, $3)
       on conflict (slug) do update set name = excluded.name, plan = excluded.plan returning id`,
      [cfg.organization.name, cfg.organization.slug, cfg.organization.plan],
    );
    const organizationId = String(org.rows[0]!.id);

    // first company (the one with this name inside the organization)
    const existing = await db.query(`select id from companies where org_id = $1 and name = $2 order by created_at limit 1`, [organizationId, cfg.company.name]);
    let companyId: string;
    if (existing.rows[0]) {
      companyId = String(existing.rows[0].id);
    } else {
      const c = await db.query(
        `insert into companies (org_id, name, short_name, city) values ($1, $2, $3, $4) returning id`,
        [organizationId, cfg.company.name, cfg.company.shortName ?? cfg.company.name, cfg.company.city ?? null],
      );
      companyId = String(c.rows[0]!.id);
      log(`created company "${cfg.company.name}"`);
    }

    // what every company starts with (property types, size settings); only adds what is missing
    const seeded = await db.query(`select app.seed_company_defaults($1) as added`, [companyId]);
    if (Number(seeded.rows[0]?.added) > 0) log(`added ${seeded.rows[0]!.added} standard property types`);

    // the standard roles and what each may do in every module
    const roleIds = new Map<string, string>();
    for (const def of STANDARD_ROLES) {
      const found = await db.query(`select id from roles where org_id = $1 and lower(name) = lower($2)`, [organizationId, def.name]);
      const roleId = found.rows[0]
        ? String(found.rows[0].id)
        : String((await db.query(`insert into roles (org_id, name, description, is_system) values ($1, $2, $3, true) returning id`, [organizationId, def.name, def.description])).rows[0]!.id);
      roleIds.set(def.name.toLowerCase(), roleId);
      for (const module of MODULE_KEYS) {
        const g = def.modules ? def.modules[module] ?? { view: false, create: false, edit: false, delete: false, approve: false } : def.grant;
        await db.query(
          `insert into role_permissions (role_id, module, can_view, can_create, can_edit, can_delete, can_approve, data_scope)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (role_id, module) do update set can_view = excluded.can_view, can_create = excluded.can_create,
             can_edit = excluded.can_edit, can_delete = excluded.can_delete, can_approve = excluded.can_approve, data_scope = excluded.data_scope`,
          [roleId, module, g.view, g.create, g.edit, g.delete, g.approve, def.scope],
        );
      }
    }

    // people
    const people: PersonResult[] = [];
    for (const p of cfg.people) {
      const base = { name: p.name, email: p.email ?? null, role: p.role };
      if (!p.email) {
        people.push({ ...base, state: "waiting-for-email" });
        continue;
      }
      const authId = await findAuthUser(p.email);
      if (!authId) {
        people.push({ ...base, state: "waiting-for-login" });
        continue;
      }
      const clash = await db.query(`select id from users where lower(email) = lower($1) and id <> $2`, [p.email, authId]);
      if (clash.rows[0]) throw new Error(`${p.email} already exists in users with a different id; resolve that before linking.`);
      await db.query(
        `insert into users (id, email, full_name) values ($1, $2, $3)
         on conflict (id) do update set full_name = excluded.full_name, email = excluded.email`,
        [authId, p.email, p.name],
      );
      await db.query(
        `insert into org_members (org_id, user_id, org_role) values ($1, $2, $3)
         on conflict (org_id, user_id) do update set org_role = excluded.org_role`,
        [organizationId, authId, p.orgRole],
      );
      await db.query(
        `insert into company_members (company_id, user_id, role_id, status) values ($1, $2, $3, 'active')
         on conflict (company_id, user_id) do update set role_id = excluded.role_id, status = 'active'`,
        [companyId, authId, roleIds.get(p.role.toLowerCase())],
      );
      people.push({ ...base, state: "linked" });
    }

    await db.query("commit");
    return { organizationId, companyId, people };
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is required (the owner login)");
  const here = dirname(fileURLToPath(import.meta.url));
  const argIdx = process.argv.indexOf("--config");
  const file = resolve(argIdx > -1 && process.argv[argIdx + 1] ? process.argv[argIdx + 1]! : join(here, "..", "db", "setup.bytecraft.json"));
  const cfg = parseConfig(JSON.parse(readFileSync(file, "utf8")));

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const r = await runSetup(client, cfg, findInSupabaseAuth(client));
    console.log(`\norganization "${cfg.organization.name}"  ${r.organizationId}`);
    console.log(`company      "${cfg.company.name}"  ${r.companyId}`);
    for (const p of r.people) {
      const label = { linked: "linked  ", "waiting-for-login": "WAITING ", "waiting-for-email": "WAITING " }[p.state];
      const why = { linked: "", "waiting-for-login": "  -> no Supabase login for this email yet (Dashboard > Authentication > Users > Add user), then run this again", "waiting-for-email": "  -> add this person's email to the setup file, then run this again" }[p.state];
      console.log(`  ${label} ${p.name.padEnd(16)} ${p.role.padEnd(14)} ${p.email ?? "(no email yet)"}${why}`);
    }
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
