"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import { WidgetHead } from "@/components/dashboard/section-title";
import { ProjectStatusBadge } from "@/components/projects/badges";
import { HEALTH_META, healthOf } from "@/lib/budgets";
import { formatPkr } from "@/lib/format";
import type { portfolio } from "@/lib/dashboard-insights";

/** One row per project: how much is sold, how much money it brought in, and whether cost is within budget. */
export function PortfolioTable({ rows }: { rows: ReturnType<typeof portfolio> }) {
  return (
    <SpotlightCard className="h-full p-5">
      <WidgetHead
        title="Project portfolio"
        note="Sales progress, collections and budget health side by side"
        right={
          <Link href="/dashboard/projects" className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            All projects <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No projects yet — create one to see its performance here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left">
                <th className="pb-2.5">Project</th>
                <th className="w-44 pb-2.5">Properties</th>
                <th className="pb-2.5 text-right">Sales value</th>
                <th className="pb-2.5 text-right">Collected</th>
                <th className="w-36 pb-2.5 pl-4">Budget used</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const h = r.budgetUtilization !== undefined ? healthOf(r.budgetUtilization) : null;
                return (
                  <motion.tr key={r.project.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }} className="border-b border-border/40 last:border-0">
                    <td className="py-3 pr-3">
                      <Link href={`/dashboard/projects/${r.project.id}`} className="font-medium hover:text-primary">{r.project.name}</Link>
                      <div className="mt-0.5"><ProjectStatusBadge status={r.project.status} className="px-1.5 py-0 text-[10px]" /></div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <motion.div className="h-full bg-[var(--chart-4)]" initial={{ width: 0 }} animate={{ width: `${r.total ? (r.sold / r.total) * 100 : 0}%` }} transition={{ duration: 0.9, delay: 0.2 + i * 0.08 }} />
                        <motion.div className="h-full bg-gold" initial={{ width: 0 }} animate={{ width: `${r.total ? (r.reserved / r.total) * 100 : 0}%` }} transition={{ duration: 0.9, delay: 0.3 + i * 0.08 }} />
                        <motion.div className="h-full bg-[var(--chart-1)]" initial={{ width: 0 }} animate={{ width: `${r.total ? (r.available / r.total) * 100 : 0}%` }} transition={{ duration: 0.9, delay: 0.4 + i * 0.08 }} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{r.sold}</span> sold · {r.reserved} reserved · {r.available} left ({formatPkr(r.availableValue, { compact: true })})
                      </p>
                    </td>
                    <td className="py-3 text-right tabular-nums">{formatPkr(r.dealValue, { compact: true })}</td>
                    <td className="py-3 text-right">
                      <p className="font-medium tabular-nums">{formatPkr(r.collected, { compact: true })}</p>
                      <p className="text-[11px] text-muted-foreground">{r.dealValue ? Math.round((r.collected / r.dealValue) * 100) : 0}% of sales</p>
                    </td>
                    <td className="py-3 pl-4">
                      {r.budgetUtilization !== undefined && h ? (
                        <>
                          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                            <motion.div className="h-full rounded-full" style={{ background: HEALTH_META[h].color }} initial={{ width: 0 }} animate={{ width: `${Math.min(r.budgetUtilization, 1) * 100}%` }} transition={{ duration: 0.9, delay: 0.3 + i * 0.08 }} />
                          </div>
                          <p className={`mt-1 text-[11px] font-medium tabular-nums ${HEALTH_META[h].text}`}>{Math.round(r.budgetUtilization * 100)}% of {formatPkr(r.budgetTotal, { compact: true })}</p>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">No budget</span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-4)]" />Sold</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-gold" />Reserved</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-1)]" />Available</span>
          </div>
        </div>
      )}
    </SpotlightCard>
  );
}
