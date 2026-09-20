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
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  minTier: PlanTier;
  section: string;
}

const TIER_RANK: Record<PlanTier, number> = { basic: 0, moderate: 1, premium: 2 };

export function tierMeets(current: PlanTier, minimum: PlanTier) {
  return TIER_RANK[current] >= TIER_RANK[minimum];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minTier: "basic", section: "Overview" },
  { href: "/dashboard/crm", label: "Leads (CRM)", icon: Users2, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/deals", label: "Deals & Bookings", icon: Handshake, minTier: "basic", section: "Sales & CRM" },
  { href: "/dashboard/contracts", label: "Contracts", icon: FileSignature, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/inventory", label: "Inventory / Units", icon: Building2, minTier: "basic", section: "Inventory" },
  { href: "/dashboard/plot-map", label: "Plot Map", icon: MapPinned, minTier: "premium", section: "Inventory" },
  { href: "/dashboard/accounts", label: "Accounts", icon: Landmark, minTier: "basic", section: "Finance" },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt, minTier: "basic", section: "Finance" },
  { href: "/dashboard/reports", label: "Reports", icon: FileText, minTier: "moderate", section: "Finance" },
  { href: "/dashboard/staff", label: "Staff", icon: UserSquare2, minTier: "basic", section: "People" },
  { href: "/dashboard/payroll", label: "Payroll", icon: Banknote, minTier: "moderate", section: "People" },
  { href: "/dashboard/customers", label: "Customers", icon: Wallet, minTier: "basic", section: "People" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, minTier: "basic", section: "Configuration" },
];

export const PLAN_LABEL: Record<PlanTier, string> = {
  basic: "Basic",
  moderate: "Moderate",
  premium: "Premium",
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
    priceMonthlyPkr: 4999,
    tagline: "For independent dealers getting organized.",
    seats: "Up to 2 staff seats",
    features: [
      "Unit / plot catalogue",
      "Bookings & simple installment sales",
      "Single cash account ledger",
      "Expense vouchers",
      "Basic PDF exports",
    ],
  },
  {
    id: "moderate",
    name: "Moderate",
    priceMonthlyPkr: 12999,
    tagline: "For growing agencies with a sales team.",
    seats: "Up to 15 staff seats",
    highlight: true,
    features: [
      "Everything in Basic",
      "Leads pipeline & follow-ups (CRM)",
      "Multiple accounts, double-entry accounting",
      "Staff ledger & payroll",
      "Contract expiry tracking",
      "Full financial reports",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    priceMonthlyPkr: 27999,
    tagline: "For developers & multi-branch networks.",
    seats: "Unlimited staff seats",
    features: [
      "Everything in Moderate",
      "Interactive plot map",
      "Dealer commission tracking",
      "Automated WhatsApp/SMS campaigns",
      "Multi-branch consolidated reporting",
      "White-label branding & API access",
    ],
  },
];
