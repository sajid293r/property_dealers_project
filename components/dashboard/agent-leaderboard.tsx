"use client";

import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import { WidgetHead } from "@/components/dashboard/section-title";
import type { agentLeaderboard } from "@/lib/dashboard-insights";
import { cn } from "@/lib/utils";

const MEDAL = ["from-[oklch(0.88_0.13_90)] to-[oklch(0.72_0.14_75)]", "from-[oklch(0.86_0.01_250)] to-[oklch(0.7_0.02_250)]", "from-[oklch(0.74_0.1_55)] to-[oklch(0.58_0.1_45)]"];

/** Sales team ranking by deals won from their leads, with a conversion bar. */
export function AgentLeaderboard({ rows }: { rows: ReturnType<typeof agentLeaderboard> }) {
  const top = Math.max(...rows.map((r) => r.leads), 1);
  return (
    <SpotlightCard className="h-full p-5">
      <WidgetHead title="Sales team" note="Leads won and conversion, by agent" right={<span className="flex size-8 items-center justify-center rounded-lg bg-gold/20 text-gold"><Trophy className="size-4" /></span>} />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Leads assigned to agents will be ranked here.</p>
      ) : (
        <ul className="space-y-4">
          {rows.slice(0, 5).map((r, i) => (
            <motion.li key={r.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07 }} className="flex items-center gap-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm", i < 3 ? `bg-gradient-to-br ${MEDAL[i]}` : "bg-muted text-muted-foreground")}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground"><b className="text-foreground">{r.won}</b> won / {r.leads} leads</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-gold" initial={{ width: 0 }} animate={{ width: `${(r.leads / top) * 100}%` }} transition={{ duration: 0.9, delay: 0.2 + i * 0.07 }} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(r.conversion * 100)}% conversion · {r.open} open</p>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </SpotlightCard>
  );
}
