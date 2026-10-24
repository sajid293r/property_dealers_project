import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { FEATURES, PLAN_LIMITS, PLAN_NAME, SEAT_PACKS, VOUCHER_TIER } from "../src/plans.js";

// The server decides what a plan allows; the website decides what the menu shows. They must not drift apart.
const planTs = fs.readFileSync(new URL("../../lib/plan.ts", import.meta.url), "utf8");
const lines = planTs.split(/\r?\n/);

function menuTier(href: string): string | undefined {
  const line = lines.find((l) => l.includes(`{ href: "${href}",`));
  return line ? /minTier: "(\w+)"/.exec(line)?.[1] : undefined;
}

const MENU_FOR_FEATURE: Record<string, string> = {
  leads: "/dashboard/crm",
  quotations: "/dashboard/quotations",
  cheques: "/dashboard/cheques",
  service_invoices: "/dashboard/service-invoices",
  contracts: "/dashboard/contracts",
  contractors: "/dashboard/contractors",
  bank_reconciliation: "/dashboard/bank-reconciliation",
  budgets: "/dashboard/budgets",
  staff: "/dashboard/staff",
  leave: "/dashboard/leave",
  payroll: "/dashboard/payroll",
};

describe("plans: server and website agree", () => {
  it("gives every server-enforced feature the same tier as its menu entry", () => {
    for (const f of FEATURES) {
      const href = MENU_FOR_FEATURE[f.key];
      expect(href, `no menu entry mapped for ${f.key}`).toBeTruthy();
      expect(menuTier(href!), f.key).toBe(f.tier);
    }
  });

  it("keeps the sales-invoice page and invoice vouchers on Professional", () => {
    expect(menuTier("/dashboard/sales-invoices")).toBe("moderate");
    expect(Object.values(VOUCHER_TIER).every((t) => t === "moderate")).toBe(true);
  });

  it("names the plans Basic, Professional and Advanced everywhere", () => {
    expect(PLAN_NAME).toEqual({ basic: "Basic", moderate: "Professional", premium: "Advanced" });
    expect(planTs).toContain('moderate: "Professional"');
    expect(planTs).toContain('premium: "Advanced"');
  });

  it("keeps what a Basic company sees in the menu to ten entries", () => {
    // pages a real company on Basic can open: the basic-tier entries that exist for real companies (the demo-only
    // group overview and the not-yet-connected settings page are not among them), plus the Administration entry
    const basicHrefs = lines
      .filter((l) => /minTier: "basic"/.test(l) && /\{ href: "\/dashboard/.test(l) && !/demoOnly: true/.test(l))
      .map((l) => /href: "([^"]+)"/.exec(l)![1]!)
      .filter((h) => h !== "/dashboard/settings");
    expect(basicHrefs.length + 1).toBeLessThanOrEqual(10);
  });

  it("keeps prices, included seats and seat packs identical on the pricing page", () => {
    const price = (id: string) => Number(new RegExp(`id: "${id}",[\\s\\S]*?priceMonthlyPkr: (\\d+)`).exec(planTs)![1]);
    expect([price("basic"), price("moderate"), price("premium")]).toEqual([12000, 22000, 40000]);
    expect(Object.values(PLAN_LIMITS).map((l) => l.users)).toEqual([3, 10, 20]);
    expect(planTs).toContain('seats: "Up to 3 users"');
    expect(planTs).toContain('seats: "Up to 10 users"');
    expect(planTs).toContain('seats: "Up to 20 users"');
    for (const p of SEAT_PACKS) expect(planTs).toContain(`{ seats: ${p.seats}, priceMonthlyPkr: ${p.priceMonthlyPkr} }`);
  });
});

describe("browser access", () => {
  it("allows every HTTP method the screens use (a missing one silently breaks saving in the browser)", () => {
    const app = fs.readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
    const methods = /methods: \[([^\]]*)\]/.exec(app)?.[1] ?? "";
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) expect(methods, m).toContain(`"${m}"`);
  });
});
