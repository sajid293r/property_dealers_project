import { Ban, CheckCircle2, Clock, FileEdit } from "lucide-react";
import type { VoucherStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<VoucherStatus, { label: string; classes: string; icon: typeof Clock }> = {
  draft: { label: "Draft", classes: "bg-muted text-muted-foreground", icon: FileEdit },
  pending: { label: "Pending Approval", classes: "bg-warning/12 text-warning", icon: Clock },
  approved: { label: "Approved", classes: "bg-success/12 text-success", icon: CheckCircle2 },
  rejected: { label: "Rejected", classes: "bg-destructive/10 text-destructive", icon: Ban },
};

export function VoucherStatusBadge({ status, className }: { status: VoucherStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        config.classes,
        className,
      )}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}
