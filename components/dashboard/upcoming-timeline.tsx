"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarClock, CalendarDays, FileSignature, FileStack, HandCoins, Palmtree, UserRoundCheck, type LucideIcon } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import { WidgetHead } from "@/components/dashboard/section-title";
import { TODAY, addDays, type UpcomingEvent } from "@/lib/dashboard-insights";
import { formatPkr } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND: Record<UpcomingEvent["kind"], { icon: LucideIcon; tile: string }> = {
  installment: { icon: HandCoins, tile: "bg-success/12 text-success" },
  cheque: { icon: CalendarClock, tile: "bg-gold/20 text-gold" },
  contract: { icon: FileSignature, tile: "bg-destructive/10 text-destructive" },
  followup: { icon: UserRoundCheck, tile: "bg-primary/10 text-primary" },
  leave: { icon: Palmtree, tile: "bg-[var(--chart-5)]/15 text-[var(--chart-5)]" },
  quote: { icon: FileStack, tile: "bg-warning/15 text-warning" },
};

function dayLabel(iso: string) {
  if (iso === TODAY) return "Today";
  if (iso === addDays(TODAY, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-PK", { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso + "T00:00:00Z"));
}

/** The next ten days at a glance, grouped by day, across every module. */
export function UpcomingTimeline({ events }: { events: UpcomingEvent[] }) {
  const shown = events.slice(0, 9);
  const groups = shown.reduce<Record<string, UpcomingEvent[]>>((acc, e) => {
    (acc[e.date] ??= []).push(e);
    return acc;
  }, {});
  const inflow = events.filter((e) => e.kind === "installment" || e.kind === "cheque").reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <SpotlightCard className="h-full p-5">
      <WidgetHead
        title="Next 10 days"
        note={events.length ? `${events.length} things coming up${inflow ? ` · ${formatPkr(inflow, { compact: true })} expected in` : ""}` : "A quiet stretch"}
        right={<span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="size-4" /></span>}
      />
      {events.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No installments, cheques, contracts or follow-ups are due in the next 10 days.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([date, list], gi) => (
            <div key={date}>
              <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wider", date === TODAY ? "text-gold" : "text-muted-foreground")}>{dayLabel(date)}</p>
              <ul className="space-y-1.5">
                {list.map((e, i) => {
                  const k = KIND[e.kind];
                  return (
                    <motion.li key={`${e.kind}-${e.title}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + gi * 0.06 + i * 0.03 }}>
                      <Link href={e.href} className="group flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-secondary/60">
                        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", k.tile)}><k.icon className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{e.title}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{e.detail}</span>
                        </span>
                        {e.amount !== undefined && <span className="shrink-0 text-xs font-semibold tabular-nums">{formatPkr(e.amount, { compact: true })}</span>}
                      </Link>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SpotlightCard>
  );
}
