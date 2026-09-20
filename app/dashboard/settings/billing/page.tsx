"use client";

import { Check } from "lucide-react";
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
      <div>
        <h1 className="font-heading text-2xl font-semibold">Billing &amp; subscription</h1>
        <p className="text-sm text-muted-foreground">
          Switch plans below to preview what each tier unlocks across the app.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {PRICING.map((p) => {
          const current = p.id === tier;
          return (
            <Card
              key={p.id}
              className={cn(
                "relative isolate flex flex-col p-6 transition-transform duration-300",
                current
                  ? "border-primary/60 shadow-lg shadow-primary/10 md:-translate-y-1.5"
                  : "hover:-translate-y-0.5 hover:shadow-md",
              )}
            >
              {current && <PlotGridMotif className="rounded-xl opacity-50" />}
              <div className="relative flex items-center justify-between">
                <h3 className="font-heading text-lg font-semibold">{p.name}</h3>
                {current && <Badge>Current plan</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-heading text-2xl font-semibold">{formatPkr(p.priceMonthlyPkr)}</span>
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
          );
        })}
      </div>
    </div>
  );
}
