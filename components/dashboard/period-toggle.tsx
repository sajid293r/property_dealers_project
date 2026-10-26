"use client";

import { motion } from "framer-motion";
import { periodLabel, type Period } from "@/lib/dashboard-insights";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const OPTIONS: Period[] = ["30d", "90d", "12m"];

/** Segmented control with a sliding highlight. */
export function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("dashboard.period.label")} className="relative inline-flex rounded-full border border-border/70 bg-secondary/60 p-1">
      {OPTIONS.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            title={periodLabel(p)}
            onClick={() => onChange(p)}
            className={cn("relative rounded-full px-3.5 py-1 text-xs font-medium transition-colors", active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {active && (
              <motion.span
                layoutId="period-pill"
                className="absolute inset-0 rounded-full bg-primary shadow-sm"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{t(`dashboard.period.${p}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
