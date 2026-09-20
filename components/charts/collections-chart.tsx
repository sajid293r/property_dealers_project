"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPkr } from "@/lib/format";
import { monthlyCollections, weeklyCollections } from "@/lib/mock-data/trends";

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="text-muted-foreground">
          {p.name}: <span className="font-medium text-popover-foreground">{formatPkr(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

export function CollectionsChart() {
  const [range, setRange] = React.useState<"weekly" | "monthly">("monthly");
  const data = React.useMemo(
    () =>
      range === "monthly"
        ? monthlyCollections.map((d) => ({ label: d.month, collections: d.collections }))
        : weeklyCollections.map((d) => ({ label: d.week, collections: d.collections })),
    [range],
  );
  const xKey = "label";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">Collections</h3>
          <p className="text-xs text-muted-foreground">Installments &amp; booking amounts received</p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as "weekly" | "monthly")}>
          <TabsList>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="collectionsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 8" />
          <XAxis
            dataKey={xKey}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={56}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v) => formatPkr(v, { compact: true })}
          />
          <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--chart-1)", strokeDasharray: "4 4" }} />
          <Area
            type="monotone"
            dataKey="collections"
            name="Collections"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            fill="url(#collectionsFill)"
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
