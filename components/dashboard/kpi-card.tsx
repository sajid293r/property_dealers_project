"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { cn } from "@/lib/utils";

const MotionLink = motion.create(Link);

export function KpiCard({
  label,
  value,
  format,
  icon: Icon,
  delta,
  index = 0,
  accent = "primary",
  href,
  onClick,
  hintLabel,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  icon: LucideIcon;
  delta?: number;
  index?: number;
  accent?: "primary" | "gold";
  href?: string;
  onClick?: () => void;
  hintLabel?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  const interactive = Boolean(href || onClick);
  const resolvedHint = hintLabel ?? (href ? "View" : "Filter");

  const cardClassName = cn(
    "group relative block w-full overflow-hidden rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/[0.06]",
    interactive && "cursor-pointer hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  const motionProps = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] as const },
  };

  const content = (
    <>
      <div
        className={cn(
          "absolute -right-6 -top-6 size-24 rounded-full opacity-[0.08] blur-[2px] transition-transform duration-500 group-hover:scale-125",
          accent === "gold" ? "bg-gold" : "bg-primary",
        )}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <AnimatedNumber
            value={value}
            format={format}
            className="mt-1.5 block font-heading text-2xl font-semibold tabular-nums text-foreground"
          />
        </div>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
            accent === "gold"
              ? "bg-gold/15 text-gold group-hover:bg-gold group-hover:text-gold-foreground"
              : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
          )}
        >
          <Icon className="size-4.5" />
        </div>
      </div>
      <div className="relative mt-3 flex items-center gap-1.5 text-xs">
        {delta !== undefined && (
          <>
            <span
              className={cn(
                "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
                positive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
              )}
            >
              {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(delta)}%
            </span>
            <span className="text-muted-foreground">vs last period</span>
          </>
        )}
        {interactive && (
          <span className="ml-auto flex items-center gap-0.5 font-medium text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {resolvedHint}
            <ArrowRight className="size-3" />
          </span>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <MotionLink href={href} className={cardClassName} {...motionProps}>
        {content}
      </MotionLink>
    );
  }

  return (
    <motion.div
      {...motionProps}
      className={cardClassName}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {content}
    </motion.div>
  );
}
