import type { SystemUserStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

const STATUS_CONFIG: Record<SystemUserStatus, { label: string; dot: string; classes: string }> = {
  active: { label: "adm.users.status.active", dot: "bg-success", classes: "bg-success/12 text-success" },
  invited: { label: "adm.users.status.invited", dot: "bg-warning", classes: "bg-warning/12 text-warning" },
  suspended: { label: "adm.users.status.suspended", dot: "bg-destructive", classes: "bg-destructive/10 text-destructive" },
};

export function UserStatusBadge({ status, className }: { status: SystemUserStatus; className?: string }) {
  const t = useT();
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
      {t(config.label)}
    </span>
  );
}
