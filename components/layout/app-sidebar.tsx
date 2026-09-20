"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Lock, Sparkles } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NAV_ITEMS, PLAN_LABEL, tierMeets } from "@/lib/plan";
import { usePlanTier } from "@/lib/providers/plan-provider";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();
  const { tier } = usePlanTier();

  const sections = Array.from(new Set(NAV_ITEMS.map((i) => i.section)));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="size-4.5" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-[15px] font-semibold text-sidebar-foreground">
              {APP_NAME}
            </span>
            <span className="text-[11px] text-sidebar-foreground/60">
              {APP_TAGLINE}
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section}>
            <SidebarGroupLabel className="text-[10.5px] font-semibold tracking-wider text-sidebar-foreground/45">
              {section}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.filter((i) => i.section === section).map((item) => {
                  const locked = !tierMeets(tier, item.minTier);
                  const active = pathname === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className={cn(
                          "relative transition-colors duration-150",
                          locked && "opacity-55",
                          active &&
                            "before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary",
                        )}
                      >
                        <Link href={locked ? "/dashboard/settings/billing" : item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {locked && (
                        <SidebarMenuBadge>
                          <Lock className="size-3" />
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="relative overflow-hidden rounded-lg bg-sidebar-accent/60 p-3 ring-1 ring-sidebar-border group-data-[collapsible=icon]:hidden">
          <div className="absolute -right-4 -top-6 size-20 rounded-full bg-sidebar-primary/10 blur-2xl" />
          <div className="relative mb-1.5 flex items-center gap-1.5 text-sidebar-accent-foreground">
            <Sparkles className="size-3.5 text-sidebar-primary" />
            <span className="text-xs font-semibold">{PLAN_LABEL[tier]} plan</span>
          </div>
          <p className="relative text-[11px] leading-snug text-sidebar-foreground/60">
            Manage your plan from Settings to preview what each tier unlocks.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
