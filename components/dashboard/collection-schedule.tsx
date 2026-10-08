"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SpotlightCard } from "@/components/spotlight-card";
import { WidgetHead } from "@/components/dashboard/section-title";
import { formatPkr, formatAxis } from "@/lib/format";
import type { collectionSchedule } from "@/lib/dashboard-insights";

type Schedule = ReturnType<typeof collectionSchedule>;

/** Installments by the month they fall due: what came in, what is late, and what is still to come. */
export function CollectionSchedule({ schedule }: { schedule: Schedule }) {
  const data = schedule.map((m) => ({
    label: m.label,
    Collected: m.collected,
    Overdue: m.isFuture || m.isCurrent ? 0 : m.outstanding,
    Expected: m.isFuture || m.isCurrent ? m.outstanding : 0,
  }));
  const current = schedule.find((m) => m.isCurrent)?.label;
  const upcoming = schedule.filter((m) => m.isFuture || m.isCurrent).reduce((s, m) => s + m.outstanding, 0);

  return (
    <SpotlightCard className="p-5">
      <WidgetHead
        title="Collection schedule"
        note="Installments by the month they fall due — collected, late, and still to come"
        right={
          <div className="text-right">
            <p className="font-heading text-xl font-semibold tabular-nums">{formatPkr(upcoming, { compact: true })}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">expected ahead</p>
          </div>
        }
      />
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="22%">
          <defs>
            <linearGradient id="csCollected" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.65} />
            </linearGradient>
            <pattern id="csExpected" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="var(--gold)" fillOpacity="0.35" />
              <rect width="4" height="8" fill="var(--gold)" fillOpacity="0.9" />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 8" />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} width={46} tickFormatter={formatAxis} />
          <Tooltip
            cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 font-medium">{label}</p>
                  {payload.filter((p) => Number(p.value) > 0).map((p) => (
                    <p key={String(p.dataKey)} className="text-muted-foreground">{p.name}: <span className="font-medium text-popover-foreground">{formatPkr(Number(p.value))}</span></p>
                  ))}
                </div>
              ) : null
            }
          />
          {current && <ReferenceLine x={current} stroke="var(--gold)" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopRight", fill: "var(--gold)", fontSize: 11 }} />}
          <Bar dataKey="Collected" stackId="a" fill="url(#csCollected)" animationDuration={900} />
          <Bar dataKey="Overdue" stackId="a" fill="var(--destructive)" animationDuration={900} />
          <Bar dataKey="Expected" stackId="a" fill="url(#csExpected)" radius={[6, 6, 0, 0]} animationDuration={900} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-1)]" />Collected</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-destructive" />Overdue</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,var(--gold)_0_3px,color-mix(in_oklch,var(--gold),white_55%)_3px_6px)]" />Expected</span>
      </div>
    </SpotlightCard>
  );
}
