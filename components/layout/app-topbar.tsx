"use client";

import { Bell, ChevronDown, Wallet } from "lucide-react";
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

export function AppTopbar() {
  const { data: accounts, isLoading } = useAccounts();
  const totalCash = accounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0;

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-9 gap-2 rounded-full border border-border/70 bg-secondary/60 px-3 text-sm font-medium shadow-sm transition-shadow hover:bg-secondary hover:shadow-md"
          >
            <Wallet className="size-4 text-primary" />
            <span className="hidden text-muted-foreground sm:inline">Cash in hand</span>
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
            Account breakdown
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
      </Popover>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div className="hidden md:block">
          <PlanSwitcher />
        </div>
        <ThemeToggle />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative size-8 hover:bg-secondary">
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold/70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-gold" />
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Notifications</p>
              <Badge variant="secondary" className="text-[10px]">3 new</Badge>
            </div>
            <div className="space-y-2">
              <NotificationRow
                title="Installment due tomorrow"
                detail="Ahmed Khan — Plot UNT-1042"
              />
              <NotificationRow
                title="New lead assigned"
                detail="Sana Qureshi — Emerald Gardens"
              />
              <NotificationRow
                title="Contract expiring in 5 days"
                detail="Dealer Agreement #1004"
              />
            </div>
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6" />

        <Avatar className="size-8 ring-2 ring-transparent transition-all hover:ring-primary/20">
          <AvatarImage src="https://i.pravatar.cc/64?u=owner" />
          <AvatarFallback>OA</AvatarFallback>
        </Avatar>
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
