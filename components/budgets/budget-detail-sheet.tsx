"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRightLeft, CheckCircle2, CircleDot, FilePlus2, Lock, Send, TrendingUp } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { UtilizationBar } from "@/components/budgets/utilization-bar";
import { BudgetStatusBadge, ControlModeChip, HealthChip } from "@/components/budgets/budget-badges";
import { HEALTH_META, lineMetrics, sumLines } from "@/lib/budgets";
import { formatDate, formatPkr } from "@/lib/format";
import type { Budget, BudgetLine, BudgetRevision } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const REVISION_ICON: Record<BudgetRevision["type"], typeof FilePlus2> = {
  supplementary: FilePlus2,
  reallocation: ArrowRightLeft,
  reforecast: TrendingUp,
};

export function BudgetDetailSheet({
  budget,
  lines,
  subtitle,
  open,
  onOpenChange,
}: {
  budget: Budget | null;
  lines: BudgetLine[];
  subtitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const totals = React.useMemo(() => sumLines(lines), [lines]);
  const chartData = lines.map((l) => ({
    name: l.category.split(/[ &]+/)[0],
    Budget: l.budgetAmount,
    Paid: l.actualAmount,
    Committed: l.committedAmount,
  }));
  const forecastTotal = lines.reduce((s, l) => s + l.forecastAmount, 0);
  const forecastGap = totals.budget - forecastTotal;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {budget && (
          <>
            <SheetHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <BudgetStatusBadge status={budget.status} />
                <ControlModeChip mode={budget.controlMode} />
                <span className="font-mono text-xs text-muted-foreground">v{budget.version} · {budget.fiscalYear}</span>
              </div>
              <SheetTitle className="font-heading text-xl">{budget.name}</SheetTitle>
              <SheetDescription>{subtitle}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Budget" value={formatPkr(totals.budget, { compact: true })} />
                <Tile label="Paid" value={formatPkr(totals.actual, { compact: true })} />
                <Tile label="Committed" value={formatPkr(totals.committed, { compact: true })} />
                <Tile
                  label={totals.available >= 0 ? "Available" : "Over by"}
                  value={formatPkr(Math.abs(totals.available), { compact: true })}
                  tone={totals.available >= 0 ? "ok" : "over"}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Utilization (paid + committed)</span>
                  <span className={cn("font-semibold tabular-nums", HEALTH_META[totals.health].text)}>
                    {Math.round(totals.utilization * 100)}%
                  </span>
                </div>
                <UtilizationBar budget={totals.budget} actual={totals.actual} committed={totals.committed} height="h-3" />
                <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" />Paid</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[repeating-linear-gradient(135deg,var(--gold)_0_2px,white_2px_4px)]" />Committed</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-secondary ring-1 ring-border" />Remaining</span>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 p-4">
                <p className="mb-2 font-heading text-sm font-semibold">Where the money goes</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 8" />
                    <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatPkr(v, { compact: true }).replace("Rs ", "")} width={52} />
                    <Tooltip
                      cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                            <p className="mb-1 font-medium">{label}</p>
                            {payload.map((p) => (
                              <p key={String(p.dataKey)} className="text-muted-foreground">
                                {p.name}: <span className="font-medium text-popover-foreground">{formatPkr(Number(p.value))}</span>
                              </p>
                            ))}
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="Budget" fill="var(--border)" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="Paid" fill="var(--chart-1)" stackId="b" />
                    <Bar dataKey="Committed" fill="var(--gold)" radius={[4, 4, 0, 0]} stackId="b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p className="mb-2 font-heading text-sm font-semibold">Budget lines</p>
                <div className="overflow-hidden rounded-xl border border-border/70">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/50 text-left">
                        <th className="px-3 py-2 font-medium">Category</th>
                        <th className="px-3 py-2 text-right font-medium">Budget</th>
                        <th className="px-3 py-2 text-right font-medium">Used</th>
                        <th className="px-3 py-2 text-right font-medium">Available</th>
                        <th className="w-36 px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const m = lineMetrics(l);
                        return (
                          <motion.tr
                            key={l.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.05 + i * 0.03 }}
                            className="border-t border-border/50"
                          >
                            <td className="px-3 py-2.5">
                              <p className="font-medium">{l.category}</p>
                              <p className="font-mono text-[10px] text-muted-foreground">{l.costCode}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatPkr(m.budget, { compact: true })}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatPkr(m.used, { compact: true })}</td>
                            <td className={cn("px-3 py-2.5 text-right font-medium tabular-nums", m.available < 0 && "text-destructive")}>
                              {formatPkr(m.available, { compact: true })}
                            </td>
                            <td className="px-3 py-2.5">
                              <UtilizationBar budget={m.budget} actual={m.actual} committed={m.committed} height="h-1.5" className="mb-1.5" />
                              <div className="flex items-center justify-between">
                                <HealthChip health={m.health} className="whitespace-nowrap px-1.5 py-0 text-[10px]" />
                                <span className="tabular-nums text-muted-foreground">{Math.round(m.utilization * 100)}%</span>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-secondary/50 p-4">
                  <p className="text-xs text-muted-foreground">Forecast at completion</p>
                  <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{formatPkr(forecastTotal, { compact: true })}</p>
                  <p className={cn("mt-1 text-xs font-medium", forecastGap >= 0 ? "text-success" : "text-destructive")}>
                    {forecastGap >= 0 ? `${formatPkr(forecastGap, { compact: true })} under budget` : `${formatPkr(-forecastGap, { compact: true })} over budget`}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/50 p-4">
                  <p className="text-xs text-muted-foreground">Approval</p>
                  <p className="mt-1 text-sm font-medium">
                    {budget.approvedBy ? `Approved by ${budget.approvedBy}` : "Not yet approved"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {budget.approvedAt ? formatDate(budget.approvedAt) : `Created ${formatDate(budget.createdAt)} by ${budget.createdBy}`}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-3 font-heading text-sm font-semibold">Revision history</p>
                <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
                  {[...budget.revisions].reverse().map((r) => {
                    const Icon = REVISION_ICON[r.type];
                    return (
                      <li key={r.no} className="relative flex gap-3">
                        <span className={cn("relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-popover", r.status === "pending" ? "bg-warning/20 text-warning" : "bg-primary/12 text-primary")}>
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            v{r.no} · <span className="capitalize">{r.type}</span>
                            {r.deltaAmount !== 0 && (
                              <span className="ml-2 tabular-nums text-muted-foreground">{r.deltaAmount > 0 ? "+" : ""}{formatPkr(r.deltaAmount, { compact: true })}</span>
                            )}
                            <span className={cn("ml-2 rounded-full px-1.5 py-0.5 text-[10px] capitalize", r.status === "approved" ? "bg-success/12 text-success" : r.status === "pending" ? "bg-warning/15 text-warning" : "bg-destructive/10 text-destructive")}>{r.status}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">{r.reason} · {formatDate(r.date)}{r.approvedBy ? ` · ${r.approvedBy}` : ""}</p>
                        </div>
                      </li>
                    );
                  })}
                  <li className="relative flex gap-3">
                    <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-4 ring-popover">
                      <CircleDot className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">v1 · Original budget</p>
                      <p className="text-xs text-muted-foreground">Created {formatDate(budget.createdAt)} by {budget.createdBy}</p>
                    </div>
                  </li>
                </ol>
              </div>

              <Separator />
              <div className="flex flex-wrap gap-2">
                {budget.status === "draft" && (
                  <Button className="gap-1.5" onClick={() => toast.success("Budget submitted for approval")}>
                    <Send className="size-4" /> Submit for approval
                  </Button>
                )}
                {budget.status === "submitted" && (
                  <Button className="gap-1.5" onClick={() => toast.success("Budget approved")}>
                    <CheckCircle2 className="size-4" /> Approve budget
                  </Button>
                )}
                {(budget.status === "approved" || budget.status === "locked") && (
                  <>
                    <Button className="gap-1.5" onClick={() => toast.success("Revision request created — it goes to the approver")}>
                      <FilePlus2 className="size-4" /> Request revision
                    </Button>
                    <Button variant="outline" className="gap-1.5" onClick={() => toast.info("Budget lines are locked; changes go through revisions")}>
                      <Lock className="size-4" /> {budget.status === "locked" ? "Locked" : "Lock budget"}
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "over" }) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-heading text-lg font-semibold tabular-nums", tone === "over" && "text-destructive", tone === "ok" && "text-success")}>{value}</p>
    </div>
  );
}
