"use client";

import { motion } from "framer-motion";
import {
  BadgeCheck,
  CalendarClock,
  HandCoins,
  Handshake,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedItem {
  icon: LucideIcon;
  tone: "primary" | "gold" | "success" | "warning";
  title: string;
  detail: string;
  time: string;
}

const TONE: Record<FeedItem["tone"], string> = {
  primary: "bg-primary/12 text-primary",
  gold: "bg-gold/20 text-gold",
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning",
};

const ITEMS: FeedItem[] = [
  { icon: HandCoins, tone: "success", title: "Installment received", detail: "Ahmed Khan paid Rs 450K · UNT-1042", time: "12 min ago" },
  { icon: Handshake, tone: "gold", title: "Booking confirmed", detail: "Plot B-14 · Emerald Gardens", time: "1 hr ago" },
  { icon: UserPlus, tone: "primary", title: "New lead assigned", detail: "Sana Qureshi via WhatsApp", time: "2 hr ago" },
  { icon: CalendarClock, tone: "warning", title: "Cheque due tomorrow", detail: "HBL · Rs 1.2M · Bilal Traders", time: "3 hr ago" },
  { icon: BadgeCheck, tone: "success", title: "Voucher approved", detail: "CPV-0087 · Site development", time: "Yesterday" },
];

export function ActivityFeed() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">Live activity</h3>
          <p className="text-xs text-muted-foreground">What just happened in your business</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/70" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          Live
        </span>
      </div>
      <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-gradient-to-b before:from-border before:via-border before:to-transparent">
        {ITEMS.map((it, i) => (
          <motion.li
            key={it.title}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="group relative flex gap-3"
          >
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card transition-transform group-hover:scale-110",
                TONE[it.tone],
              )}
            >
              <it.icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium leading-tight">{it.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{it.detail}</p>
            </div>
            <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground/80">{it.time}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
