import type { BookingStatus, ReceiptMethod, InstallmentStatus } from "@/lib/api/sales";

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const BOOKING_STATUS_CLASS: Record<BookingStatus, string> = {
  pending: "bg-warning/12 text-warning",
  confirmed: "bg-primary/12 text-primary",
  completed: "bg-success/12 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};
export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = { due: "Due", partial: "Part paid", paid: "Paid", waived: "Waived" };
export const INSTALLMENT_STATUS_CLASS: Record<InstallmentStatus, string> = {
  due: "bg-muted text-muted-foreground",
  partial: "bg-warning/12 text-warning",
  paid: "bg-success/12 text-success",
  waived: "bg-muted text-muted-foreground",
};
export const INSTALLMENT_KIND_LABEL: Record<string, string> = {
  down_payment: "Down payment",
  installment: "Installment",
  balloon: "Balloon payment",
  possession: "On possession",
};
export const RECEIPT_METHODS: { value: ReceiptMethod; label: string; needsRef: boolean; refLabel: string }[] = [
  { value: "cash", label: "Cash", needsRef: false, refLabel: "" },
  { value: "cheque", label: "Cheque", needsRef: true, refLabel: "Cheque number" },
  { value: "bank_transfer", label: "Bank transfer / IBFT", needsRef: true, refLabel: "Transfer reference" },
  { value: "online", label: "Online / mobile wallet", needsRef: true, refLabel: "Transaction ID" },
  { value: "pay_order", label: "Pay order / demand draft", needsRef: true, refLabel: "Pay order number" },
];
export const methodLabel = (m: string) => RECEIPT_METHODS.find((x) => x.value === m)?.label ?? (m === "split" ? "Several methods" : m);
