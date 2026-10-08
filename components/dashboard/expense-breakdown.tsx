"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { HardHat } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import { WidgetHead } from "@/components/dashboard/section-title";
import { formatPkr } from "@/lib/format";
import type { expenseBreakdown } from "@/lib/dashboard-insights";

const COLORS = ["var(--chart-1)", "var(--gold)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "oklch(0.7 0.05 160)"];

/** Running costs by category (construction is shown separately because it dwarfs everything else). */
export function ExpenseBreakdown({ data }: { data: ReturnType<typeof expenseBreakdown> }) {
  const rows = data.rows.slice(0, 6);
  return (
    <SpotlightCard className="h-full p-5">
      <WidgetHead title="Where running costs go" note="Operating expenses by category, last 90 days" />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No operating expenses recorded in this period.</p>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={rows} dataKey="amount" nameKey="type" innerRadius={52} outerRadius={74} paddingAngle={3} cornerRadius={6} stroke="none" animationDuration={900}>
                  {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                        {String(payload[0].name)}: <span className="font-medium">{formatPkr(Number(payload[0].value))}</span>
                      </div>
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-heading text-lg font-semibold tabular-nums">{formatPkr(data.total, { compact: true })}</span>
              <span className="text-[10px] text-muted-foreground">operating spend</span>
            </div>
          </div>
          <ul className="mt-2 space-y-1.5">
            {rows.map((r, i) => (
              <li key={r.type} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-muted-foreground">{r.type}</span>
                <span className="ml-auto font-medium tabular-nums">{formatPkr(r.amount, { compact: true })}</span>
                <span className="w-8 text-right tabular-nums text-muted-foreground/70">{Math.round((r.amount / data.total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-gold/20 text-gold"><HardHat className="size-[18px]" /></span>
        <div>
          <p className="font-heading text-base font-semibold tabular-nums">{formatPkr(data.construction, { compact: true })}</p>
          <p className="text-[11px] text-muted-foreground">construction & development paid to date</p>
        </div>
      </div>
    </SpotlightCard>
  );
}
