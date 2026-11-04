import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ID, startHarness, type Harness } from "./helpers.js";
import { MODULE_KEYS } from "../src/roles.js";
import { FEATURES, PLAN_RANK, featureFor, type Plan } from "../src/plans.js";

/**
 * Plan gating, route by route (QA finding BUG-005: /v1/leads-summary slipped through because the gating works on path
 * patterns). Every route the API registers is classified here, so a new route cannot go live without a decision:
 *   - a route that looks like a gated module must be covered by the gating (and with the right tier),
 *   - any other route must belong to a family known to be in the Basic plan.
 * Then every gated route is called with a token of a company on a lower plan and must answer 403 plan_upgrade.
 */

/** What each gated module's routes look like, and the tier they must have. Deliberately broader than FEATURES.paths. */
const LOOKS_LIKE: [RegExp, string, Plan][] = [
  [/^\/v1\/leads/, "leads", "moderate"],
  [/^\/v1\/quotations/, "quotations", "moderate"],
  [/^\/v1\/cheques/, "cheques", "moderate"],
  [/^\/v1\/service-invoices/, "service_invoices", "moderate"],
  [/^\/v1\/contracts/, "contracts", "moderate"],
  [/^\/v1\/(construction|contractors)/, "contractors", "moderate"],
  [/^\/v1\/(bank-statement|reconciliation|ledger-line)/, "bank_reconciliation", "moderate"],
  [/^\/v1\/bank-accounts\/[^/]+\/(statements|reconciliations)/, "bank_reconciliation", "moderate"],
  [/^\/v1\/budget/, "budgets", "premium"],
  [/^\/v1\/employees/, "staff", "premium"],
  [/^\/v1\/leave/, "leave", "premium"],
  [/^\/v1\/payroll/, "payroll", "premium"],
];

/** First path segments of the routes every plan has (Basic). Adding a route family means deciding its plan here. */
const BASIC_FAMILIES = new Set([
  "me", "access", "transitions", "property-types", "projects", "properties", "holds", "bookings", "receipts", "dashboard", "expenses",
  "reports", "company", "plan", "members", "invites", "roles", "permission-modules", "audit", "collections", "reminders", "attachments",
  "encumbrances", "installments", "penalties", "refunds", "commissions", "parties", "accounts", "vouchers", "banks", "bank-accounts",
]);

let h: Harness;
const BASIC = { org: "00000000-0000-0000-0000-0000000000b1", co: "00000000-0000-0000-0000-0000000000d1", user: "a2000000-0000-0000-0000-000000000001", role: "b3000000-0000-0000-0000-000000000001" };
const PRO = { org: "00000000-0000-0000-0000-0000000000b2", co: "00000000-0000-0000-0000-0000000000d2", user: "a2000000-0000-0000-0000-000000000002", role: "b3000000-0000-0000-0000-000000000002" };

beforeAll(async () => {
  h = await startHarness();
  await h.admin(async (c) => {
    for (const [p, plan, name] of [[BASIC, "basic", "basic"], [PRO, "moderate", "pro"]] as const) {
      await c.query(`insert into organizations(id,name,slug,plan) values ($1,$2,$3,$4)`, [p.org, `${name} org`, `${name}-org`, plan]);
      await c.query(`insert into companies(id,org_id,name) values ($1,$2,$3)`, [p.co, p.org, `${name} co`]);
      await c.query(`insert into users(id,email,full_name) values ($1,$2,$3)`, [p.user, `${name}@x.pk`, `${name} owner`]);
      await c.query(`insert into roles(id,org_id,name,is_system) values ($1,$2,'Owner',true)`, [p.role, p.org]);
      for (const m of MODULE_KEYS) await c.query(`insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,$2,true,true,true,true,true,'company')`, [p.role, m]);
      await c.query(`insert into company_members(company_id,user_id,role_id) values ($1,$2,$3)`, [p.co, p.user, p.role]);
      await c.query(`select app.seed_company_defaults($1)`, [p.co]);
    }
  });
});
afterAll(async () => {
  await h.close();
});

const routes = () => h.app.routeTable.filter((r) => r.url.startsWith("/v1") && r.method !== "OPTIONS" && r.method !== "HEAD");

describe("BUG-005: every route is accounted for in the plan lists", () => {
  it("covers every route that looks like a gated module, with the right tier", () => {
    const wrong: string[] = [];
    for (const r of routes()) {
      for (const [re, key, tier] of LOOKS_LIKE) {
        if (!re.test(r.url)) continue;
        const f = featureFor(r.url);
        if (!f) wrong.push(`${r.method} ${r.url} looks like ${key} but is not gated`);
        else if (f.key !== key || f.tier !== tier) wrong.push(`${r.method} ${r.url} is gated as ${f.key}/${f.tier}, expected ${key}/${tier}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("has no route outside the gated modules and the known Basic families (decide the plan of anything new)", () => {
    const unknown = routes().filter((r) => !featureFor(r.url) && !BASIC_FAMILIES.has(r.url.split("/")[2]!)).map((r) => `${r.method} ${r.url}`);
    expect(unknown).toEqual([]);
  });

  it("gates something for each feature in plans.ts (no feature with zero routes)", () => {
    for (const f of FEATURES) expect(routes().some((r) => featureFor(r.url)?.key === f.key), f.key).toBe(true);
  });

  it("answers 403 plan_upgrade on every gated route for a company on a lower plan", async () => {
    const failures: string[] = [];
    let checked = 0;
    for (const r of routes()) {
      const f = featureFor(r.url);
      if (!f) continue;
      for (const who of [BASIC, PRO]) {
        const plan: Plan = who === BASIC ? "basic" : "moderate";
        if (PLAN_RANK[plan] >= PLAN_RANK[f.tier]) continue;
        const url = r.url.replace(/:[A-Za-z]+/g, (p) => (p === ":action" ? "approve" : "11111111-1111-1111-1111-111111111111"));
        const res = await h.call(r.method as "GET", url, { as: who.user, company: who.co, body: r.method === "GET" || r.method === "DELETE" ? undefined : {} });
        checked++;
        if (res.status !== 403 || res.body?.error?.code !== "plan_upgrade") failures.push(`${plan} ${r.method} ${url} -> ${res.status} ${res.body?.error?.code}`);
      }
    }
    expect(checked).toBeGreaterThan(60);
    expect(failures).toEqual([]);
  });

  it("the QA scenario: a Basic company cannot read the lead summary, a Professional one can", async () => {
    expect((await h.call("GET", "/v1/leads-summary", { as: BASIC.user, company: BASIC.co })).status).toBe(403);
    expect((await h.call("GET", "/v1/leads-summary", { as: PRO.user, company: PRO.co })).status).toBe(200);
    expect((await h.call("POST", "/v1/budget-check", { as: PRO.user, company: PRO.co, body: { accountId: ID.custA, amount: "1" } })).status).toBe(403);
  });
});
