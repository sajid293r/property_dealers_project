import { AppError } from "./errors.js";

/**
 * What each subscription plan includes. This is the SERVER's copy: a page hidden from the menu is not protected, a
 * refused request is. The website keeps its own list (lib/plan.ts) for menus and the pricing page; a test compares the two.
 *
 *   basic         run the sales desk and the books: projects, properties, customers, bookings and receipts, accounts,
 *                 cash/bank vouchers, expenses, reports. Up to 3 users, the two standard roles.
 *   professional  (stored as "moderate") add the sales pipeline and billing: leads, quotations, sales/service invoices,
 *                 post-dated cheques, contracts, contractors, bank reconciliation. Up to 10 users, custom roles.
 *   advanced      (stored as "premium") add control of the whole organization: budgets, staff, payroll and leave,
 *                 plot map, group overview. Up to 20 users.
 *
 * Seats: every plan includes some (PLAN_LIMITS); more are bought as monthly packs (SEAT_PACKS) and recorded on the
 * organization as `extra_seats`. The limit that applies is included + extra.
 */
export type Plan = "basic" | "moderate" | "premium";
export const PLAN_RANK: Record<Plan, number> = { basic: 0, moderate: 1, premium: 2 };
export const PLAN_NAME: Record<Plan, string> = { basic: "Basic", moderate: "Professional", premium: "Advanced" };

export const PLAN_LIMITS: Record<Plan, { users: number; customRoles: boolean }> = {
  basic: { users: 3, customRoles: false },
  moderate: { users: 10, customRoles: true },
  premium: { users: 20, customRoles: true },
};

/** Extra seats, bought per month on any plan. */
export const SEAT_PACKS = [
  { seats: 3, priceMonthlyPkr: 4000 },
  { seats: 5, priceMonthlyPkr: 6000 },
  { seats: 10, priceMonthlyPkr: 8000 },
] as const;

export interface Feature {
  key: string;
  name: string;
  tier: Plan;
  /** Request paths (after /v1) this feature owns. */
  paths: RegExp;
}

export const FEATURES: Feature[] = [
  { key: "leads", name: "Leads (CRM)", tier: "moderate", paths: /^\/v1\/leads(\/|$)/ },
  { key: "quotations", name: "Quotations", tier: "moderate", paths: /^\/v1\/quotations(\/|$)/ },
  { key: "cheques", name: "Post-dated cheques", tier: "moderate", paths: /^\/v1\/cheques(\/|$)/ },
  { key: "service_invoices", name: "Service invoices", tier: "moderate", paths: /^\/v1\/service-invoices(\/|$)/ },
  { key: "contracts", name: "Contracts", tier: "moderate", paths: /^\/v1\/contracts(\/|$)/ },
  { key: "contractors", name: "Contractors", tier: "moderate", paths: /^\/v1\/(construction|contractors)(\/|$)/ },
  {
    key: "bank_reconciliation",
    name: "Bank reconciliation",
    tier: "moderate",
    paths: /^\/v1\/(bank-statements|bank-statement-lines|reconciliations|ledger-lines)(\/|$)|^\/v1\/bank-accounts\/[^/]+\/(statements|reconciliations)(\/|$)/,
  },
  { key: "budgets", name: "Budgets", tier: "premium", paths: /^\/v1\/budgets(\/|$)/ },
  { key: "staff", name: "Staff", tier: "premium", paths: /^\/v1\/employees(\/|$)/ },
  { key: "leave", name: "Leave", tier: "premium", paths: /^\/v1\/leave(\/|$)/ },
  { key: "payroll", name: "Payroll", tier: "premium", paths: /^\/v1\/payroll(\/|$)/ },
];

/** Voucher types that belong to the Professional plan (invoicing); cash and bank vouchers and journals are in every plan. */
export const VOUCHER_TIER: Record<string, Plan> = { SV: "moderate", CN: "moderate", PIV: "moderate", DN: "moderate" };

export function planAllows(plan: Plan, needed: Plan): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[needed];
}

export function requirePlan(plan: Plan, needed: Plan, what: string): void {
  if (!planAllows(plan, needed)) {
    throw new AppError(
      403,
      "plan_upgrade",
      `${what} is part of the ${PLAN_NAME[needed]} plan${needed === "moderate" ? " and above" : ""}. Your company is on ${PLAN_NAME[plan]}; ask your administrator to upgrade.`,
      { needed, current: plan },
    );
  }
}

export function featureFor(path: string): Feature | undefined {
  return FEATURES.find((f) => f.paths.test(path));
}
