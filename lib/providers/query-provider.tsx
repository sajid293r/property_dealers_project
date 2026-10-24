"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCompany } from "@/lib/providers/company-provider";
import { useAuth } from "@/lib/providers/auth-provider";

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

// One cache per company: records created or edited in one company's session
// stay in that company's cache and can never leak into (or be read from)
// another's — and they're still there when you switch back.
const clientsByCompany = new Map<string, QueryClient>();

function getClient(companyId: string) {
  if (typeof window === "undefined") return createClient();
  let client = clientsByCompany.get(companyId);
  if (!client) {
    client = createClient();
    clientsByCompany.set(companyId, client);
  }
  return client;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const { company } = useCompany();
  const { status } = useAuth();
  // Real people's data must never survive a sign-out (the next person on this browser would see it).
  React.useEffect(() => {
    if (status === "signedOut") clientsByCompany.clear();
  }, [status]);
  const client = getClient(company.id);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
