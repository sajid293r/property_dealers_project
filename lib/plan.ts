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
  ClipboardList,
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
}

const TIER_RANK: Record<PlanTier, number> = { basic: 0, moderate: 1, premium: 2 };

export function tierMeets(current: PlanTier, minimum: PlanTier) {
  return TIER_RANK[current] >= TIER_RANK[minimum];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minTier: "basic", section: "Overview" },
  { href: "/dashboard/companies", label: "Group Overview", icon: Network, minTier: "basic", section: "Overview" },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban, minTier: "moderate", section: "Projects" },
  { href: "/dashboard/contractors", label: "Contractors", icon: HardHat, minTier: "moderate", section: "Projects" },
  { href: "/dashboard/crm", label: "Leads (CRM)", icon: Users2, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/quotations", label: "Quotations", icon: FileStack, minTier: "basic", section: "Sales & CRM" },
  { href: "/dashboard/deals", label: "Deals & Bookings", icon: Handshake, minTier: "basic", section: "Sales & CRM" },
  { href: "/dashboard/sales-invoices", label: "Sales Invoices", icon: ReceiptText, minTier: "basic", section: "Sales & CRM" },
  { href: "/dashboard/cheques", label: "Post-Dated Cheques", icon: CalendarClock, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/service-invoices", label: "Service Invoices", icon: Wrench, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/contracts", label: "Contracts", icon: FileSignature, minTier: "moderate", section: "Sales & CRM" },
  { href: "/dashboard/properties", label: "Properties", icon: Building2, minTier: "basic", section: "Portfolio" },
  { href: "/dashboard/plot-map", label: "Plot Map", icon: MapPinned, minTier: "premium", section: "Portfolio" },
  { href: "/dashboard/accounts", label: "Accounts", icon: Landmark, minTier: "basic", section: "Finance" },
  { href: "/dashboard/vouchers", label: "Vouchers", icon: ScrollText, minTier: "basic", section: "Finance" },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt, minTier: "basic", section: "Finance" },
  { href: "/dashboard/reports", label: "Reports", icon: FileText, minTier: "moderate", section: "Finance" },
  { href: "/dashboard/staff", label: "Staff", icon: UserSquare2, minTier: "basic", section: "People" },
  { href: "/dashboard/payroll", label: "Payroll", icon: Banknote, minTier: "moderate", section: "People" },
  { href: "/dashboard/leave", label: "Leave", icon: Palmtree, minTier: "moderate", section: "People" },
  { href: "/dashboard/customers", label: "Customers", icon: Wallet, minTier: "basic", section: "People" },
  {
    href: "/dashboard/administration/company-profile",
    label: "Company Profile",
    icon: ClipboardList,
    minTier: "basic",
    section: "Administration",
  },
  {
    href: "/dashboard/administration/users",
    label: "User Management",
    icon: UserCog,
    minTier: "basic",
    section: "Administration",
    children: [
      { href: "/dashboard/administration/users", label: "Users" },
      { href: "/dashboard/administration/roles", label: "Roles & Permissions" },
    ],
  },
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
      "Property / plot catalogue",
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
