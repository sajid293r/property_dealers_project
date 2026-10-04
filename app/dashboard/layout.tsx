"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { CompanySwitchOverlay } from "@/components/layout/company-switch-overlay";
import { useCompany } from "@/lib/providers/company-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { company } = useCompany();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppTopbar />
        {/* Re-keyed per company so every page remounts against that company's data. */}
        <main key={company.id} className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </SidebarInset>
      <CompanySwitchOverlay />
    </SidebarProvider>
  );
}
