"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlotGridMotif } from "@/components/plot-grid-motif";

export function ComingSoon({
  title,
  description,
  icon: Icon = Construction,
  tier,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  tier?: "moderate" | "premium";
}) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {tier && (
          <Badge variant="outline" className="border-gold/40 bg-gold/10 text-gold capitalize">
            {tier} tier
          </Badge>
        )}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="relative isolate flex flex-col items-center gap-3 overflow-hidden border-dashed p-16 text-center">
          <PlotGridMotif className="opacity-70" />
          <div className="relative flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15">
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-md" />
            <Icon className="relative size-6" />
          </div>
          <p className="relative font-heading text-base font-semibold">This module is next up in the build-out</p>
          <p className="relative max-w-sm text-sm leading-relaxed text-muted-foreground">
            The screen is scoped in <span className="font-mono text-xs">docs/FEATURES.md</span> and
            <span className="font-mono text-xs"> docs/PROJECT_PLAN.md</span> — wiring it to the same mock
            data layer as the rest of the app comes next.
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
