import { Ban, CheckCircle2, Clock, FileEdit, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { liveVoucherMeta, voucherStatusLabel } from "@/lib/live-vouchers";
import { useT } from "@/lib/i18n/provider";
import type { VoucherStatus, VoucherType } from "@/lib/api/finance";
import { cn } from "@/lib/utils";

const ACCENT = {
  success: "bg-success/12 text-success",
  destructive: "bg-destructive/10 text-destructive",
  primary: "bg-primary/12 text-primary",
  gold: "bg-gold/15 text-gold",
};

export function LiveVoucherTypeBadge({ type, className }: { type: VoucherType; className?: string }) {
  const meta = liveVoucherMeta(type);
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent font-medium", ACCENT[meta.accent], className)}>
      <meta.icon className="size-3" />
      {type}
    </Badge>
  );
}

const STATUS = {
  draft: { classes: "bg-muted text-muted-foreground", icon: FileEdit },
  pending: { classes: "bg-warning/12 text-warning", icon: Clock },
  approved: { classes: "bg-success/12 text-success", icon: CheckCircle2 },
  rejected: { classes: "bg-destructive/10 text-destructive", icon: Ban },
  void: { classes: "bg-muted text-muted-foreground line-through", icon: Undo2 },
} as const;

export function LiveVoucherStatusBadge({ status, className }: { status: VoucherStatus; className?: string }) {
  useT();
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", s.classes, className)}>
      <Icon className="size-3" />
      {voucherStatusLabel(status)}
    </span>
  );
}
