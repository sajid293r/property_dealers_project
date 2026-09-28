import { Ban, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { adjustmentTypeMeta } from "@/lib/payroll";
import type { PayrollAdjustmentStatus, PayrollAdjustmentType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCENT_CLASSES = {
  success: "bg-success/12 text-success",
  destructive: "bg-destructive/10 text-destructive",
  gold: "bg-gold/15 text-gold",
  primary: "bg-primary/12 text-primary",
};

export function AdjustmentTypeBadge({ type, className }: { type: PayrollAdjustmentType; className?: string }) {
  const meta = adjustmentTypeMeta(type);
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent font-medium", ACCENT_CLASSES[meta.accent], className)}>
      <meta.icon className="size-3" />
      {meta.label}
    </Badge>
  );
}

const STATUS_CONFIG: Record<PayrollAdjustmentStatus, { label: string; icon: typeof Clock; classes: string }> = {
  pending: { label: "Pending", icon: Clock, classes: "bg-warning/12 text-warning" },
  approved: { label: "Approved", icon: CheckCircle2, classes: "bg-success/12 text-success" },
  rejected: { label: "Rejected", icon: Ban, classes: "bg-destructive/10 text-destructive" },
};

export function AdjustmentStatusBadge({ status }: { status: PayrollAdjustmentStatus }) {
  const c = STATUS_CONFIG[status];
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", c.classes)}>
      <Icon className="size-3" />
      {c.label}
    </span>
  );
}
