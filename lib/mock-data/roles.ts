import type { UserRole } from "@/lib/types";
import { buildMatrix, fullMatrix } from "@/lib/permissions";

/**
 * The seven default roles a fresh tenant ships with (per the property-dealer
 * org chart: super admin down to project manager). Administrators can add
 * further custom roles on top of these from the Roles & Permissions screen.
 */
export const roles: UserRole[] = [
  {
    id: "super-admin",
    name: "Super Admin",
    description: "Unrestricted access to every module, including system and code-level configuration.",
    color: "destructive",
    isSystem: true,
    permissions: fullMatrix(),
  },
  {
    id: "administrator",
    name: "Administrator",
    description: "Defines new roles, assigns rights to users, and manages company-wide configuration.",
    color: "primary",
    isSystem: true,
    permissions: buildMatrix({
      administration: { view: true, create: true, edit: true, delete: true, approve: true },
      dashboard: { view: true },
      crm: { view: true, edit: true },
      deals: { view: true, edit: true },
      contracts: { view: true, edit: true },
      inventory: { view: true, edit: true },
      accounts: { view: true },
      expenses: { view: true },
      budgets: { view: true },
      reports: { view: true },
      staff: { view: true, create: true, edit: true, delete: true },
      payroll: { view: true },
      customers: { view: true, edit: true },
    }),
  },
  {
    id: "ceo-director",
    name: "CEO / Director",
    description: "Company-wide reports, selected dashboards and selected approvals — no data entry.",
    color: "violet",
    isSystem: true,
    permissions: buildMatrix({
      dashboard: { view: true },
      crm: { view: true },
      deals: { view: true, approve: true },
      contracts: { view: true, approve: true },
      inventory: { view: true },
      accounts: { view: true, approve: true },
      expenses: { view: true, approve: true },
      budgets: { view: true, approve: true },
      reports: { view: true },
      staff: { view: true },
      payroll: { view: true, approve: true },
      customers: { view: true },
    }),
  },
  {
    id: "cfo-financial-controller",
    name: "CFO / Financial Controller",
    description:
      "Approves financial vouchers, owns all financial reporting, budget/variance review, accounts closing and new-year start.",
    color: "gold",
    isSystem: true,
    permissions: buildMatrix({
      dashboard: { view: true },
      accounts: { view: true, create: true, edit: true, delete: true, approve: true },
      expenses: { view: true, create: true, edit: true, delete: true, approve: true },
      budgets: { view: true, create: true, edit: true, delete: true, approve: true },
      reports: { view: true, create: true, edit: true, approve: true },
      payroll: { view: true, approve: true },
      contracts: { view: true },
      customers: { view: true },
    }),
  },
  {
    id: "accounts-officer",
    name: "Accounts Officer",
    description:
      "Books accounts payable/receivable — cash payments, bank payments, cash receipts and bank receipts.",
    color: "blue",
    isSystem: true,
    permissions: buildMatrix({
      dashboard: { view: true },
      accounts: { view: true, create: true, edit: true },
      expenses: { view: true, create: true, edit: true },
      budgets: { view: true, create: true, edit: true },
      reports: { view: true },
      customers: { view: true },
      contracts: { view: true },
    }),
  },
  {
    id: "sales-officer",
    name: "Sales Officer",
    description: "Adds new properties and customers, and views the live inventory.",
    color: "success",
    isSystem: true,
    permissions: buildMatrix({
      dashboard: { view: true },
      crm: { view: true, create: true, edit: true },
      deals: { view: true, create: true },
      inventory: { view: true, create: true, edit: true },
      customers: { view: true, create: true, edit: true },
    }),
  },
  {
    id: "project-manager",
    name: "Project Manager",
    description: "Opens new projects/housing schemes and enters project budgets.",
    color: "warning",
    isSystem: true,
    permissions: buildMatrix({
      dashboard: { view: true },
      inventory: { view: true, create: true, edit: true },
      deals: { view: true },
      accounts: { view: true },
      budgets: { view: true, create: true, edit: true },
      reports: { view: true },
    }),
  },
];
