import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MODULE_KEYS, STANDARD_ROLES } from "../src/roles.js";
import { parseConfig, runSetup, type FindAuthUser } from "../src/setup.js";
import { startHarness, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});

const SAJID = "5a000000-0000-0000-0000-00000000000a";
const UMAIR = "5a000000-0000-0000-0000-00000000000b";
const accounts = new Map<string, string>(); // email -> Supabase id; filled in as "accounts get created"
const findAuthUser: FindAuthUser = async (email) => accounts.get(email.toLowerCase()) ?? null;

const config = (emails: { sajid: string | null; umair: string | null }) =>
  parseConfig({
    organization: { name: "ByteCraft", slug: "bytecraft", plan: "premium" },
    company: { name: "ByteCraft" },
    people: [
      { name: "Sajid Nazir", email: emails.sajid, role: "Owner", orgRole: "owner" },
      { name: "Umair Ruman", email: emails.umair, role: "Administrator", orgRole: "admin" },
    ],
  });

const counts = () =>
  h.admin(async (c) => {
    const r = await c.query(`select
      (select count(*)::int from organizations where slug = 'bytecraft') orgs,
      (select count(*)::int from companies where name = 'ByteCraft') companies,
      (select count(*)::int from roles r join organizations o on o.id = r.org_id where o.slug = 'bytecraft') roles,
      (select count(*)::int from role_permissions rp join roles r on r.id = rp.role_id join organizations o on o.id = r.org_id where o.slug = 'bytecraft') grants,
      (select count(*)::int from company_members cm join companies c on c.id = cm.company_id where c.name = 'ByteCraft') members`);
    return r.rows[0];
  });

describe("setup script", () => {
  it("uses exactly the permission modules the front end defines", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const text = readFileSync(join(here, "..", "..", "lib", "permissions.ts"), "utf8");
    const block = text.slice(text.indexOf("PERMISSION_MODULES = ["), text.indexOf("] as const satisfies"));
    const frontEnd = [...block.matchAll(/key:\s*"(\w+)"/g)].map((m) => m[1]);
    expect([...MODULE_KEYS].sort()).toEqual([...frontEnd].sort());
  });

  it("creates the organization, company and roles even before anyone has a login, and says who is waiting", async () => {
    const r = await h.admin((c) => runSetup(c, config({ sajid: "sajid@bytecraft.pk", umair: null }), findAuthUser, () => {}));
    expect(r.people.map((p) => [p.name, p.state])).toEqual([
      ["Sajid Nazir", "waiting-for-login"],
      ["Umair Ruman", "waiting-for-email"],
    ]);
    expect(await counts()).toEqual({ orgs: 1, companies: 1, roles: STANDARD_ROLES.length, grants: STANDARD_ROLES.length * MODULE_KEYS.length, members: 0 });
  });

  it("links people as their logins appear, and running it again changes nothing", async () => {
    accounts.set("sajid@bytecraft.pk", SAJID);
    accounts.set("umair@bytecraft.pk", UMAIR);
    const cfg = config({ sajid: "sajid@bytecraft.pk", umair: "umair@bytecraft.pk" });
    const first = await h.admin((c) => runSetup(c, cfg, findAuthUser, () => {}));
    expect(first.people.every((p) => p.state === "linked")).toBe(true);
    const after = await counts();
    expect(after).toEqual({ orgs: 1, companies: 1, roles: STANDARD_ROLES.length, grants: STANDARD_ROLES.length * MODULE_KEYS.length, members: 2 });
    await h.admin((c) => runSetup(c, cfg, findAuthUser, () => {}));
    await h.admin((c) => runSetup(c, cfg, findAuthUser, () => {}));
    expect(await counts()).toEqual(after);
  });

  it("gives the company the standard property types and its marla setting, once", async () => {
    const r = await h.admin((c) =>
      c.query(`select count(*)::int n, (select settings->>'marla_sqft' from companies where name = 'ByteCraft') marla
                 from property_types pt join companies c on c.id = pt.company_id where c.name = 'ByteCraft'`),
    );
    expect(r.rows[0]).toEqual({ n: 8, marla: "272.25" });
  });

  it("gives the owner every action and the administrator everything except delete", async () => {
    const rows = await h.admin((c) =>
      c.query(
        `select r.name, bool_and(rp.can_view) v, bool_and(rp.can_create) cr, bool_and(rp.can_edit) e,
                bool_and(rp.can_delete) d, bool_and(rp.can_approve) a, bool_and(rp.data_scope = 'company') scoped
           from roles r join role_permissions rp on rp.role_id = r.id join organizations o on o.id = r.org_id
          where o.slug = 'bytecraft' and r.name in ('Owner','Administrator') group by r.name order by r.name`,
      ),
    );
    expect(rows.rows).toEqual([
      { name: "Administrator", v: true, cr: true, e: true, d: false, a: true, scoped: true },
      { name: "Owner", v: true, cr: true, e: true, d: true, a: true, scoped: true },
    ]);
    expect(STANDARD_ROLES.map((r) => r.name)).toEqual(["Owner", "Administrator", "Sales Agent", "Accountant", "Viewer"]);
  });

  it("stores the people with their Supabase ids, names and organization roles", async () => {
    const rows = await h.admin((c) =>
      c.query(`select u.id, u.full_name, om.org_role, r.name as role from users u
                 join org_members om on om.user_id = u.id join company_members cm on cm.user_id = u.id join roles r on r.id = cm.role_id
                where u.id in ($1, $2) order by u.full_name`, [SAJID, UMAIR]),
    );
    expect(rows.rows).toEqual([
      { id: SAJID, full_name: "Sajid Nazir", org_role: "owner", role: "Owner" },
      { id: UMAIR, full_name: "Umair Ruman", org_role: "admin", role: "Administrator" },
    ]);
  });

  it("lets them sign in through the real API and enter the company", async () => {
    const tokenFor = (id: string, email: string) => h.token(id, email);
    const me = await h.app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${await tokenFor(SAJID, "sajid@bytecraft.pk")}` } });
    const body = me.json();
    expect(me.statusCode).toBe(200);
    expect(body.companies).toHaveLength(1);
    expect(body.companies[0]).toMatchObject({ name: "ByteCraft", role: "Owner" });

    const companyId = body.companies[0].companyId as string;
    const asUmair = await h.app.inject({
      method: "GET",
      url: "/v1/transitions/booking/confirmed",
      headers: { authorization: `Bearer ${await tokenFor(UMAIR, "umair@bytecraft.pk")}`, "x-company-id": companyId },
    });
    expect(asUmair.statusCode).toBe(200);
    // the administrator may approve (cancel a booking) because the role carries deals.approve
    expect(asUmair.json().find((t: { to: string }) => t.to === "cancelled").allowedForYou).toBe(true);
  });

  it("cannot see or enter another organization's company", async () => {
    const t = await h.token(SAJID, "sajid@bytecraft.pk");
    const other = await h.app.inject({ method: "GET", url: "/v1/properties", headers: { authorization: `Bearer ${t}`, "x-company-id": "00000000-0000-0000-0000-0000000000c1" } });
    expect(other.statusCode).toBe(403);
  });

  it("refuses a bad file and leaves nothing half-done", async () => {
    expect(() => parseConfig({ organization: { name: "X", slug: "Bad Slug" }, company: { name: "X" }, people: [{ name: "A", role: "Owner" }] })).toThrow(/slug/);
    expect(() => parseConfig({ organization: { name: "X", slug: "x" }, company: { name: "X" }, people: [{ name: "A", role: "Wizard" }] })).toThrow(/Unknown role/);

    // an email that already belongs to a different user id must stop the whole run, not link the wrong person
    accounts.set("alice@a.pk", "5a000000-0000-0000-0000-00000000ffff"); // alice@a.pk already exists in users under another id
    const clash = parseConfig({
      organization: { name: "Clash Org", slug: "clash-org" },
      company: { name: "Clash Co" },
      people: [{ name: "Alice Again", email: "alice@a.pk", role: "Owner", orgRole: "owner" }],
    });
    await expect(h.admin((c) => runSetup(c, clash, findAuthUser, () => {}))).rejects.toThrow(/different id/);
    const left = await h.admin((c) => c.query(`select count(*)::int n from organizations where slug = 'clash-org'`));
    expect(left.rows[0].n).toBe(0);
  });
});
