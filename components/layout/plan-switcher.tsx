"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLAN_LABEL } from "@/lib/plan";
import { usePlanTier } from "@/lib/providers/plan-provider";
import type { PlanTier } from "@/lib/types";
import { Sparkles } from "lucide-react";

const TIERS: PlanTier[] = ["basic", "moderate", "premium"];

export function PlanSwitcher() {
  const { tier, setTier } = usePlanTier();

  return (
    <Select value={tier} onValueChange={(v) => setTier(v as PlanTier)}>
      <SelectTrigger size="sm" className="gap-1.5 border-dashed">
        <Sparkles className="size-3.5 text-gold" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {TIERS.map((t) => (
          <SelectItem key={t} value={t}>
            {PLAN_LABEL[t]} plan
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
