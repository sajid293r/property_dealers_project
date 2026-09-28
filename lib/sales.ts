import type { ServiceType } from "@/lib/types";

export const PAYMENT_TERMS = ["Full Cash", "50% Advance", "20% Advance — Installments", "100% Advance"] as const;

export const PAYMENT_MODES = ["Cash", "Bank Transfer", "Cheque", "Card"] as const;

export const PAKISTANI_BANKS = [
  "HBL",
  "UBL",
  "MCB",
  "Meezan Bank",
  "Allied Bank",
  "Bank Alfalah",
  "Faysal Bank",
  "Standard Chartered",
] as const;

export const SERVICE_TYPES: ServiceType[] = ["Maintenance", "Security", "Development Charges", "Utility", "Other"];

export function isOverdue(dueDate: string, status: "unpaid" | "paid") {
  return status === "unpaid" && new Date(dueDate).getTime() < Date.now();
}

/** Zero-padded running number per document series, e.g. "QTN-00043". */
export function nextDocNumber(prefix: string, existing: { number: string }[]) {
  const maxSeq = existing.reduce((max, d) => {
    const seq = Number(d.number.split("-")[1]);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  return `${prefix}-${String(maxSeq + 1).padStart(5, "0")}`;
}
