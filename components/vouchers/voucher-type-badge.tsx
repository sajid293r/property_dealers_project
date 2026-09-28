import { Badge } from "@/components/ui/badge";
import { voucherTypeMeta } from "@/lib/vouchers";
import type { VoucherType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCENT_CLASSES = {
  success: "bg-success/12 text-success",
  destructive: "bg-destructive/10 text-destructive",
  primary: "bg-primary/12 text-primary",
};

export function VoucherTypeBadge({ type, className }: { type: VoucherType; className?: string }) {
  const meta = voucherTypeMeta(type);
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent font-medium", ACCENT_CLASSES[meta.accent], className)}>
      <meta.icon className="size-3" />
      {type}
    </Badge>
  );
}
