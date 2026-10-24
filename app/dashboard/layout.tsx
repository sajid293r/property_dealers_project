"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Info, Lock, LogOut } from "lucide-react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { CompanySwitchOverlay } from "@/components/layout/company-switch-overlay";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/providers/auth-provider";
import { useCompany } from "@/lib/providers/company-provider";
import { liveNoticeFor } from "@/lib/live-routes";
import { usePlanTier } from "@/lib/providers/plan-provider";
import { PLAN_LABEL, tierMeets, tierNeededFor } from "@/lib/plan";
import { APP_NAME } from "@/lib/brand";

function Splash({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Building2 className="size-6" />
      </span>
      {children ?? <p className="text-sm text-muted-foreground">Opening {APP_NAME}…</p>}
    </div>
  );
}

const NOTICES = {
  partial: "Your dashboard fills in as more sections are connected. Properties and projects are live now.",
  preview: "This section isn't connected to your live data yet. What you see here is a preview, and anything you add isn't saved.",
} as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, signOut } = useAuth();
  const { company, live, ready, problem } = useCompany();
  const { tier } = usePlanTier();

  // Not signed in and not in the demo: go to the sign-in page.
  React.useEffect(() => {
    if (status === "signedOut") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || status === "signedOut") return <Splash />;

  if (live && problem) {
    return (
      <Splash>
        <div className="max-w-sm space-y-3">
          <p className="font-heading text-xl font-semibold">We can&apos;t open your workspace</p>
          <p className="text-sm text-muted-foreground">{problem}</p>
          <Button variant="outline" className="gap-2" onClick={() => void signOut()}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </Splash>
    );
  }
  if (live && !ready) return <Splash />;

  const notice = live ? liveNoticeFor(pathname) : "none";
  // Pages built on the demo companies' data must not show that data to a real company.
  const demoOnlyPage = live && pathname.startsWith("/dashboard/companies");
  // A page above the company's plan: say so plainly instead of showing errors (the server refuses it too).
  const needed = live ? tierNeededFor(pathname) : null;
  const locked = needed !== null && !tierMeets(tier, needed);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppTopbar />
        {/* Re-keyed per company so every page remounts against that company's data. */}
        <main key={company.id} className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          {notice !== "none" && (
            <div role="note" className="mx-auto mb-5 flex max-w-[1400px] items-start gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-gold" />
              <span>{NOTICES[notice]}</span>
            </div>
          )}
          {locked && needed ? (
            <div className="mx-auto max-w-xl py-16 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gold/15 text-gold"><Lock className="size-6" /></span>
              <p className="mt-4 font-heading text-2xl font-semibold">This is part of the {PLAN_LABEL[needed]} plan</p>
              <p className="mt-2 text-sm text-muted-foreground">Your company is on the {PLAN_LABEL[tier]} plan. Ask your administrator to upgrade to unlock it.</p>
            </div>
          ) : demoOnlyPage ? (
            <div className="mx-auto max-w-xl py-16 text-center">
              <p className="font-heading text-2xl font-semibold">Group overview isn&apos;t available yet</p>
              <p className="mt-2 text-sm text-muted-foreground">It will compare all your companies side by side once it is connected to your live data.</p>
            </div>
          ) : (
            children
          )}
        </main>
      </SidebarInset>
      <CompanySwitchOverlay />
    </SidebarProvider>
  );
}
