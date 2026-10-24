/**
 * The standard roles a new organization starts with. The module keys MUST match PERMISSION_MODULES in
 * lib/permissions.ts (the front end's permission grid); a test compares the two files so they cannot drift.
 * "Delete" is the action nobody gets by default except the owner: financial records are voided, not deleted.
 */
export const MODULE_KEYS = [
  "dashboard", "crm", "deals", "contracts", "inventory", "plotMap", "accounts", "expenses",
  "budgets", "reports", "staff", "payroll", "customers", "administration", "contractors", "leave",
] as const;

export interface Grant {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
}

export interface RoleDef {
  name: string;
  description: string;
  /** Applied to every module. */
  grant: Grant;
  /** Data scope for every module: own | team | branch | project | company. */
  scope: "own" | "team" | "branch" | "project" | "company";
  /** When given, only these modules are granted (everything else gets no access) and `grant` is ignored. */
  modules?: Partial<Record<(typeof MODULE_KEYS)[number], Grant>>;
}

const READ: Grant = { view: true, create: false, edit: false, delete: false, approve: false };
const WORK: Grant = { view: true, create: true, edit: true, delete: false, approve: false };
const NONE: Grant = { view: false, create: false, edit: false, delete: false, approve: false };

export const STANDARD_ROLES: RoleDef[] = [
  {
    name: "Owner",
    description: "Full control of the organization, including deleting records.",
    grant: { view: true, create: true, edit: true, delete: true, approve: true },
    scope: "company",
  },
  {
    name: "Administrator",
    description: "Runs the business day to day: everything except deleting records.",
    grant: { view: true, create: true, edit: true, delete: false, approve: true },
    scope: "company",
  },
  {
    name: "Sales Agent",
    description: "Works leads, quotations and bookings. Sees only the records they created.",
    grant: NONE,
    scope: "own",
    modules: { dashboard: READ, crm: WORK, deals: WORK, contracts: READ, inventory: READ, plotMap: READ, customers: WORK },
  },
  {
    name: "Accountant",
    description: "Prepares vouchers, invoices and reports. Approves nothing.",
    grant: NONE,
    scope: "company",
    modules: { dashboard: READ, accounts: WORK, expenses: WORK, reports: READ, customers: WORK, deals: READ, inventory: READ, budgets: READ, payroll: READ, contractors: READ, contracts: READ },
  },
  {
    name: "Viewer",
    description: "Can look at everything except people's pay, and change nothing.",
    grant: READ,
    scope: "company",
    modules: { dashboard: READ, crm: READ, deals: READ, contracts: READ, inventory: READ, plotMap: READ, accounts: READ, expenses: READ, budgets: READ, reports: READ, customers: READ, contractors: READ },
  },
];
