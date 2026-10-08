"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlarmClock,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleCheck,
  FileSignature,
  FileStack,
  HandCoins,
  PiggyBank,
  Receipt,
  UserRoundCheck,
  Palmtree,
  type LucideIcon,
} from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import { WidgetHead } from "@/components/dashboard/section-title";
import type { AttentionItem, Severity } from "@/lib/dashboard-insights";
import { cn } from "@/lib/utils";

const ICON: Record<AttentionItem["icon"], LucideIcon> = {
  overdue: AlarmClock,
  cheque: CalendarClock,
  approval: BadgeCheck,
  contract: FileSignature,
  quote: FileStack,
  followup: UserRoundCheck,
  budget: PiggyBank,
  bills: Receipt,
  leave: Palmtree,
};

const SEV: Record<Severity, { tile: string; pill: string; label: string }> = {
  high: { tile: "bg-destructive/12 text-destructive", pill: "bg-destructive/12 text-destructive", label: "Urgent" },
  medium: { tile: "bg-warning/15 text-warning", pill: "bg-warning/15 text-warning", label: "Soon" },
  low: { tile: "bg-primary/10 text-primary", pill: "bg-secondary text-muted-foreground", label: "Routine" },
};

/** The ERP's to-do list: everything across modules that is waiting on a person, most urgent first. */
export function AttentionCenter({ items }: { items: AttentionItem[] }) {
  const urgent = items.filter((i) => i.severity === "high").length;

  return (
    <SpotlightCard className="h-full p-5">
      <WidgetHead
        title="Needs your attention"
        note={items.length ? `${items.length} item${items.length > 1 ? "s" : ""} across Sales, Finance and People` : "Nothing is waiting on you"}
        right={
          urgent > 0 ? (
            <span className="flex items-center gap-1.5 rounded-full bg-destructive/12 px-2.5 py-1 text-[11px] font-semibold text-destructive">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-destructive" />
              </span>
              {urgent} urgent
            </span>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-success/12 text-success">
            <CircleCheck className="size-6" />
          </span>
          <p className="font-heading font-semibold">You&apos;re all caught up</p>
          <p className="text-xs text-muted-foreground">No overdue payments, approvals or follow-ups.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 7).map((it, i) => {
            const Icon = ICON[it.icon] ?? HandCoins;
            const s = SEV[it.severity];
            return (
              <motion.li
                key={it.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  href={it.href}
                  className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:bg-secondary/40 hover:shadow-md"
                >
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110 group-hover:-rotate-6", s.tile)}>
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{it.detail}</span>
                  </span>
                  <span className={cn("hidden rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline", s.pill)}>{s.label}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </SpotlightCard>
  );
}
