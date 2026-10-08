import { CircleAlert, CircleCheck, Eye, Lock, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { BUDGET_STATUS_META, CONTROL_MODE_META, HEALTH_META, type BudgetHealth } from "@/lib/budgets";
import type { BudgetControlMode, BudgetStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function BudgetStatusBadge({ status, className }: { status: BudgetStatus; className?: string }) {
  const meta = BUDGET_STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", meta.chip, className)}>
      {status === "locked" && <Lock className="size-3" />}
      {meta.label}
    </span>
  );
}

const HEALTH_ICON: Record<BudgetHealth, typeof CircleCheck> = { ok: CircleCheck, watch: Eye, over: CircleAlert };

export function HealthChip({ health, className }: { health: BudgetHealth; className?: string }) {
  const meta = HEALTH_META[health];
  const Icon = HEALTH_ICON[health];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", meta.chip, className)}>
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

const CONTROL_ICON: Record<BudgetControlMode, typeof ShieldCheck> = { none: ShieldOff, warn: ShieldAlert, block: ShieldCheck };

export function ControlModeChip({ mode, className }: { mode: BudgetControlMode; className?: string }) {
  const Icon = CONTROL_ICON[mode];
  return (
    <span
      title={CONTROL_MODE_META[mode].hint}
      className={cn("inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground", className)}
    >
      <Icon className="size-3" />
      {CONTROL_MODE_META[mode].label}
    </span>
  );
}
