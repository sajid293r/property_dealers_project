"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Budget meter: paid (solid) + committed (hatched gold) against the budget limit.
 * When spend overshoots, the bar rescales and a marker shows where the limit was.
 */
export function UtilizationBar({
  budget,
  actual,
  committed,
  className,
  height = "h-2.5",
  delay = 0,
}: {
  budget: number;
  actual: number;
  committed: number;
  className?: string;
  height?: string;
  delay?: number;
}) {
  const used = actual + committed;
  const scale = Math.max(budget, used, 1);
  const over = used > budget;
  const actualPct = (actual / scale) * 100;
  const committedPct = (committed / scale) * 100;
  const limitPct = (budget / scale) * 100;

  return (
    <div className={cn("relative", className)}>
      <div className={cn("flex w-full overflow-hidden rounded-full bg-secondary", height)}>
        <motion.div
          className={cn("h-full", over ? "bg-destructive" : "bg-gradient-to-r from-primary to-[color-mix(in_oklch,var(--primary),var(--gold)_35%)]")}
          initial={{ width: 0 }}
          animate={{ width: `${actualPct}%` }}
          transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.div
          className="h-full bg-[repeating-linear-gradient(135deg,var(--gold)_0_4px,color-mix(in_oklch,var(--gold),white_45%)_4px_8px)]"
          initial={{ width: 0 }}
          animate={{ width: `${committedPct}%` }}
          transition={{ duration: 0.9, delay: delay + 0.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      {over && (
        <span
          className="absolute -top-1 bottom-[-4px] w-0.5 rounded-full bg-foreground/70"
          style={{ left: `${limitPct}%` }}
          title="Budget limit"
        />
      )}
    </div>
  );
}
