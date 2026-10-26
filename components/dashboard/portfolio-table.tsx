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
import { useSlide, useT } from "@/lib/i18n/provider";

/** One row per project: how much is sold, how much money it brought in, and whether cost is within budget. */
export function PortfolioTable({ rows }: { rows: ReturnType<typeof portfolio> }) {
  const t = useT();
  const slide = useSlide();
  return (
    <SpotlightCard className="h-full p-5">
      <WidgetHead
        title={t("dashboard.portfolio.title")}
        note={t("dashboard.portfolio.note")}
        right={
          <Link href="/dashboard/projects" className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            {t("dashboard.portfolio.all")} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("dashboard.portfolio.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start">
                <th className="pb-2.5">{t("dashboard.portfolio.project")}</th>
                <th className="w-44 pb-2.5">{t("dashboard.portfolio.properties")}</th>
                <th className="pb-2.5 text-end">{t("dashboard.portfolio.salesValue")}</th>
                <th className="pb-2.5 text-end">{t("dashboard.portfolio.collected")}</th>
                <th className="w-36 pb-2.5 ps-4">{t("dashboard.portfolio.budgetUsed")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const h = r.budgetUtilization !== undefined ? healthOf(r.budgetUtilization) : null;
                return (
                  <motion.tr key={r.project.id} initial={{ opacity: 0, x: slide(8) }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }} className="border-b border-border/40 last:border-0">
                    <td className="py-3 pe-3">
                      <Link href={`/dashboard/projects/${r.project.id}`} className="font-medium hover:text-primary">{r.project.name}</Link>
                      <div className="mt-0.5"><ProjectStatusBadge status={r.project.status} className="px-1.5 py-0 text-[10px]" /></div>
                    </td>
                    <td className="py-3 pe-3">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <motion.div className="h-full bg-[var(--chart-4)]" initial={{ width: 0 }} animate={{ width: `${r.total ? (r.sold / r.total) * 100 : 0}%` }} transition={{ duration: 0.9, delay: 0.2 + i * 0.08 }} />
                        <motion.div className="h-full bg-gold" initial={{ width: 0 }} animate={{ width: `${r.total ? (r.reserved / r.total) * 100 : 0}%` }} transition={{ duration: 0.9, delay: 0.3 + i * 0.08 }} />
                        <motion.div className="h-full bg-[var(--chart-1)]" initial={{ width: 0 }} animate={{ width: `${r.total ? (r.available / r.total) * 100 : 0}%` }} transition={{ duration: 0.9, delay: 0.4 + i * 0.08 }} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t("dashboard.portfolio.soldLine", { sold: r.sold, reserved: r.reserved, left: r.available, value: formatPkr(r.availableValue, { compact: true }) })}
                      </p>
                    </td>
                    <td className="py-3 text-end tabular-nums">{formatPkr(r.dealValue, { compact: true })}</td>
                    <td className="py-3 text-end">
                      <p className="font-medium tabular-nums">{formatPkr(r.collected, { compact: true })}</p>
                      <p className="text-[11px] text-muted-foreground">{t("dashboard.portfolio.ofSales", { pct: r.dealValue ? Math.round((r.collected / r.dealValue) * 100) : 0 })}</p>
                    </td>
                    <td className="py-3 ps-4">
                      {r.budgetUtilization !== undefined && h ? (
                        <>
                          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                            <motion.div className="h-full rounded-full" style={{ background: HEALTH_META[h].color }} initial={{ width: 0 }} animate={{ width: `${Math.min(r.budgetUtilization, 1) * 100}%` }} transition={{ duration: 0.9, delay: 0.3 + i * 0.08 }} />
                          </div>
                          <p className={`mt-1 text-[11px] font-medium tabular-nums ${HEALTH_META[h].text}`}>{t("dashboard.portfolio.budgetOf", { pct: Math.round(r.budgetUtilization * 100), total: formatPkr(r.budgetTotal, { compact: true }) })}</p>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">{t("dashboard.portfolio.noBudget")}</span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-4)]" />{t("status.sold")}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-gold" />{t("status.reserved")}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--chart-1)]" />{t("status.available")}</span>
          </div>
        </div>
      )}
    </SpotlightCard>
  );
}
