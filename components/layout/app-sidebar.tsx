"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronDown, Lock, Sparkles } from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { NAV_ITEMS, PLAN_LABEL, tierMeets } from "@/lib/plan";
import { usePlanTier } from "@/lib/providers/plan-provider";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { PlotGridMotif } from "@/components/plot-grid-motif";
import { cn } from "@/lib/utils";

/** Exact match, or a nested route under `href` (e.g. /vouchers/new, /vouchers/[id]) — except the dashboard root, which every route nests under. */
function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  return pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { tier } = usePlanTier();
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});

  const sections = Array.from(new Set(NAV_ITEMS.map((i) => i.section)));

  return (
    <Sidebar collapsible="icon">
      <PlotGridMotif variant="inverted" className="opacity-[0.07]" />
      <SidebarHeader className="relative px-3 py-4">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-[color-mix(in_oklch,var(--sidebar-primary),black_15%)] text-sidebar-primary-foreground shadow-sm">
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
                  const childActive =
                    item.children?.some((c) => isActivePath(pathname, c.href)) ?? false;
                  const active = isActivePath(pathname, item.href) || childActive;

                  if (item.children?.length) {
                    const isOpen = openGroups[item.href] ?? childActive;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={active}
                          aria-expanded={isOpen}
                          className={cn(
                            "relative transition-colors duration-150",
                            locked && "opacity-55 pointer-events-none",
                            active &&
                              "bg-gradient-to-r from-sidebar-primary/20 via-sidebar-primary/5 to-transparent before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary",
                          )}
                          onClick={() =>
                            setOpenGroups((prev) => ({ ...prev, [item.href]: !isOpen }))
                          }
                        >
                          <item.icon />
                          <span>{item.label}</span>
                          <ChevronDown
                            className={cn(
                              "ml-auto size-3.5 shrink-0 text-sidebar-foreground/50 transition-transform duration-200",
                              isOpen && "rotate-180",
                            )}
                          />
                        </SidebarMenuButton>
                        {locked && (
                          <SidebarMenuBadge>
                            <Lock className="size-3" />
                          </SidebarMenuBadge>
                        )}
                        {isOpen && !locked && (
                          <SidebarMenuSub>
                            {item.children.map((child) => {
                              const childOneActive = isActivePath(pathname, child.href);
                              return (
                                <SidebarMenuSubItem key={child.href}>
                                  <SidebarMenuSubButton asChild isActive={childOneActive}>
                                    <Link href={child.href}>
                                      <span>{child.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        )}
                      </SidebarMenuItem>
                    );
                  }

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className={cn(
                          "relative transition-colors duration-150",
                          locked && "opacity-55",
                          active &&
                            "bg-gradient-to-r from-sidebar-primary/20 via-sidebar-primary/5 to-transparent before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary",
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
        <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-sidebar-accent/80 to-sidebar-accent/30 p-3 ring-1 ring-sidebar-border group-data-[collapsible=icon]:hidden">
          <div className="absolute -right-4 -top-6 size-20 rounded-full bg-sidebar-primary/15 blur-2xl" />
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
