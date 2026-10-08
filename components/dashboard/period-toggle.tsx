"use client";

import { motion } from "framer-motion";
import { PERIOD_LABEL, type Period } from "@/lib/dashboard-insights";
import { cn } from "@/lib/utils";

const OPTIONS: Period[] = ["30d", "90d", "12m"];
const SHORT: Record<Period, string> = { "30d": "30 days", "90d": "90 days", "12m": "12 months" };

/** Segmented control with a sliding highlight. */
export function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div role="radiogroup" aria-label="Reporting period" className="relative inline-flex rounded-full border border-border/70 bg-secondary/60 p-1">
      {OPTIONS.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            title={PERIOD_LABEL[p]}
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
            <span className="relative">{SHORT[p]}</span>
          </button>
        );
      })}
    </div>
  );
}
