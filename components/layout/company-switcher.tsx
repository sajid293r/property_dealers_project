"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { CompanyAvatar } from "@/components/company-avatar";
import { NewCompanyDialog } from "@/components/dialogs/new-company-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useLanguage } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/** Sidebar control for picking which company's workspace is open. */
export function CompanySwitcher() {
  const { companies, company, setCompanyId, live } = useCompany();
  const { t, dir } = useLanguage();
  const { state, isMobile } = useSidebar();
  const [addOpen, setAddOpen] = React.useState(false);
  const collapsed = state === "collapsed" && !isMobile;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-xl bg-white/[0.06] p-2 text-start ring-1 ring-white/10 transition-all hover:bg-white/10 hover:ring-sidebar-primary/40 data-[state=open]:bg-white/10 data-[state=open]:ring-sidebar-primary/50",
              collapsed && "size-10 justify-center p-1",
            )}
          >
            <CompanyAvatar company={company} className={cn(collapsed && "size-8")} />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-semibold text-sidebar-foreground">
                    {company.shortName}
                  </span>
                  <span className="block truncate text-[11px] text-sidebar-foreground/55">
                    {live ? "" : <><bdi>{company.city}</bdi>{" · "}</>}{t("shell.company.count", { count: companies.length })}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/50 transition-colors group-hover:text-sidebar-primary" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side={collapsed ? (dir === "rtl" ? "left" : "right") : "bottom"} className="w-72 p-1.5">
          <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("shell.company.switch")}
          </DropdownMenuLabel>
          {companies.map((c) => {
            const active = c.id === company.id;
            return (
              <DropdownMenuItem
                key={c.id}
                onSelect={() => setCompanyId(c.id)}
                className={cn("gap-2.5 rounded-lg p-2", active && "bg-primary/10")}
              >
                <CompanyAvatar company={c} className="size-9" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {live ? c.industry : `${c.city} · ${c.industry}`}
                  </span>
                </span>
                {active && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
          {!live && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="gap-2.5 rounded-lg p-2">
                <Link href="/dashboard/companies">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                    <LayoutGrid className="size-4" />
                  </span>
                  <span className="text-sm font-medium">{t("shell.company.groupOverview")}</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAddOpen(true)} className="gap-2.5 rounded-lg p-2">
                <span className="flex size-9 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
                  <Plus className="size-4" />
                </span>
                <span className="text-sm font-medium">{t("shell.company.add")}</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewCompanyDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
