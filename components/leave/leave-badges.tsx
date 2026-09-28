import { Ban, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LeaveStatus, LeaveType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_CLASSES: Record<LeaveType, string> = {
  Casual: "bg-chart-3/15 text-chart-3",
  Sick: "bg-destructive/10 text-destructive",
  Annual: "bg-success/12 text-success",
  Unpaid: "bg-muted text-muted-foreground",
};

export function LeaveTypeBadge({ type, className }: { type: LeaveType; className?: string }) {
  return <Badge variant="outline" className={cn("border-transparent font-medium", TYPE_CLASSES[type], className)}>{type}</Badge>;
}

const STATUS_CONFIG: Record<LeaveStatus, { label: string; icon: typeof Clock; classes: string }> = {
  pending: { label: "Pending", icon: Clock, classes: "bg-warning/12 text-warning" },
  approved: { label: "Approved", icon: CheckCircle2, classes: "bg-success/12 text-success" },
  rejected: { label: "Rejected", icon: Ban, classes: "bg-destructive/10 text-destructive" },
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const c = STATUS_CONFIG[status];
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", c.classes)}>
      <Icon className="size-3" />
      {c.label}
    </span>
  );
}
