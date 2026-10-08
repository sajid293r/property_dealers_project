"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Lightbulb, ShieldAlert, Sparkles, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import type { SmartInsight } from "@/lib/dashboard-insights";
import { cn } from "@/lib/utils";

const TONE: Record<SmartInsight["tone"], { icon: LucideIcon; tile: string; ring: string }> = {
  bad: { icon: ShieldAlert, tile: "bg-destructive/12 text-destructive", ring: "hover:border-destructive/40" },
  warn: { icon: TriangleAlert, tile: "bg-warning/15 text-warning", ring: "hover:border-warning/50" },
  good: { icon: TrendingUp, tile: "bg-success/12 text-success", ring: "hover:border-success/40" },
  info: { icon: Lightbulb, tile: "bg-primary/10 text-primary", ring: "hover:border-primary/40" },
};

/** Plain-language findings the system works out from the data — what changed, what is risky, what is going well. */
export function SmartInsights({ insights }: { insights: SmartInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gold/20 text-gold">
          <Sparkles className="size-4" />
        </span>
        <div>
          <h2 className="font-heading text-lg font-semibold">What the numbers are telling you</h2>
          <p className="text-xs text-muted-foreground">Worked out automatically from your live records</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((ins, i) => {
          const t = TONE[ins.tone];
          const Icon = t.icon;
          const body = (
            <>
              <div className="flex items-start gap-3">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", t.tile)}>
                  <Icon className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="font-heading text-[15px] font-semibold leading-snug">{ins.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{ins.body}</p>
                </div>
              </div>
              {ins.cta && (
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-70 transition-all group-hover:gap-1.5 group-hover:opacity-100">
                  {ins.cta}
                  <ArrowUpRight className="size-3.5" />
                </span>
              )}
            </>
          );
          const cls = cn("group flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg", t.ring);
          return (
            <motion.div key={ins.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
              {ins.href ? <Link href={ins.href} className={cn(cls, "h-full")}>{body}</Link> : <div className={cn(cls, "h-full")}>{body}</div>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
