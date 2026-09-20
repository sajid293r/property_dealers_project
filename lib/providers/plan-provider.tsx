"use client";

import * as React from "react";
import type { PlanTier } from "@/lib/types";

interface PlanContextValue {
  tier: PlanTier;
  setTier: (tier: PlanTier) => void;
}

const PlanContext = React.createContext<PlanContextValue | null>(null);

const STORAGE_KEY = "demo-plan-tier";

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTierState] = React.useState<PlanTier>("premium");

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as PlanTier | null;
    // One-time read of a client-only store (localStorage) to hydrate initial state — not derivable without an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setTierState(stored);
  }, []);

  const setTier = React.useCallback((next: PlanTier) => {
    setTierState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <PlanContext.Provider value={{ tier, setTier }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlanTier() {
  const ctx = React.useContext(PlanContext);
  if (!ctx) throw new Error("usePlanTier must be used within PlanProvider");
  return ctx;
}
