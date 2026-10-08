"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Landmark, Wallet, WalletCards } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import { WidgetHead } from "@/components/dashboard/section-title";
import { AnimatedNumber } from "@/components/animated-number";
import { formatPkr, formatAxis } from "@/lib/format";
import type { cashFlowWeekly, cashPosition } from "@/lib/dashboard-insights";

const TYPE_ICON = { bank: Landmark, cash: Wallet, petty: WalletCards } as const;

/** Where the cash is today, and how much came in and went out each week. */
export function CashflowCard({ position, weekly }: { position: ReturnType<typeof cashPosition>; weekly: ReturnType<typeof cashFlowWeekly> }) {
  const net = weekly.reduce((s, w) => s + w.net, 0);
  return (
    <SpotlightCard className="h-full p-5">
      <WidgetHead
        title="Cash position & flow"
        note="Balances today and weekly money in vs out (last 8 weeks)"
        right={
          <div className="text-right">
            <AnimatedNumber value={position.total} format={(n) => formatPkr(n, { compact: true })} className="block font-heading text-xl font-semibold tabular-nums" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">in hand now</p>
          </div>
        }
      />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {position.accounts.map((a) => {
          const Icon = TYPE_ICON[a.type];
          return (
            <div key={a.id} className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
              <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground"><Icon className="size-3 shrink-0" />{a.title}</p>
              <p className="mt-0.5 font-heading text-sm font-semibold tabular-nums">{formatPkr(a.balance, { compact: true })}</p>
            </div>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={236}>
        <ComposedChart data={weekly} margin={{ top: 6, right: 4, left: -10, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 8" />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={46} tickFormatter={formatAxis} />
          <Tooltip
            cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 font-medium">Week of {label}</p>
                  {payload.map((p) => (
                    <p key={String(p.dataKey)} className="text-muted-foreground">{p.name}: <span className="font-medium text-popover-foreground">{formatPkr(Number(p.value))}</span></p>
                  ))}
                </div>
              ) : null
            }
          />
          <Bar dataKey="inflow" name="Money in" fill="var(--success)" radius={[4, 4, 0, 0]} maxBarSize={14} animationDuration={900} />
          <Bar dataKey="outflow" name="Money out" fill="var(--chart-4)" radius={[4, 4, 0, 0]} maxBarSize={14} animationDuration={900} />
          <Line dataKey="net" name="Net" type="monotone" stroke="var(--gold)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }} animationDuration={1200} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-muted-foreground">
        Net over 8 weeks: <span className={net >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>{net >= 0 ? "+" : "−"}{formatPkr(Math.abs(net), { compact: true })}</span>
      </p>
    </SpotlightCard>
  );
}
