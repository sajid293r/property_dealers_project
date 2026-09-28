import { Ban, CheckCircle2, Clock, FileEdit, Landmark, Send } from "lucide-react";
import type { ChequeStatus, QuotationStatus, ServiceInvoiceStatus } from "@/lib/types";
import { isOverdue } from "@/lib/sales";
import { cn } from "@/lib/utils";

function Pill({
  icon: Icon,
  label,
  classes,
}: {
  icon: typeof Clock;
  label: string;
  classes: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", classes)}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

const QUOTATION_CONFIG: Record<QuotationStatus, { label: string; icon: typeof Clock; classes: string }> = {
  draft: { label: "Draft", icon: FileEdit, classes: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", icon: Send, classes: "bg-primary/12 text-primary" },
  accepted: { label: "Accepted", icon: CheckCircle2, classes: "bg-success/12 text-success" },
  expired: { label: "Expired", icon: Clock, classes: "bg-warning/12 text-warning" },
  converted: { label: "Converted", icon: CheckCircle2, classes: "bg-gold/15 text-gold" },
};

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  const c = QUOTATION_CONFIG[status];
  return <Pill icon={c.icon} label={c.label} classes={c.classes} />;
}

export function InvoiceStatusBadge({ status, dueDate }: { status: "unpaid" | "paid"; dueDate: string }) {
  if (status === "paid") return <Pill icon={CheckCircle2} label="Paid" classes="bg-success/12 text-success" />;
  if (isOverdue(dueDate, status)) return <Pill icon={Clock} label="Overdue" classes="bg-destructive/10 text-destructive" />;
  return <Pill icon={Clock} label="Unpaid" classes="bg-warning/12 text-warning" />;
}

const CHEQUE_CONFIG: Record<ChequeStatus, { label: string; icon: typeof Clock; classes: string }> = {
  in_hand: { label: "In Hand", icon: Clock, classes: "bg-muted text-muted-foreground" },
  deposited: { label: "Deposited", icon: Landmark, classes: "bg-primary/12 text-primary" },
  cleared: { label: "Cleared", icon: CheckCircle2, classes: "bg-success/12 text-success" },
  bounced: { label: "Bounced", icon: Ban, classes: "bg-destructive/10 text-destructive" },
};

export function ChequeStatusBadge({ status }: { status: ChequeStatus }) {
  const c = CHEQUE_CONFIG[status];
  return <Pill icon={c.icon} label={c.label} classes={c.classes} />;
}

export function ServiceInvoiceStatusBadge({ status, dueDate }: { status: ServiceInvoiceStatus; dueDate: string }) {
  return <InvoiceStatusBadge status={status} dueDate={dueDate} />;
}
