import {
  LayoutDashboard,
  Users2,
  Handshake,
  FileSignature,
  Building2,
  MapPinned,
  Landmark,
  Receipt,
  FileText,
  UserSquare2,
  Banknote,
  Wallet,
  ShieldCheck,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";

/**
 * Central catalogue of modules a role/user can be granted access to. Drives
 * the permission matrix editor, role summaries and the user detail view —
 * add a module here once and it shows up everywhere permissions are shown.
 */
export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "crm", label: "CRM & Leads", icon: Users2 },
  { key: "deals", label: "Deals & Bookings", icon: Handshake },
  { key: "contracts", label: "Contracts", icon: FileSignature },
  { key: "inventory", label: "Properties", icon: Building2 },
  { key: "plotMap", label: "Plot Map", icon: MapPinned },
  { key: "accounts", label: "Accounts", icon: Landmark },
  { key: "expenses", label: "Expenses", icon: Receipt },
  { key: "budgets", label: "Budgets", icon: PiggyBank },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "staff", label: "Staff", icon: UserSquare2 },
  { key: "payroll", label: "Payroll", icon: Banknote },
  { key: "customers", label: "Customers", icon: Wallet },
  { key: "administration", label: "Administration", icon: ShieldCheck },
] as const satisfies { key: string; label: string; icon: LucideIcon }[];

export type ModuleKey = (typeof PERMISSION_MODULES)[number]["key"];

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "approve"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type ModulePermission = Record<PermissionAction, boolean>;
export type PermissionMatrix = Record<ModuleKey, ModulePermission>;

const NONE: ModulePermission = { view: false, create: false, edit: false, delete: false, approve: false };
const FULL: ModulePermission = { view: true, create: true, edit: true, delete: true, approve: true };

export function emptyMatrix(): PermissionMatrix {
  return Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, { ...NONE }])) as PermissionMatrix;
}

export function fullMatrix(): PermissionMatrix {
  return Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, { ...FULL }])) as PermissionMatrix;
}

/** Builds a matrix from a sparse set of overrides; anything left out defaults to no access. */
export function buildMatrix(
  overrides: Partial<Record<ModuleKey, Partial<ModulePermission>>>,
): PermissionMatrix {
  const matrix = emptyMatrix();
  for (const [key, perm] of Object.entries(overrides)) {
    matrix[key as ModuleKey] = { ...NONE, ...perm };
  }
  return matrix;
}

export function accessLevel(perm: ModulePermission): "full" | "partial" | "none" {
  const values = Object.values(perm);
  if (values.every(Boolean)) return "full";
  if (values.some(Boolean)) return "partial";
  return "none";
}

/** Number of modules a matrix grants at least some access to. */
export function moduleCount(matrix: PermissionMatrix) {
  return Object.values(matrix).filter((p) => accessLevel(p) !== "none").length;
}

export type RoleColor = "primary" | "gold" | "success" | "warning" | "destructive" | "violet" | "blue";

export const ROLE_COLOR_CLASSES: Record<RoleColor, { bg: string; text: string; ring: string }> = {
  primary: { bg: "bg-primary/12", text: "text-primary", ring: "ring-primary/20" },
  gold: { bg: "bg-gold/15", text: "text-gold", ring: "ring-gold/25" },
  success: { bg: "bg-success/15", text: "text-success", ring: "ring-success/20" },
  warning: { bg: "bg-warning/15", text: "text-warning", ring: "ring-warning/20" },
  destructive: { bg: "bg-destructive/12", text: "text-destructive", ring: "ring-destructive/20" },
  violet: { bg: "bg-chart-5/15", text: "text-chart-5", ring: "ring-chart-5/25" },
  blue: { bg: "bg-chart-3/15", text: "text-chart-3", ring: "ring-chart-3/25" },
};
