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
