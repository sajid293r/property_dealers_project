"use client";

import * as React from "react";
import { Bell, ChevronDown, LogIn, LogOut, Search, UserRound, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { CompanyAvatar } from "@/components/company-avatar";
import { useCompany } from "@/lib/providers/company-provider";
import { useAuth } from "@/lib/providers/auth-provider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CommandPalette } from "@/components/layout/command-palette";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/animated-number";
import { PlanSwitcher } from "@/components/layout/plan-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAccounts } from "@/lib/hooks/use-data";
import { formatPkr } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useT } from "@/lib/i18n/provider";

export function AppTopbar() {
  const { data: accounts, isLoading } = useAccounts();
  const totalCash = accounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0;
  const { company, live } = useCompany();
  const { email, signOut, liveAvailable } = useAuth();
  const router = useRouter();
  const t = useT();
  const initials = live && email ? email.slice(0, 2).toUpperCase() : "OA";
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-1.5 border-b border-border/70 bg-background/80 px-3 backdrop-blur-md sm:gap-2 sm:px-4">
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="me-1 h-5" />

      <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-secondary/40 py-1 ps-1 pe-3 xl:flex">
        <CompanyAvatar company={company} className="size-7 rounded-full text-[10px]" />
        <span className="max-w-40 truncate text-sm font-medium">{company.shortName}</span>
      </div>

      <span
        className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${live ? "border-success/40 bg-success/10 text-success" : "border-gold/40 bg-gold/10 text-gold"}`}
        title={live ? t("shell.topbar.liveHint") : t("shell.topbar.demoHint")}
      >
        <span className={`size-1.5 rounded-full ${live ? "bg-success" : "bg-gold"}`} />
        {live ? t("shell.topbar.live") : t("shell.topbar.demo")}
      </span>

      {!live && (<Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 gap-2 rounded-full border border-border/70 bg-secondary/60 px-3 text-sm font-medium shadow-sm transition-shadow hover:bg-secondary hover:shadow-md"
          >
            <Wallet className="size-4 text-primary" />
            <span className="hidden text-muted-foreground sm:inline">{t("shell.topbar.cashInHand")}</span>
            {isLoading ? (
              <Skeleton className="h-4 w-20" />
            ) : (
              <AnimatedNumber
                value={totalCash}
                format={(n) => formatPkr(n, { compact: true })}
                className="tabular-nums font-semibold text-foreground"
              />
            )}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("shell.topbar.accountBreakdown")}
          </p>
          <div className="space-y-2">
            {accounts?.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground/80">{a.title}</span>
                <span className="tabular-nums font-medium">
                  {formatPkr(a.balance)}
                </span>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>)}

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="group ms-auto hidden h-9 w-64 items-center gap-2 rounded-full border border-border/70 bg-secondary/50 px-3 text-sm text-muted-foreground shadow-sm transition-all hover:border-gold/50 hover:bg-secondary hover:shadow-md lg:flex"
      >
        <Search className="size-4 transition-colors group-hover:text-primary" />
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-start">{t("shell.topbar.searchModules")}</span>
        <kbd className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      <div className="ms-auto flex items-center gap-1.5 sm:gap-2 lg:ms-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 lg:hidden"
          onClick={() => setPaletteOpen(true)}
          aria-label={t("shell.topbar.search")}
        >
          <Search className="size-4" />
        </Button>
        {!live && (
          <div className="hidden md:block">
            <PlanSwitcher />
          </div>
        )}
        <LanguageSwitcher />
        <ThemeToggle />

        {!live && (<Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative size-8 hover:bg-secondary">
              <Bell className="size-4" />
              <span className="absolute end-1.5 top-1.5 flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold/70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-gold" />
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{t("shell.topbar.notifications")}</p>
              <Badge variant="secondary" className="text-[10px]">{t("shell.topbar.newCount", { count: 3 })}</Badge>
            </div>
            <div className="space-y-2">
              <NotificationRow
                title={t("shell.notify.installmentDue")}
                detail={t("shell.notify.installmentDueDetail")}
              />
              <NotificationRow
                title={t("shell.notify.newLead")}
                detail={t("shell.notify.newLeadDetail")}
              />
              <NotificationRow
                title={t("shell.notify.contract")}
                detail={t("shell.notify.contractDetail")}
              />
            </div>
          </PopoverContent>
        </Popover>)}

        <Separator orientation="vertical" className="h-6" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("shell.topbar.accountMenu")}>
              <Avatar className="size-8 ring-2 ring-gold/40 transition-all hover:ring-gold">
                {!live && <AvatarImage src="https://i.pravatar.cc/64?u=owner" />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full border-2 border-background bg-success" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{live ? email : t("shell.topbar.demoWorkspace")}</p>
              <p className="text-xs text-muted-foreground">{live ? t("shell.topbar.signedIn") : t("shell.topbar.sampleOnly")}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {live || !liveAvailable ? (
              !liveAvailable ? null : (
                <>
                <DropdownMenuItem onSelect={() => router.push("/dashboard/account")} className="gap-2">
                  <UserRound className="size-4" /> {t("shell.topbar.myAccount")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void signOut()} className="gap-2">
                  <LogOut className="size-4" /> {t("common.signOut")}
                </DropdownMenuItem>
                </>
              )
            ) : (
              <DropdownMenuItem onSelect={() => { void signOut().then(() => router.replace("/login")); }} className="gap-2">
                <LogIn className="size-4" /> {t("shell.topbar.signIn")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function NotificationRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex gap-2.5 rounded-md border border-border/60 p-2.5 text-sm transition-colors hover:bg-secondary/50">
      <div className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
      <div>
        <p className="font-medium leading-tight">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
