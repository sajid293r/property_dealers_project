"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CalendarDays, FileText, PlusCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/animated-number";
import { formatPkr } from "@/lib/format";

/** 7×4 mini plot-map: tiles ripple in a wave, colored available / reserved / sold. */
const TILE_PATTERN = "1102101201121001211021210011";
const TILE_COLOR: Record<string, string> = {
  "0": "oklch(0.68 0.16 25)",
  "1": "oklch(0.72 0.1 165)",
  "2": "oklch(0.8 0.13 82)",
};

const subscribeNever = () => () => {};
let cachedNow: Date | null = null;
const getNow = () => (cachedNow ??= new Date());
const getNowServer = () => null;

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HeroBanner({
  companyName,
  collected,
  target,
  onNewBooking,
  onNewLead,
  onNewVoucher,
}: {
  companyName: string;
  collected: number;
  target: number;
  onNewBooking: () => void;
  onNewLead: () => void;
  onNewVoucher: () => void;
}) {
  const now = React.useSyncExternalStore(subscribeNever, getNow, getNowServer);
  const pct = Math.min(100, Math.round((collected / Math.max(target, 1)) * 100));
  const circumference = 2 * Math.PI * 44;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="surface-hero sheen relative isolate overflow-hidden rounded-3xl p-6 shadow-2xl shadow-primary/20 ring-1 ring-white/10 md:p-8"
    >
      {/* drifting aurora blobs */}
      <div className="pointer-events-none absolute -left-10 top-0 -z-10 size-72 animate-aurora rounded-full bg-[oklch(0.55_0.12_165/0.35)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 right-1/4 -z-10 size-64 animate-aurora rounded-full bg-gold/25 blur-3xl [animation-delay:-6s]" />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12]"
        style={{
          backgroundImage: "radial-gradient(white 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(100deg, black, transparent 70%)",
          WebkitMaskImage: "linear-gradient(100deg, black, transparent 70%)",
        }}
      />

      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-3 py-1 text-xs font-semibold text-gold ring-1 ring-gold/30">
            <span className="size-1.5 rounded-full bg-gold" />
            {companyName}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full glass-dark px-3 py-1 text-xs font-medium text-white/80">
            <CalendarDays className="size-3.5 text-gold" />
            <span suppressHydrationWarning>
              {now
                ? now.toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long" })
                : "Today"}
            </span>
          </div>
          </div>
          <h1 className="font-heading text-3xl font-semibold leading-tight text-white md:text-[2.6rem]">
            <span suppressHydrationWarning>{now ? greeting(now.getHours()) : "Welcome back"}</span>,
            <br />
            <span className="text-gradient-gold italic">Owner.</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70 md:text-base">
            You&apos;ve collected{" "}
            <AnimatedNumber
              value={collected}
              format={(n) => formatPkr(n, { compact: true })}
              className="font-semibold text-gold"
            />{" "}
            so far — {pct}% of this year&apos;s target. Here&apos;s everything moving across your
            projects today.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button
              onClick={onNewBooking}
              className="h-10 gap-2 bg-gold px-4 text-gold-foreground shadow-lg shadow-gold/30 transition-transform hover:-translate-y-0.5 hover:bg-gold/90"
            >
              <PlusCircle className="size-4" />
              New Booking
            </Button>
            <Button
              onClick={onNewLead}
              variant="ghost"
              className="glass-dark h-10 gap-2 px-4 text-white hover:bg-white/15 hover:text-white"
            >
              <UserPlus className="size-4" />
              Add Lead
            </Button>
            <Button
              onClick={onNewVoucher}
              variant="ghost"
              className="glass-dark h-10 gap-2 px-4 text-white hover:bg-white/15 hover:text-white"
            >
              <FileText className="size-4" />
              New Voucher
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-6 sm:gap-8">
          {/* target ring */}
          <div className="relative size-36 shrink-0 sm:size-40">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="7" />
              <motion.circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="url(#heroRing)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
                transition={{ duration: 1.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              />
              <defs>
                <linearGradient id="heroRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.13 165)" />
                  <stop offset="100%" stopColor="oklch(0.85 0.14 85)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <AnimatedNumber
                value={pct}
                format={(n) => `${n}%`}
                className="font-heading text-3xl font-semibold"
              />
              <span className="text-[10px] uppercase tracking-[0.16em] text-white/60">of target</span>
            </div>
          </div>

          {/* living plot grid */}
          <div className="hidden animate-float-slow xl:block">
            <div className="glass-dark grid grid-cols-7 gap-1.5 rounded-2xl p-3">
              {TILE_PATTERN.split("").map((c, i) => (
                <motion.span
                  key={i}
                  className="size-5 rounded-[5px]"
                  style={{ backgroundColor: TILE_COLOR[c] }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: [0.45, 1, 0.45], scale: 1 }}
                  transition={{
                    scale: { delay: 0.4 + i * 0.02, type: "spring", stiffness: 300, damping: 16 },
                    opacity: {
                      duration: 3.2,
                      repeat: Infinity,
                      delay: (i % 7) * 0.25 + Math.floor(i / 7) * 0.2,
                    },
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-center text-[10px] uppercase tracking-[0.16em] text-white/50">
              Live plot availability
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
