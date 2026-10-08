"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, PartyPopper } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import { WidgetHead } from "@/components/dashboard/section-title";
import { AnimatedNumber } from "@/components/animated-number";
import { formatPkr } from "@/lib/format";
import type { receivables } from "@/lib/dashboard-insights";
import type { Customer } from "@/lib/types";
import { cn } from "@/lib/utils";

type Rec = ReturnType<typeof receivables>;
const COLORS = ["oklch(0.82 0.13 85)", "oklch(0.74 0.15 62)", "oklch(0.66 0.18 40)", "oklch(0.56 0.2 25)"];

/** How late the unpaid installments are: the classic receivables-aging view, plus who owes the most. */
export function ReceivableAging({ rec, customers }: { rec: Rec; customers: Customer[] }) {
  const total = rec.overdueAmount;
  const name = (id: string) => customers.find((c) => c.id === id)?.name ?? "Customer";

  return (
    <SpotlightCard className="h-full p-5">
      <WidgetHead
        title="Overdue receivables"
        note="Unpaid installments past their due date, by how late they are"
        right={
          <Link href="/dashboard/deals" className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            View <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        }
      />
      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-success/12 text-success"><PartyPopper className="size-6" /></span>
          <p className="font-heading font-semibold">Nothing is overdue</p>
          <p className="text-xs text-muted-foreground">Every installment due so far has been paid.</p>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <AnimatedNumber value={total} format={(n) => formatPkr(n, { compact: true })} className="font-heading text-3xl font-semibold tabular-nums text-destructive" />
            <span className="pb-1 text-xs text-muted-foreground">{rec.overdueCount} installments</span>
          </div>

          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-secondary">
            {rec.buckets.map((b, i) => (
              <motion.div
                key={b.key}
                title={`${b.label}: ${formatPkr(b.amount)}`}
                style={{ background: COLORS[i] }}
                initial={{ width: 0 }}
                animate={{ width: `${(b.amount / total) * 100}%` }}
                transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {rec.buckets.map((b, i) => (
              <li key={b.key} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i] }} />
                <span className="text-muted-foreground">{b.label}</span>
                <span className={cn("ml-auto font-medium tabular-nums", b.amount === 0 && "text-muted-foreground/60")}>{formatPkr(b.amount, { compact: true })}</span>
              </li>
            ))}
          </ul>

          <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Who owes the most</p>
          <ul className="space-y-2.5">
            {rec.topOverdue.slice(0, 4).map((c, i) => (
              <motion.li key={c.customerId} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.06 }} className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-destructive/15 to-gold/25 text-[10px] font-semibold text-foreground/80">
                  {name(c.customerId).split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{name(c.customerId)}</span>
                  <span className="text-[11px] text-muted-foreground">{c.count} late · oldest {c.oldest} days</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{formatPkr(c.amount, { compact: true })}</span>
              </motion.li>
            ))}
          </ul>
        </>
      )}
    </SpotlightCard>
  );
}
