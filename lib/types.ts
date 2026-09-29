import type { PermissionMatrix, RoleColor } from "@/lib/permissions";

export type PlanTier = "basic" | "moderate" | "premium";

export type UnitStatus = "available" | "reserved" | "sold";
export type UnitPaymentType = "cash" | "installment";

export interface Unit {
  id: string;
  code: string;
  title: string;
  project: string;
  category: string;
  sizeMarla: number;
  sqft: number;
  price: number;
  status: UnitStatus;
  paymentType: UnitPaymentType;
  block: string;
  imageUrl: string;
}

export type DealStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface Installment {
  id: string;
  dueDate: string;
  amount: number;
  paid: boolean;
  paidDate?: string;
}

export interface Deal {
  id: string;
  voucherNo: string;
  unitId: string;
  customerId: string;
  totalAmount: number;
  paidAmount: number;
  status: DealStatus;
  paymentType: UnitPaymentType;
  createdAt: string;
  installments: Installment[];
}

export type LeadStatus = "new" | "contacted" | "negotiation" | "won" | "lost";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: LeadStatus;
  assignedTo: string;
  interestedIn: string;
  createdAt: string;
  nextFollowUp?: string;
}

export interface Customer {
  id: string;
  name: string;
  cnic: string;
  phone: string;
  city: string;
  balance: number;
  totalPaid: number;
  createdAt: string;
}

export type StaffRole =
  | "admin"
  | "manager"
  | "agent"
  | "accountant"
  | "dealer";

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  phone: string;
  department: string;
  salary: number;
  balance: number;
  joinedAt: string;
  avatarUrl: string;
}

export type PayrollAdjustmentType = "increment" | "deduction" | "allowance" | "loan";
export type PayrollAdjustmentStatus = "pending" | "approved" | "rejected";

export interface PayrollAdjustment {
  id: string;
  staffId: string;
  type: PayrollAdjustmentType;
  amount: number;
  reason: string;
  effectiveDate: string;
  status: PayrollAdjustmentStatus;
  /** Increment only — lets an approval apply the new figure to the staff record. */
  previousSalary?: number;
  newSalary?: number;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export type LeaveType = "Casual" | "Sick" | "Annual" | "Unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  staffId: string;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export type AccountType = "cash" | "bank" | "petty";

export interface Account {
  id: string;
  code: string;
  title: string;
  bankName?: string;
  type: AccountType;
  balance: number;
}

export type TransactionKind = "credit" | "debit";

export interface Transaction {
  id: string;
  accountId: string;
  kind: TransactionKind;
  amount: number;
  title: string;
  category: string;
  date: string;
  confirmed: boolean;
}

export interface Expense {
  id: string;
  title: string;
  type: string;
  amount: number;
  paidVia: string;
  status: "paid" | "unpaid";
  date: string;
  /** Ties a cost back to a development project — matches `Unit.project` / `Project.name`. */
  project?: string;
}

export type ContractStatus = "active" | "expiring" | "expired";

export interface Contract {
  id: string;
  title: string;
  type: string;
  partyName: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
  value: number;
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "expired" | "converted";

export interface Quotation {
  id: string;
  number: string;
  date: string;
  validUntil: string;
  customerId: string;
  unitId: string;
  salesPerson: string;
  price: number;
  discountPercent: number;
  paymentTerms: string;
  remarks?: string;
  status: QuotationStatus;
  createdAt: string;
}

export type SalesInvoiceStatus = "unpaid" | "paid";

export interface SalesInvoice {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  customerId: string;
  dealId?: string;
  description: string;
  amount: number;
  paymentMode: string;
  status: SalesInvoiceStatus;
  createdAt: string;
}

export type ChequeStatus = "in_hand" | "deposited" | "cleared" | "bounced";

export interface PostDatedCheque {
  id: string;
  chequeNo: string;
  bankName: string;
  amount: number;
  chequeDate: string;
  receivedDate: string;
  customerId: string;
  dealId?: string;
  status: ChequeStatus;
  remarks?: string;
}

export type ServiceInvoiceStatus = "unpaid" | "paid";
export type ServiceType = "Maintenance" | "Security" | "Development Charges" | "Utility" | "Other";

export interface ServiceInvoice {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  customerId: string;
  unitId?: string;
  serviceType: ServiceType;
  period: string;
  amount: number;
  status: ServiceInvoiceStatus;
  createdAt: string;
}

/**
 * The five standard account classes (IFRS / Dynamics 365 "main account type" /
 * Odoo "account type" all agree on this split — everything else is a
 * sub-category underneath one of these five).
 */
export type AccountClass = "asset" | "liability" | "equity" | "income" | "expense";

export interface LedgerAccountNode {
  id: string;
  code: string;
  name: string;
  accountClass: AccountClass;
  /** Odoo-style account sub-type, e.g. "asset_cash", "liability_payable". */
  category: string;
  parentId?: string;
  /** Group/header row that only ever shows a rolled-up total of its children. */
  isGroup?: boolean;
}

export interface LedgerDrillDownItem {
  label: string;
  detail?: string;
  amount: number;
  date?: string;
}

export interface LedgerAccountBalance extends LedgerAccountNode {
  balance: number;
  drillDown: LedgerDrillDownItem[];
  depth: number;
}

/**
 * A role is a named, reusable bundle of module permissions. The seven
 * default roles ship with the system (isSystem: true, cannot be deleted —
 * but can be duplicated into a custom role); administrators can define
 * additional custom roles on top.
 */
export interface UserRole {
  id: string;
  name: string;
  description: string;
  color: RoleColor;
  isSystem: boolean;
  permissions: PermissionMatrix;
}

export type VoucherType = "CPV" | "CRV" | "BPV" | "BRV" | "JV";
export type VoucherStatus = "draft" | "pending" | "approved" | "rejected";

export interface VoucherLine {
  id: string;
  /** A postable leaf account id from the chart of accounts (`LedgerAccountNode.id`). */
  accountId: string;
  debit: number;
  credit: number;
  remarks?: string;
  costCenter?: string;
  project?: string;
}

export interface Voucher {
  id: string;
  type: VoucherType;
  number: string;
  date: string;
  /** Only meaningful for BPV/BRV (cheque-based bank vouchers). */
  chequeDate?: string;
  /** "Pay to" (CPV/BPV) or "Receive from" (CRV/BRV); unused for JV. */
  partyName?: string;
  description: string;
  lines: VoucherLine[];
  status: VoucherStatus;
  recurring: boolean;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  /** Approver's comment — used as the reason when a voucher is rejected. */
  approvalNote?: string;
}

export type SystemUserStatus = "active" | "invited" | "suspended";

/** A login/staff account within the ERP itself — distinct from Customer or StaffMember (HR roster). */
export interface SystemUser {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  avatarUrl: string;
  roleId: string;
  department: string;
  status: SystemUserStatus;
  lastActiveAt: string;
  createdAt: string;
}

export type ProjectType = "Residential" | "Commercial" | "Mixed-Use";
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";

/**
 * Master data for a development project (a housing scheme) — location,
 * timeline, ownership and the approved budget. Deliberately doesn't carry
 * totals like sales/receipts/actual-cost: those are derived on the fly from
 * Units, Vouchers and Expenses (see `lib/projects.ts`), the same way the
 * Chart of Accounts derives balances instead of storing them.
 */
export interface Project {
  id: string;
  code: string;
  /** Matches `Unit.project` — the project/scheme name units already carry. */
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  description: string;
  city: string;
  address: string;
  landAreaMarla: number;
  projectManagerId: string;
  /** Approved budget — a planning input, not a computed total. */
  budget: number;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string;
  handoverDate?: string;
  createdAt: string;
}

export type ContractorTrade =
  | "General Contractor"
  | "Civil Works"
  | "Electrical"
  | "Plumbing"
  | "Landscaping"
  | "Road & Infrastructure"
  | "Interior Finishing";

export interface Contractor {
  id: string;
  name: string;
  companyName: string;
  trade: ContractorTrade;
  phone: string;
  email: string;
  cnicOrNtn: string;
  address: string;
  rating: number;
  createdAt: string;
}

export type ConstructionContractStatus = "active" | "completed" | "terminated";

/** A construction contractor's engagement on a project — the thing that gets added/removed. */
export interface ConstructionContract {
  id: string;
  number: string;
  projectId: string;
  contractorId: string;
  scopeOfWork: string;
  contractValue: number;
  paidAmount: number;
  retentionPercent: number;
  startDate: string;
  endDate: string;
  status: ConstructionContractStatus;
  progressPercent: number;
  createdAt: string;
}
