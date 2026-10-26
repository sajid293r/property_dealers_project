"use client";

import * as React from "react";
import { SEED_COMPANIES, type Company } from "@/lib/companies";
import { SAMPLE_SUFFIX } from "@/lib/mock-data/company-data";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/providers/auth-provider";
import { isLanguageCode, type LanguageCode } from "@/lib/i18n/config";

interface CompanyContextValue {
  companies: Company[];
  company: Company;
  setCompanyId: (id: string) => void;
  addCompany: (input: Pick<Company, "name" | "city"> & Partial<Company>) => Company;
  /** The company being switched to, for a moment after a switch (drives the transition overlay). */
  switching: Company | null;
  /** True when the companies are the person's real ones (signed in), not the demo companies. */
  live: boolean;
  /** False while the company list is still being fetched; screens show a skeleton until then. */
  ready: boolean;
  /** Set when the list could not be fetched, or the person belongs to no company yet. */
  problem: string | null;
  /** Fetch the account (names, plans, languages) again, e.g. after an administrator changes the company default. */
  reloadAccount: () => void;
  /** The interface language saved on the signed-in person's account: null = none chosen, undefined = not known (yet, or demo). */
  userLanguage: LanguageCode | null | undefined;
}

const CompanyContext = React.createContext<CompanyContextValue | null>(null);

const ACTIVE_KEY = "demo-company-id";
const LIVE_ACTIVE_KEY = "propiq-live-company-id";
const CUSTOM_KEY = "demo-custom-companies";
const ACCENTS = ["oklch(0.55 0.13 310)", "oklch(0.58 0.13 200)", "oklch(0.6 0.14 85)", "oklch(0.55 0.15 20)"];

/** Shown only for the instant before the real list arrives. */
const PLACEHOLDER: Company = {
  id: "loading",
  name: "Loading…",
  shortName: "…",
  city: "",
  industry: "",
  ntn: "",
  phone: "",
  email: "",
  accent: ACCENTS[0]!,
};

interface MeResponse {
  user?: { language?: string | null };
  companies: { companyId: string; name: string; shortName: string | null; status: string; role: string; plan?: "basic" | "moderate" | "premium"; defaultLanguage?: string | null }[];
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const live = status === "live";

  const [custom, setCustom] = React.useState<Company[]>([]);
  const [activeId, setActiveId] = React.useState(SEED_COMPANIES[0].id);
  const [switching, setSwitching] = React.useState<Company | null>(null);
  const [liveCompanies, setLiveCompanies] = React.useState<Company[] | null>(null);
  const [liveProblem, setLiveProblem] = React.useState<string | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);
  const [userLanguage, setUserLanguage] = React.useState<LanguageCode | null | undefined>(undefined);

  // demo mode: remembered companies and the active one
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

  // live mode: the companies this person really belongs to
  React.useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveCompanies(null);
      setLiveProblem(null);
      setUserLanguage(undefined);
      return;
    }
    let active = true;
    api<MeResponse>("/v1/me")
      .then((me) => {
        if (!active) return;
        const list: Company[] = me.companies
          .filter((c) => c.status === "active")
          .map((c, i) => ({
            id: c.companyId,
            name: c.name,
            shortName: c.shortName ?? c.name,
            city: "",
            industry: "Real estate",
            ntn: "",
            phone: "",
            email: "",
            accent: ACCENTS[i % ACCENTS.length]!,
            custom: true,
            plan: c.plan ?? "basic",
            defaultLanguage: isLanguageCode(c.defaultLanguage) ? c.defaultLanguage : undefined,
          }));
        setLiveCompanies(list);
        setUserLanguage(isLanguageCode(me.user?.language) ? me.user.language : null);
        setLiveProblem(list.length ? null : "You haven't been added to a company yet. Ask your administrator to add you.");
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(LIVE_ACTIVE_KEY);
        } catch {
          /* ignore */
        }
        setActiveId(list.find((c) => c.id === stored)?.id ?? list[0]?.id ?? "");
      })
      .catch((e: unknown) => {
        if (!active) return;
        setLiveCompanies([]);
        setLiveProblem(e instanceof Error ? e.message : "Could not load your companies.");
      });
    return () => {
      active = false;
    };
  }, [live, reloadTick]);

  const reloadAccount = React.useCallback(() => setReloadTick((n) => n + 1), []);

  const companies = React.useMemo(
    () => (live ? (liveCompanies ?? []) : [...SEED_COMPANIES, ...custom]),
    [live, liveCompanies, custom],
  );
  const company = companies.find((c) => c.id === activeId) ?? companies[0] ?? PLACEHOLDER;
  const ready = live ? liveCompanies !== null && companies.length > 0 : true;

  const setCompanyId = React.useCallback(
    (id: string) => {
      if (id === activeId) return;
      setSwitching(companies.find((c) => c.id === id) ?? null);
      window.setTimeout(() => {
        setActiveId(id);
        try {
          window.localStorage.setItem(live ? LIVE_ACTIVE_KEY : ACTIVE_KEY, id);
        } catch {
          /* ignore */
        }
      }, 280);
      window.setTimeout(() => setSwitching(null), 1000);
    },
    [activeId, companies, live],
  );

  const addCompany = React.useCallback<CompanyContextValue["addCompany"]>(
    (input) => {
      const created: Company = {
        id: `co-${Date.now()}${input.sample ? SAMPLE_SUFFIX : ""}`,
        shortName: input.name.split(" ").slice(0, 2).join(" "),
        industry: "Real estate",
        ntn: "",
        phone: "",
        email: "",
        accent: ACCENTS[custom.length % ACCENTS.length]!,
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
    <CompanyContext.Provider
      value={{ companies, company, setCompanyId, addCompany, switching, live, ready, problem: live ? liveProblem : null, userLanguage, reloadAccount }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = React.useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
