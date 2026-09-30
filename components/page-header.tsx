"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared page masthead: icon tile with a soft glow, section eyebrow, display-serif
 * title with an animated gold underline, description and an actions slot.
 */
export function PageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  badge,
  actions,
  back,
  className,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  /** Renders a pill link above the title for detail pages. */
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex flex-wrap items-center justify-between gap-4", className)}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <motion.div
            initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
            className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_25%)] text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-white/10"
          >
            <span className="absolute -inset-1 -z-10 rounded-2xl bg-gold/30 opacity-60 blur-lg" />
            <Icon className="size-5.5" />
          </motion.div>
        )}
        <div className="min-w-0">
          {back && (
            <Link
              href={back.href}
              className="group/back mb-1.5 inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <ArrowLeft className="size-3 transition-transform group-hover/back:-translate-x-0.5" />
              {back.label}
            </Link>
          )}
          {eyebrow && !back && (
            <p className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-[1.65rem] font-semibold leading-tight sm:text-3xl">
              {title}
            </h1>
            {badge}
          </div>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "left" }}
            className="mt-1.5 h-[3px] w-12 rounded-full bg-gradient-to-r from-gold to-transparent"
          />
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}
