"use client";

import * as React from "react";
import { SEED_COMPANIES, type Company } from "@/lib/companies";

interface CompanyContextValue {
  companies: Company[];
  company: Company;
  setCompanyId: (id: string) => void;
  addCompany: (input: Pick<Company, "name" | "city"> & Partial<Company>) => Company;
  /** The company being switched to, for a moment after a switch (drives the transition overlay). */
  switching: Company | null;
}

const CompanyContext = React.createContext<CompanyContextValue | null>(null);

const ACTIVE_KEY = "demo-company-id";
const CUSTOM_KEY = "demo-custom-companies";
const ACCENTS = ["oklch(0.55 0.13 310)", "oklch(0.58 0.13 200)", "oklch(0.6 0.14 85)", "oklch(0.55 0.15 20)"];

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [custom, setCustom] = React.useState<Company[]>([]);
  const [activeId, setActiveId] = React.useState(SEED_COMPANIES[0].id);
  const [switching, setSwitching] = React.useState<Company | null>(null);

  React.useEffect(() => {
    try {
      const storedCustom = JSON.parse(window.localStorage.getItem(CUSTOM_KEY) ?? "[]") as Company[];
      // ?company=co-2 deep-links straight into a company workspace.
      const fromUrl = new URLSearchParams(window.location.search).get("company");
      const storedActive = fromUrl ?? window.localStorage.getItem(ACTIVE_KEY);
      // One-time read of client-only storage to hydrate initial state.
      /* eslint-disable react-hooks/set-state-in-effect */
      if (storedCustom.length) setCustom(storedCustom);
      if (storedActive) setActiveId(storedActive);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // ignore corrupted storage
    }
  }, []);

  const companies = React.useMemo(() => [...SEED_COMPANIES, ...custom], [custom]);
  const company = companies.find((c) => c.id === activeId) ?? companies[0];

  const setCompanyId = React.useCallback(
    (id: string) => {
      if (id === activeId) return;
      setSwitching(companies.find((c) => c.id === id) ?? null);
      window.setTimeout(() => {
        setActiveId(id);
        window.localStorage.setItem(ACTIVE_KEY, id);
      }, 280);
      window.setTimeout(() => setSwitching(null), 1000);
    },
    [activeId, companies],
  );

  const addCompany = React.useCallback<CompanyContextValue["addCompany"]>(
    (input) => {
      const created: Company = {
        id: `co-${Date.now()}`,
        shortName: input.name.split(" ").slice(0, 2).join(" "),
        industry: "Real estate",
        ntn: "",
        phone: "",
        email: "",
        accent: ACCENTS[custom.length % ACCENTS.length],
        ...input,
        custom: true,
      };
      const next = [...custom, created];
      setCustom(next);
      window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
      return created;
    },
    [custom],
  );

  return (
    <CompanyContext.Provider value={{ companies, company, setCompanyId, addCompany, switching }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = React.useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
