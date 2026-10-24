import { ArrowLeftRight, FileMinus2, FilePlus2, Landmark, Receipt, ReceiptText, ScrollText, Wallet, WalletCards, type LucideIcon } from "lucide-react";
import type { ChartAccount, InstrumentType, PartyRole, VoucherStatus, VoucherType } from "@/lib/api/finance";

/**
 * How each voucher is filled in. Every voucher except a Journal has ONE fixed side (cash, a bank account, a customer's
 * receivable, a supplier's payable) that the system works out from the lines, so a person never types it twice.
 *
 *   layout   what the screen looks like
 *   side     which side the typed lines are on (the fixed side is the opposite one)
 */
export type VoucherLayout = "journal" | "cash" | "bank" | "contra" | "invoice";

export interface LiveVoucherMeta {
  type: VoucherType;
  label: string;
  short: string;
  group: "Cash & bank" | "Sales" | "Purchases" | "Other";
  description: string;
  icon: LucideIcon;
  accent: "success" | "destructive" | "primary" | "gold";
  layout: VoucherLayout;
  /** Side of the lines a person types; null = both (journal). */
  side: "debit" | "credit" | null;
  partyLabel: string | null;
  partyRole?: PartyRole;
  partyRequired: boolean;
  linesTitle: string;
  linesHint: string;
  fixedSideLabel?: string;
  /** Which accounts make sense on the typed lines. */
  lineAccounts: (a: ChartAccount) => boolean;
}

const isCashOrBank = (a: ChartAccount) => a.category === "asset_cash" || a.category === "asset_bank";
const anyPostable = () => true;

export const LIVE_VOUCHER_TYPES: LiveVoucherMeta[] = [
  {
    type: "CPV", label: "Cash Payment Voucher", short: "Cash payment", group: "Cash & bank", description: "Cash paid out: expenses, supplier payments, advances.",
    icon: Wallet, accent: "destructive", layout: "cash", side: "debit", partyLabel: "Paid to", partyRequired: false,
    linesTitle: "What the cash was paid for", linesHint: "Each line is an expense or a payable that gets debited. Cash is credited for the total.", fixedSideLabel: "Cash credited",
    lineAccounts: (a) => !isCashOrBank(a),
  },
  {
    type: "CRV", label: "Cash Receipt Voucher", short: "Cash receipt", group: "Cash & bank", description: "Cash received: installments, bookings, other income.",
    icon: WalletCards, accent: "success", layout: "cash", side: "credit", partyLabel: "Received from", partyRequired: true,
    linesTitle: "What the cash was received for", linesHint: "Each line is a customer's balance or an income that gets credited. Cash is debited for the total.", fixedSideLabel: "Cash debited",
    lineAccounts: (a) => !isCashOrBank(a),
  },
  {
    type: "BPV", label: "Bank Payment Voucher", short: "Bank payment", group: "Cash & bank", description: "A payment from a bank account, by cheque or transfer.",
    icon: Landmark, accent: "destructive", layout: "bank", side: "debit", partyLabel: "Paid to", partyRequired: false,
    linesTitle: "What was paid for", linesHint: "Each line is an expense or a payable that gets debited. The bank account is credited for the total.", fixedSideLabel: "Bank credited",
    lineAccounts: (a) => !isCashOrBank(a),
  },
  {
    type: "BRV", label: "Bank Receipt Voucher", short: "Bank receipt", group: "Cash & bank", description: "Money received into a bank account: cheques, transfers, deposits.",
    icon: Landmark, accent: "success", layout: "bank", side: "credit", partyLabel: "Received from", partyRequired: true,
    linesTitle: "What it was received for", linesHint: "Each line is a customer's balance or an income that gets credited. The bank account is debited for the total.", fixedSideLabel: "Bank debited",
    lineAccounts: (a) => !isCashOrBank(a),
  },
  {
    type: "CV", label: "Contra Voucher", short: "Contra", group: "Cash & bank", description: "Move money between cash and bank accounts: deposits, withdrawals, transfers.",
    icon: ArrowLeftRight, accent: "primary", layout: "contra", side: "debit", partyLabel: null, partyRequired: false,
    linesTitle: "Money goes to", linesHint: "The account the money moves into. The account it comes from is credited for the total.", fixedSideLabel: "From account credited",
    lineAccounts: isCashOrBank,
  },
  {
    type: "SV", label: "Sales Voucher", short: "Sales", group: "Sales", description: "Invoice a customer: income and sales tax, with the amount due from them.",
    icon: ReceiptText, accent: "success", layout: "invoice", side: "credit", partyLabel: "Customer", partyRole: "customer", partyRequired: true,
    linesTitle: "Sold", linesHint: "Income and sales tax lines are credited. The customer's receivable is debited for the total.", fixedSideLabel: "Customer owes",
    lineAccounts: (a) => a.class === "income" || a.category === "liability_tax",
  },
  {
    type: "CN", label: "Credit Note", short: "Credit note", group: "Sales", description: "A sales return or allowance: reduces what a customer owes.",
    icon: FileMinus2, accent: "destructive", layout: "invoice", side: "debit", partyLabel: "Customer", partyRole: "customer", partyRequired: true,
    linesTitle: "Returned / allowed", linesHint: "Sales returns and tax reversed are debited. The customer's receivable is credited for the total.", fixedSideLabel: "Customer owes less",
    lineAccounts: (a) => a.class === "income" || a.category === "liability_tax",
  },
  {
    type: "PIV", label: "Purchase Invoice Voucher", short: "Purchase invoice", group: "Purchases", description: "A supplier's bill: costs and input tax, with the amount you owe them.",
    icon: Receipt, accent: "destructive", layout: "invoice", side: "debit", partyLabel: "Supplier", partyRole: "vendor", partyRequired: true,
    linesTitle: "Bought", linesHint: "Cost, asset and input-tax lines are debited. The supplier's payable is credited for the total.", fixedSideLabel: "You owe the supplier",
    lineAccounts: (a) => (a.class === "expense" || a.class === "asset") && !isCashOrBank(a) && a.category !== "asset_receivable",
  },
  {
    type: "DN", label: "Debit Note", short: "Debit note", group: "Purchases", description: "A purchase return or allowance: reduces what you owe a supplier.",
    icon: FilePlus2, accent: "success", layout: "invoice", side: "credit", partyLabel: "Supplier", partyRole: "vendor", partyRequired: true,
    linesTitle: "Returned / allowed", linesHint: "Purchase returns and tax reversed are credited. The supplier's payable is debited for the total.", fixedSideLabel: "You owe the supplier less",
    lineAccounts: (a) => a.class === "expense" || a.class === "asset",
  },
  {
    type: "JV", label: "Journal Voucher", short: "Journal", group: "Other", description: "Adjustments and non-cash entries: a debit section and a credit section that must balance.",
    icon: ScrollText, accent: "primary", layout: "journal", side: null, partyLabel: null, partyRequired: false,
    linesTitle: "Entries", linesHint: "Total debits must equal total credits.", lineAccounts: anyPostable,
  },
];

export const liveVoucherMeta = (type: VoucherType) => LIVE_VOUCHER_TYPES.find((t) => t.type === type)!;
export const isVoucherType = (v: string | null | undefined): v is VoucherType => !!v && LIVE_VOUCHER_TYPES.some((t) => t.type === v);

export const INSTRUMENTS: { value: InstrumentType; label: string; needsNumber: boolean }[] = [
  { value: "cheque", label: "Cheque", needsNumber: true },
  { value: "online_transfer", label: "Online transfer / IBFT", needsNumber: false },
  { value: "pay_order", label: "Pay order", needsNumber: true },
  { value: "demand_draft", label: "Demand draft", needsNumber: true },
  { value: "cash_deposit", label: "Cash deposit", needsNumber: false },
  { value: "other", label: "Other", needsNumber: false },
];

export const STATUS_LABEL: Record<VoucherStatus, string> = {
  draft: "Draft", pending: "Pending approval", approved: "Approved", rejected: "Rejected", void: "Void",
};
