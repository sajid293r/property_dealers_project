import { Landmark, ScrollText, Wallet, WalletCards, type LucideIcon } from "lucide-react";
import type { VoucherLine, VoucherStatus, VoucherType } from "@/lib/types";

export interface VoucherTypeMeta {
  type: VoucherType;
  label: string;
  shortLabel: string;
  /** Field label for the counterparty — null hides the field entirely (Journal Voucher). */
  partyLabel: string | null;
  showChequeDate: boolean;
  icon: LucideIcon;
  accent: "success" | "destructive" | "primary";
  description: string;
}

export const VOUCHER_TYPES: VoucherTypeMeta[] = [
  {
    type: "CPV",
    label: "Cash Payment Voucher",
    shortLabel: "Cash Payment",
    partyLabel: "Pay to",
    showChequeDate: false,
    icon: Wallet,
    accent: "destructive",
    description: "Cash paid out — expenses, payables, advances.",
  },
  {
    type: "CRV",
    label: "Cash Receipt Voucher",
    shortLabel: "Cash Receipt",
    partyLabel: "Receive from",
    showChequeDate: false,
    icon: WalletCards,
    accent: "success",
    description: "Cash received — installments, bookings, other income.",
  },
  {
    type: "BPV",
    label: "Bank Payment Voucher",
    shortLabel: "Bank Payment",
    partyLabel: "Pay to",
    showChequeDate: true,
    icon: Landmark,
    accent: "destructive",
    description: "Payment issued from a bank account, by cheque or transfer.",
  },
  {
    type: "BRV",
    label: "Bank Receipt Voucher",
    shortLabel: "Bank Receipt",
    partyLabel: "Receive from",
    showChequeDate: true,
    icon: Landmark,
    accent: "success",
    description: "Funds received into a bank account.",
  },
  {
    type: "JV",
    label: "Journal Voucher",
    shortLabel: "Journal",
    partyLabel: null,
    showChequeDate: false,
    icon: ScrollText,
    accent: "primary",
    description: "Adjusting or non-cash entries between any two ledger accounts.",
  },
];

export function voucherTypeMeta(type: VoucherType): VoucherTypeMeta {
  return VOUCHER_TYPES.find((t) => t.type === type)!;
}

export const VOUCHER_STATUSES: VoucherStatus[] = ["draft", "pending", "approved", "rejected"];

export const COST_CENTERS = ["Head Office", "Sales", "Operations", "Finance", "Marketing"] as const;

export function lineTotals(lines: VoucherLine[]) {
  const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  return { debit, credit, difference: Math.round((debit - credit) * 100) / 100 };
}

export function voucherTotal(lines: VoucherLine[]) {
  return Math.max(lineTotals(lines).debit, lineTotals(lines).credit);
}

/** A submittable voucher needs at least two posted lines and debits == credits. */
export function isBalanced(lines: VoucherLine[]) {
  const posted = lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
  if (posted.length < 2) return false;
  return lineTotals(lines).difference === 0;
}

export function emptyLine(id: string): VoucherLine {
  return { id, accountId: "", debit: 0, credit: 0, remarks: "", costCenter: "", project: "" };
}

/** Zero-padded running number per voucher type, e.g. "CPV-00043". */
export function formatVoucherNumber(type: VoucherType, sequence: number) {
  return `${type}-${String(sequence).padStart(5, "0")}`;
}
