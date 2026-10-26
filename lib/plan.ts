import { isConnectedRoute } from "@/lib/live-routes";
import type { PlanTier } from "@/lib/types";
import {
  LayoutDashboard,
  Users2,
  Building2,
  Handshake,
  Wallet,
  Landmark,
  UserSquare2,
  Banknote,
  Receipt,
  FileText,
  FileSignature,
  MapPinned,
  Settings,
  UserCog,
  ScrollText,
  FileStack,
  ReceiptText,
  CalendarClock,
  Wrench,
  Palmtree,
  FolderKanban,
  HardHat,
  Network,
  PiggyBank,
  Scale,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  href: string;
  label: string;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  minTier: PlanTier;
  section: string;
  children?: NavChild[];
  /** Built on the demo companies' data: hidden for a real (signed-in) company. */
  demoOnly?: boolean;
  /** Only exists for real companies (no demo version). */
  liveOnly?: boolean;
}

/** Dictionary key of a menu section, e.g. "Sales & CRM" -> nav.section.sales */
const SECTION_KEYS: Record<string, string> = {
  Overview: "overview",
  Projects: "projects",
  "Sales & CRM": "sales",
  Portfolio: "portfolio",
  Finance: "finance",
  People: "people",
  Administration: "administration",
  Configuration: "configuration",
};
export const navSectionKey = (section: string) => `nav.section.${SECTION_KEYS[section] ?? section}`;
/** Dictionary key of a menu item: /dashboard/crm -> nav.item.crm. A parent with sub-pages is named after its folder. */
export function navItemKey(item: { href: string; children?: unknown[] }) {
  const path = item.href.replace(/^\/dashboard\/?/, "");
  if (!path) return "nav.item.dashboard";
  return `nav.item.${item.children ? path.split("/")[0] : path.replace(/\//g, ".")}`;
}
export const navChildKey = (child: { href: string }) => `nav.item.${child.href.replace(/^\/dashboard\//, "").replace(/\//g, ".")}`;

const TIER_RANK: Record<PlanTier, number> = { basic: 0, moderate: 1, premium: 2 };

export function tierMeets(current: PlanTier, minimum: PlanTier) {
  return TIER_RANK[current] >= TIER_RANK[minimum];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minTier: "basic", section: "Overview" },
  { href: "/dashboard/companies", label: "Group Overview", icon: Network, minTier: "premium", section: "Overview", demoOnly: true },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban, minTier: "basic", section: "Projects" },
  { href: "/dashboard/contractors", label: "Contractors", icon: HardHat, minTier: "moderate", section: "Projects" },
  { href: "/dashboard/crm", label: "Leads (CRM)", icon: Users2, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/quotations", label: "Quotations", icon: FileStack, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/deals", label: "Deals & Bookings", icon: Handshake, minTier: "basic", section: "Sales & CRM" },
  { href: "/dashboard/sales-invoices", label: "Sales Invoices", icon: ReceiptText, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/cheques", label: "Post-Dated Cheques", icon: CalendarClock, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/service-invoices", label: "Service Invoices", icon: Wrench, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/contracts", label: "Contracts", icon: FileSignature, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/properties", label: "Properties", icon: Building2, minTier: "basic", section: "Portfolio" },
  { href: "/dashboard/plot-map", label: "Plot Map", icon: MapPinned, minTier: "premium", section: "Portfolio" },
  { href: "/dashboard/accounts", label: "Accounts", icon: Landmark, minTier: "basic", section: "Finance" },
  { href: "/dashboard/vouchers", label: "Vouchers", icon: ScrollText, minTier: "basic", section: "Finance" },
  { href: "/dashboard/bank-reconciliation", label: "Bank Reconciliation", icon: Scale, minTier: "moderate", section: "Finance", liveOnly: true },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt, minTier: "basic", section: "Finance" },
  { href: "/dashboard/budgets", label: "Budgets", icon: PiggyBank, minTier: "premium", section: "Finance" },
  { href: "/dashboard/reports", label: "Reports", icon: FileText, minTier: "basic", section: "Finance" },
  { href: "/dashboard/staff", label: "Staff", icon: UserSquare2, minTier: "premium", section: "People" },
  { href: "/dashboard/payroll", label: "Payroll", icon: Banknote, minTier: "premium", section: "People" },
  { href: "/dashboard/leave", label: "Leave", icon: Palmtree, minTier: "premium", section: "People" },
  { href: "/dashboard/customers", label: "Customers", icon: Wallet, minTier: "basic", section: "People" },
  {
    href: "/dashboard/administration/users",
    label: "Administration",
    icon: UserCog,
    minTier: "basic",
    section: "Administration",
    children: [
      { href: "/dashboard/administration/users", label: "Users" },
      { href: "/dashboard/administration/roles", label: "Roles & Permissions" },
      { href: "/dashboard/administration/company-profile", label: "Company Profile" },
      { href: "/dashboard/administration/activity", label: "Activity log" },
    ],
  },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, minTier: "basic", section: "Configuration" },
];

/**
 * What a plan's sidebar shows: only the pages the plan includes, plus how many more an upgrade would add.
 * (The ⌘K palette still lists everything, with a lock, so nothing is hidden from search.)
 */
/** The plan a page needs (the most specific menu entry that owns the address), or null for pages outside the menu. */
export function tierNeededFor(pathname: string): PlanTier | null {
  let best: { len: number; tier: PlanTier } | null = null;
  for (const i of NAV_ITEMS) {
    const hrefs = [i.href, ...(i.children?.map((c) => c.href) ?? [])];
    for (const h of hrefs) {
      if (h === "/dashboard" ? pathname === h : pathname === h || pathname.startsWith(h + "/")) {
        if (!best || h.length > best.len) best = { len: h.length, tier: i.minTier };
      }
    }
  }
  return best?.tier ?? null;
}

export function navAvailable(live: boolean) {
  // A real company only sees pages that are wired to real data; the demo shows everything.
  return NAV_ITEMS.filter((i) => (live ? !i.demoOnly && isConnectedRoute(i.href) : !i.liveOnly));
}

export function navForTier(tier: PlanTier, opts: { live?: boolean } = {}) {
  const available = navAvailable(!!opts.live);
  const visible = available.filter((i) => tierMeets(tier, i.minTier));
  return { visible, moreCount: available.length - visible.length };
}

export const PLAN_LABEL: Record<PlanTier, string> = {
  basic: "Basic",
  moderate: "Professional",
  premium: "Advanced",
};

export interface PricingTier {
  id: PlanTier;
  name: string;
  priceMonthlyPkr: number;
  tagline: string;
  seats: string;
  highlight?: boolean;
  features: string[];
}

export const PRICING: PricingTier[] = [
  {
    id: "basic",
    name: "Basic",
    priceMonthlyPkr: 12000,
    tagline: "Run your sales desk and your books.",
    seats: "Up to 3 users",
    features: [
      "Projects, properties and customers",
      "Bookings, payment plans and receipts",
      "Accounts, cash and bank vouchers, journals",
      "Expenses and core financial reports",
      "Owner dashboard: collections, dues, cash",
    ],
  },
  {
    id: "moderate",
    name: "Professional",
    priceMonthlyPkr: 22000,
    tagline: "For developers with a sales team and contractors.",
    seats: "Up to 10 users",
    highlight: true,
    features: [
      "Everything in Basic",
      "Leads pipeline and quotations that become bookings",
      "Sales and service invoices, credit and debit notes",
      "Post-dated cheque register",
      "Bank reconciliation",
      "Contracts with expiry tracking",
      "Contractor agreements, bills and retention",
      "Custom roles and permissions",
    ],
  },
  {
    id: "premium",
    name: "Advanced",
    priceMonthlyPkr: 40000,
    tagline: "Control the whole organization.",
    seats: "Up to 20 users",
    features: [
      "Everything in Professional",
      "Budgets with spending control and approvals",
      "Staff, leave and payroll posted to the books",
      "Interactive plot map",
      "Group overview across companies",
      "Priority support",
    ],
  },
];

/** Extra user seats, bought per month on any plan (kept in step with SEAT_PACKS in api/src/plans.ts). */
export const SEAT_PACKS = [
  { seats: 3, priceMonthlyPkr: 4000 },
  { seats: 5, priceMonthlyPkr: 6000 },
  { seats: 10, priceMonthlyPkr: 8000 },
] as const;
