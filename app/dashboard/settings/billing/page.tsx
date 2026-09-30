"use client";

import { CreditCard as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AnimatedNumber } from "@/components/animated-number";
import { motion } from "framer-motion";
import { Check, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlotGridMotif } from "@/components/plot-grid-motif";
import { PRICING } from "@/lib/plan";
import { formatPkr } from "@/lib/format";
import { usePlanTier } from "@/lib/providers/plan-provider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function BillingPage() {
  const { tier, setTier } = usePlanTier();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="Configuration"
        title="Billing &amp; subscription"
        description="Switch plans below to preview what each tier unlocks across the app."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {PRICING.map((p, i) => {
          const current = p.id === tier;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex"
            >
            <Card
              className={cn(
                "relative isolate h-full w-full flex-col p-6 transition-all duration-300",
                current
                  ? "border-gold/60 shadow-2xl shadow-gold/15 ring-2 ring-gold/50 md:-translate-y-2"
                  : "hover:-translate-y-1 hover:shadow-xl",
              )}
            >
              {current && <PlotGridMotif className="rounded-xl opacity-60" />}
              {current && (
                <span className="absolute -top-px left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-b-lg bg-gold px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gold-foreground shadow-md">
                  <Crown className="size-3" /> Your plan
                </span>
              )}
              <div className="relative mt-2 flex items-center justify-between">
                <h3 className="font-heading text-xl font-semibold">{p.name}</h3>
                {p.highlight && !current && <Badge variant="outline" className="border-gold/40 bg-gold/10 text-gold">Most popular</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-heading text-3xl font-semibold"><AnimatedNumber value={p.priceMonthlyPkr} format={(n) => formatPkr(n)} /></span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-foreground/85">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6"
                variant={current ? "outline" : "default"}
                disabled={current}
                onClick={() => {
                  setTier(p.id);
                  toast.success(`Switched to the ${p.name} plan`);
                }}
              >
                {current ? "Currently active" : `Switch to ${p.name}`}
              </Button>
            </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
