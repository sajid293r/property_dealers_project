import type { SystemUserStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<SystemUserStatus, { label: string; dot: string; classes: string }> = {
  active: { label: "Active", dot: "bg-success", classes: "bg-success/12 text-success" },
  invited: { label: "Invited", dot: "bg-warning", classes: "bg-warning/12 text-warning" },
  suspended: { label: "Suspended", dot: "bg-destructive", classes: "bg-destructive/10 text-destructive" },
};

export function UserStatusBadge({ status, className }: { status: SystemUserStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        config.classes,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
