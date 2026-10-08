import type { Budget, BudgetControlMode, BudgetLine, BudgetStatus } from "@/lib/types";

export const BUDGET_FY = "FY2026-27";
/** Fiscal year runs July → June (Pakistan default). */
export const FY_MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"] as const;
/** Months of the fiscal year already closed in the demo data (Jul, Aug, Sep). */
export const BUDGET_ELAPSED_MONTHS = 3;

/** How a new project budget is split across cost categories until the planner edits it. */
export const PROJECT_BUDGET_TEMPLATE: { category: string; costCode: string; share: number; description: string }[] = [
  { category: "Land development", costCode: "C-100", share: 0.16, description: "Survey, earthwork, leveling" },
  { category: "Civil & structural", costCode: "C-200", share: 0.34, description: "Main civil works, structures, finishing" },
  { category: "Roads & infrastructure", costCode: "C-300", share: 0.14, description: "Internal roads, storm drainage" },
  { category: "Electrical", costCode: "C-400", share: 0.08, description: "Grid, street lighting" },
  { category: "Water & sewerage", costCode: "C-500", share: 0.08, description: "Supply network, sewerage, treatment" },
  { category: "Landscaping & amenities", costCode: "C-600", share: 0.05, description: "Parks, green belts, clubhouse" },
  { category: "Approvals & legal", costCode: "C-700", share: 0.03, description: "NOCs, authority fees, legal" },
  { category: "Marketing & sales", costCode: "C-800", share: 0.05, description: "Launch, brokerage, advertising" },
  { category: "Contingency", costCode: "C-900", share: 0.07, description: "Unforeseen cost reserve" },
];

export interface LineMetrics {
  budget: number;
  committed: number;
  actual: number;
  /** actual + committed — what is already spoken for. */
  used: number;
  available: number;
  /** used / budget (can exceed 1). */
  utilization: number;
  health: BudgetHealth;
}

export type BudgetHealth = "ok" | "watch" | "over";

export function healthOf(utilization: number): BudgetHealth {
  if (utilization > 1) return "over";
  if (utilization >= 0.85) return "watch";
  return "ok";
}

export function lineMetrics(l: Pick<BudgetLine, "budgetAmount" | "committedAmount" | "actualAmount">): LineMetrics {
  const used = l.actualAmount + l.committedAmount;
  const utilization = l.budgetAmount > 0 ? used / l.budgetAmount : used > 0 ? 9.99 : 0;
  return {
    budget: l.budgetAmount,
    committed: l.committedAmount,
    actual: l.actualAmount,
    used,
    available: l.budgetAmount - used,
    utilization,
    health: healthOf(utilization),
  };
}

export function sumLines(lines: BudgetLine[]): LineMetrics {
  return lineMetrics({
    budgetAmount: lines.reduce((s, l) => s + l.budgetAmount, 0),
    committedAmount: lines.reduce((s, l) => s + l.committedAmount, 0),
    actualAmount: lines.reduce((s, l) => s + l.actualAmount, 0),
  });
}

export function linesOf(lines: BudgetLine[], budgetId: string) {
  return lines.filter((l) => l.budgetId === budgetId);
}

export const HEALTH_META: Record<BudgetHealth, { label: string; chip: string; text: string; color: string }> = {
  ok: { label: "On track", chip: "bg-success/12 text-success", text: "text-success", color: "var(--success)" },
  watch: { label: "Watch", chip: "bg-warning/15 text-warning", text: "text-warning", color: "var(--warning)" },
  over: { label: "Over budget", chip: "bg-destructive/12 text-destructive", text: "text-destructive", color: "var(--destructive)" },
};

export const BUDGET_STATUS_META: Record<BudgetStatus, { label: string; chip: string }> = {
  draft: { label: "Draft", chip: "bg-muted text-muted-foreground" },
  submitted: { label: "Awaiting approval", chip: "bg-warning/15 text-warning" },
  approved: { label: "Approved", chip: "bg-success/12 text-success" },
  locked: { label: "Locked", chip: "bg-primary/12 text-primary" },
  closed: { label: "Closed", chip: "bg-secondary text-secondary-foreground" },
};

export const CONTROL_MODE_META: Record<BudgetControlMode, { label: string; hint: string }> = {
  none: { label: "No control", hint: "Spending is tracked but never blocked" },
  warn: { label: "Warn", hint: "Users see a warning when a line would go over budget" },
  block: { label: "Block", hint: "Vouchers, orders and bills that exceed the line are stopped until a revision is approved" },
};

/** Splits a total across the standard categories, rounding to the nearest thousand. */
export function buildLinesFromTemplate(budgetId: string, total: number): BudgetLine[] {
  let allocated = 0;
  return PROJECT_BUDGET_TEMPLATE.map((t, i, arr) => {
    const amount = i === arr.length - 1 ? total - allocated : Math.round((total * t.share) / 1000) * 1000;
    allocated += amount;
    return {
      id: `${budgetId}-line-${i + 1}`,
      budgetId,
      costCode: t.costCode,
      category: t.category,
      description: t.description,
      budgetAmount: amount,
      committedAmount: 0,
      actualAmount: 0,
      forecastAmount: amount,
    };
  });
}

export function budgetTotals(budget: Budget, lines: BudgetLine[]) {
  return sumLines(linesOf(lines, budget.id));
}
