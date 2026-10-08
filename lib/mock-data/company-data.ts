import {
  units,
  customers,
  deals,
  leads,
  staff,
  accounts,
  transactions,
  expenses,
  roles,
  systemUsers,
  vouchers,
  quotations,
  salesInvoices,
  postDatedCheques,
  serviceInvoices,
  payrollAdjustments,
  leaveRequests,
  projects,
  contractors,
  constructionContracts,
  budgets,
  budgetLines,
} from "@/lib/mock-data";
import { contracts } from "@/lib/mock-data/expenses";
import { monthlyCollections, weeklyCollections } from "@/lib/mock-data/trends";
import { PAKISTANI_FIRST_NAMES, PAKISTANI_LAST_NAMES } from "@/lib/mock-data/seed";

/**
 * Per-company data. Every record belongs to exactly one company. In this
 * prototype the base mock records are "Company 1"; other seeded companies are
 * derived from them (different project names, people, cities and money scale,
 * a different subset of projects) and any company created at runtime starts
 * empty. When a real backend lands, `getDataset(companyId)` is the seam: it
 * becomes a tenant-scoped query and nothing above it changes.
 */
const BASE = {
  units,
  customers,
  deals,
  leads,
  staff,
  accounts,
  transactions,
  expenses,
  contracts,
  roles,
  systemUsers,
  vouchers,
  quotations,
  salesInvoices,
  postDatedCheques,
  serviceInvoices,
  payrollAdjustments,
  leaveRequests,
  projects,
  contractors,
  constructionContracts,
  budgets,
  budgetLines,
};

export type CompanyDataset = typeof BASE;

interface Profile {
  prefix: string;
  /** Multiplier for money-like fields. */
  factor: number;
  /** Rotates the first/last name lists so people differ from other companies. */
  nameShift: number;
  /** Indexes into the base projects list that this company owns. */
  keepProjects: number[];
  /** How many of the base customers this company has. */
  keepCustomers: number;
  projectNames: Record<string, string>;
  cities: Record<string, string>;
}

const PROFILES: Record<string, Profile | undefined> = {
  "co-2": {
    prefix: "c2",
    factor: 1.5,
    nameShift: 5,
    keepProjects: [0, 1, 3],
    keepCustomers: 21,
    projectNames: {
      "Green Valley Homes": "Capital Heights",
      "Al-Noor Heights": "Margalla Towers",
      "Riverside Enclave": "Blue Area Residency",
      "Emerald Gardens": "Kuri Greens",
    },
    cities: { Lahore: "Islamabad", Rawalpindi: "Islamabad" },
  },
  "co-3": {
    prefix: "c3",
    factor: 0.5,
    nameShift: 11,
    keepProjects: [1, 2],
    keepCustomers: 14,
    projectNames: {
      "Green Valley Homes": "Clifton Crest",
      "Al-Noor Heights": "Seaview Towers",
      "Riverside Enclave": "Marina Residency",
      "Emerald Gardens": "DHA Gardens",
    },
    cities: { Lahore: "Karachi", Islamabad: "Karachi", Rawalpindi: "Karachi", Faisalabad: "Karachi" },
  },
};

/** Money factor used to scale chart series for a company (0 for an empty one). */
export function companyScale(companyId: string) {
  if (companyId === "co-1") return 1;
  return PROFILES[companyId]?.factor ?? 0;
}

const ID_RE = /^[a-z]+(?:-[a-z]+)*-\d+$/;
const MONEY_KEY = /(amount|price|balance|salary|budget|total|value|paid|cost|fee|rent|advance|loan|commission|debit|credit)/i;
const NOT_MONEY_KEY = /(ratio|percent|count|index|offset|id$|sqft|marla)/i;

function rotate<T extends string>(list: readonly T[], shift: number) {
  const map = new Map<string, string>();
  list.forEach((n, i) => map.set(n.toLowerCase(), list[(i + shift) % list.length]));
  return map;
}

function buildTransformer(p: Profile) {
  const first = rotate(PAKISTANI_FIRST_NAMES, p.nameShift);
  const last = rotate(PAKISTANI_LAST_NAMES, p.nameShift);
  const nameRe = new RegExp(`\\b(${[...PAKISTANI_FIRST_NAMES, ...PAKISTANI_LAST_NAMES].join("|")})\\b`, "gi");

  const str = (v: string): string => {
    if (ID_RE.test(v)) return `${p.prefix}-${v}`;
    let out = v.replace(/u=([a-z]+-\d+)/, `u=${p.prefix}-$1`);
    for (const [from, to] of Object.entries(p.projectNames)) out = out.split(from).join(to);
    for (const [from, to] of Object.entries(p.cities)) out = out.split(from).join(to);
    return out.replace(nameRe, (m) => {
      const mapped = first.get(m.toLowerCase()) ?? last.get(m.toLowerCase()) ?? m;
      return m[0] === m[0].toLowerCase() ? mapped.toLowerCase() : mapped;
    });
  };

  const walk = (v: unknown, key: string): unknown => {
    if (typeof v === "string") return str(v);
    if (typeof v === "number") return MONEY_KEY.test(key) && !NOT_MONEY_KEY.test(key) ? Math.round(v * p.factor) : v;
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    }
    return v;
  };
  return <T>(value: T) => walk(value, "") as T;
}

/** Drops records that reference parents which don't exist in this company. */
function cascade(ds: CompanyDataset): CompanyDataset {
  const refs: Record<string, Set<string>> = {
    unitId: new Set(ds.units.map((x) => x.id)),
    customerId: new Set(ds.customers.map((x) => x.id)),
    dealId: new Set(ds.deals.map((x) => x.id)),
    projectId: new Set(ds.projects.map((x) => x.id)),
    budgetId: new Set(ds.budgets.map((x) => x.id)),
  };
  const out: Record<string, unknown> = { ...ds };
  for (let pass = 0; pass < 2; pass++) {
    for (const [name, rows] of Object.entries(out)) {
      if (!Array.isArray(rows)) continue;
      out[name] = rows.filter((row) =>
        Object.entries(refs).every(([field, ids]) => {
          const ref = (row as Record<string, unknown>)[field];
          return typeof ref !== "string" || ids.has(ref);
        }),
      );
    }
    refs.unitId = new Set((out.units as { id: string }[]).map((x) => x.id));
    refs.dealId = new Set((out.deals as { id: string }[]).map((x) => x.id));
    refs.budgetId = new Set((out.budgets as { id: string }[]).map((x) => x.id));
  }
  return out as CompanyDataset;
}

function emptyDataset(): CompanyDataset {
  return {
    units: [],
    customers: [],
    deals: [],
    leads: [],
    staff: [],
    accounts: [],
    transactions: [],
    expenses: [],
    contracts: [],
    roles, // permission roles are a platform concept shared by all companies
    systemUsers: [],
    vouchers: [],
    quotations: [],
    salesInvoices: [],
    postDatedCheques: [],
    serviceInvoices: [],
    payrollAdjustments: [],
    leaveRequests: [],
    projects: [],
    contractors: [],
    constructionContracts: [],
    budgets: [],
    budgetLines: [],
  };
}

function deriveDataset(p: Profile): CompanyDataset {
  const xf = buildTransformer(p);
  const keptProjects = BASE.projects.filter((_, i) => p.keepProjects.includes(i));
  const keptNames = new Set(keptProjects.map((x) => xf(x).name));

  const mapped = Object.fromEntries(
    Object.entries(BASE).map(([k, v]) => [k, k === "roles" ? v : xf(v)]),
  ) as CompanyDataset;

  return cascade({
    ...mapped,
    projects: mapped.projects.filter((x) => keptNames.has(x.name)),
    units: mapped.units.filter((x) => keptNames.has(x.project)),
    customers: mapped.customers.slice(0, p.keepCustomers),
    expenses: mapped.expenses.filter((x) => !x.project || keptNames.has(x.project)),
  });
}

const cache = new Map<string, CompanyDataset>();

export function getDataset(companyId: string): CompanyDataset {
  let ds = cache.get(companyId);
  if (!ds) {
    if (companyId === "co-1") ds = BASE;
    else {
      const profile = PROFILES[companyId];
      ds = profile ? deriveDataset(profile) : emptyDataset();
    }
    cache.set(companyId, ds);
  }
  return ds;
}

export function getTrends(companyId: string) {
  const k = companyScale(companyId);
  return {
    monthly: monthlyCollections.map((m) => ({
      ...m,
      collections: Math.round(m.collections * k),
      target: Math.round(m.target * k),
    })),
    weekly: weeklyCollections.map((w) => ({ ...w, collections: Math.round(w.collections * k) })),
  };
}
