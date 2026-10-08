"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Banknote, Palmtree, UserSquare2, Users2 } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import { WidgetHead } from "@/components/dashboard/section-title";
import { formatPkr } from "@/lib/format";
import type { people } from "@/lib/dashboard-insights";

/** Team size, who is out today, what payroll costs and how the team splits across departments. */
export function PeopleSnapshot({ data }: { data: ReturnType<typeof people> }) {
  const max = Math.max(...data.departments.map((d) => d.count), 1);
  return (
    <SpotlightCard className="h-full p-5">
      <WidgetHead title="People" note="Team, leave and payroll" right={<Link href="/dashboard/staff" className="text-xs font-medium text-muted-foreground hover:text-foreground">Open staff →</Link>} />
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: UserSquare2, label: "Team members", value: String(data.headcount), tone: "bg-primary/10 text-primary" },
          { icon: Palmtree, label: "On leave today", value: String(data.onLeave), tone: "bg-[var(--chart-5)]/15 text-[var(--chart-5)]" },
          { icon: Users2, label: "Leave pending", value: String(data.pendingLeave), tone: "bg-warning/15 text-warning" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/60 p-2.5 text-center">
            <span className={`mx-auto flex size-8 items-center justify-center rounded-lg ${s.tone}`}><s.icon className="size-4" /></span>
            <p className="mt-1.5 font-heading text-xl font-semibold tabular-nums">{s.value}</p>
            <p className="text-[10.5px] leading-tight text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      {data.onLeaveNames.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Out today: {data.onLeaveNames.join(", ")}</p>}
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-gold/20 text-gold"><Banknote className="size-[18px]" /></span>
        <div>
          <p className="font-heading text-base font-semibold tabular-nums">{formatPkr(data.payroll, { compact: true })}</p>
          <p className="text-[11px] text-muted-foreground">monthly payroll commitment</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {data.departments.slice(0, 5).map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate text-muted-foreground">{d.name}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <motion.div className="h-full rounded-full bg-primary/70" initial={{ width: 0 }} animate={{ width: `${(d.count / max) * 100}%` }} transition={{ duration: 0.8, delay: 0.2 + i * 0.07 }} />
            </div>
            <span className="w-4 text-right font-medium tabular-nums">{d.count}</span>
          </li>
        ))}
      </ul>
    </SpotlightCard>
  );
}
