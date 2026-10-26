"use client";

import { motion } from "framer-motion";
import type { Lead } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";

const STAGES = [
  { key: "new", color: "var(--chart-3)" },
  { key: "contacted", color: "var(--chart-5)" },
  { key: "negotiation", color: "var(--gold)" },
  { key: "won", color: "var(--chart-1)" },
] as const;

/** Horizontal funnel showing where leads currently sit — bars grow in on mount. */
export function SalesFunnel({ leads }: { leads: Lead[] }) {
  const t = useT();
  const counts = STAGES.map((s) => leads.filter((l) => l.status === s.key).length);
  const max = Math.max(...counts, 1);
  const conversion = leads.length ? Math.round((counts[3] / leads.length) * 100) : 0;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">{t("dashboard.funnel.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("dashboard.funnel.note")}</p>
        </div>
        <div className="text-end">
          <p className="text-gradient-brand font-heading text-2xl font-semibold">{conversion}%</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("dashboard.funnel.conversion")}</p>
        </div>
      </div>
      <div className="space-y-3.5">
        {STAGES.map((s, i) => (
          <div key={s.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">{t(`dashboard.funnel.${s.key}`)}</span>
              <span className="tabular-nums text-muted-foreground">{counts[i]}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${s.color}, color-mix(in oklch, ${s.color}, white 30%))`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${(counts[i] / max) * 100}%` }}
                transition={{ duration: 1, delay: 0.3 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
