"use client";

import { motion } from "framer-motion";
import { BadgeCheck, CalendarClock, HandCoins, Handshake, UserPlus, type LucideIcon } from "lucide-react";
import { relativeDay, type ActivityEvent } from "@/lib/dashboard-insights";
import { cn } from "@/lib/utils";

const KIND: Record<ActivityEvent["kind"], { icon: LucideIcon; tone: string }> = {
  payment: { icon: HandCoins, tone: "bg-success/15 text-success" },
  booking: { icon: Handshake, tone: "bg-gold/20 text-gold" },
  lead: { icon: UserPlus, tone: "bg-primary/12 text-primary" },
  voucher: { icon: BadgeCheck, tone: "bg-success/15 text-success" },
  cheque: { icon: CalendarClock, tone: "bg-warning/20 text-warning" },
};

/** The latest real events across payments, bookings, leads, vouchers and cheques. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">Recent activity</h3>
          <p className="text-xs text-muted-foreground">The latest things that happened in your business</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          Live
        </span>
      </div>
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Activity will appear here as soon as you record your first booking or payment.</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-gradient-to-b before:from-border before:via-border before:to-transparent">
          {events.map((it, i) => {
            const k = KIND[it.kind];
            return (
              <motion.li key={it.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="group relative flex gap-3">
                <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card transition-transform group-hover:scale-110", k.tone)}>
                  <k.icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-medium leading-tight">{it.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{it.detail}</p>
                </div>
                <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground/80">{relativeDay(it.date)}</span>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
