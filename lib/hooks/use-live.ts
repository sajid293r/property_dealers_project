"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useCompany } from "@/lib/providers/company-provider";
import {
  listAccounts,
  listBankAccounts,
  listBanks,
  listParties,
  type PartyRole,
} from "@/lib/api/finance";

/**
 * Data for the live (real-company) screens. Every key starts with "live" so it can never collide with the demo
 * data, and every query only runs for a real company. Each company has its own cache (see QueryProvider).
 */
function useLive<T>(key: unknown[], fetcher: (companyId: string) => Promise<T>, staleTime = 30_000) {
  const { company, live } = useCompany();
  return useQuery({ queryKey: ["live", ...key], queryFn: () => fetcher(company.id), enabled: live && company.id !== "loading", staleTime });
}

export const useChartAccounts = () => useLive(["accounts"], listAccounts);
export const useBankCatalog = () => useLive(["banks"], listBanks, 10 * 60_000);
export const useBankAccounts = () => useLive(["bank-accounts"], listBankAccounts);
export const useParties = (role?: PartyRole) => useLive(["parties", role ?? "all"], (id) => listParties(id, role));

/** Refresh everything a voucher or a bank action can change. */
export function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["live"] });
}

/** What the signed-in person may do in this company, so a screen can hide a button that would be refused. */
export function usePermissions() {
  const { company, live } = useCompany();
  const q = useQuery({
    queryKey: ["live", "access"],
    queryFn: () => api<{ permissions: string[] }>("/v1/access", { companyId: company.id }),
    enabled: live && company.id !== "loading",
    staleTime: 60_000,
  });
  const set = new Set(q.data?.permissions ?? []);
  return { can: (permission: string) => set.has(permission), loaded: q.isSuccess };
}
