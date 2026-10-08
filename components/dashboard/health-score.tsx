"use client";

import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import type { HealthFactor } from "@/lib/dashboard-insights";
import { cn } from "@/lib/utils";

function tone(score: number) {
  if (score >= 80) return { bar: "bg-[oklch(0.78_0.15_160)]", text: "text-[oklch(0.82_0.14_160)]" };
  if (score >= 60) return { bar: "bg-gold", text: "text-gold" };
  if (score >= 40) return { bar: "bg-[oklch(0.78_0.15_60)]", text: "text-[oklch(0.82_0.14_60)]" };
  return { bar: "bg-[oklch(0.68_0.2_25)]", text: "text-[oklch(0.75_0.17_25)]" };
}

/** One number for "how is the business doing", with the four things it is made of. */
export function HealthScore({ overall, grade, factors }: { overall: number; grade: string; factors: HealthFactor[] }) {
  const r = 52;
  const c = 2 * Math.PI * r * 0.75; // 270° gauge
  const t = tone(overall);

  return (
    <div className="surface-hero sheen relative isolate h-full overflow-hidden rounded-xl p-5 shadow-xl shadow-primary/15 ring-1 ring-white/10">
      <div className="pointer-events-none absolute -right-10 -top-12 -z-10 size-48 animate-aurora rounded-full bg-gold/25 blur-3xl" />
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold text-white">Business health</h3>
          <p className="text-xs text-white/60">One score from four signals</p>
        </div>
        <span className={cn("rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold", t.text)}>{grade}</span>
      </div>

      <div className="relative mx-auto mt-2 size-40">
        <svg viewBox="0 0 120 120" className="size-full -rotate-[225deg]">
          <circle cx="60" cy="60" r={r} fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c} 999`} />
          <motion.circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="url(#healthGrad)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${c} 999`}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - overall / 100) }}
            transition={{ duration: 1.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          />
          <defs>
            <linearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.72 0.17 28)" />
              <stop offset="50%" stopColor="oklch(0.85 0.14 85)" />
              <stop offset="100%" stopColor="oklch(0.78 0.15 160)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <AnimatedNumber value={overall} format={(n) => String(n)} className="font-heading text-5xl font-semibold leading-none tabular-nums" />
          <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/55">out of 100</span>
        </div>
      </div>

      <ul className="mt-2 space-y-3">
        {factors.map((f, i) => {
          const ft = tone(f.score);
          return (
            <li key={f.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-white/90">
                  {f.label}
                  <span title={f.how} className="cursor-help text-white/40 transition-colors hover:text-white/80">
                    <Info className="size-3" />
                  </span>
                </span>
                <span className="tabular-nums text-white/60">{f.value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className={cn("h-full rounded-full", ft.bar)}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(f.score, 3)}%` }}
                  transition={{ duration: 1, delay: 0.4 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
