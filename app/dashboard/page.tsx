"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Crown,
  FolderPlus,
  HandCoins,
  Handshake,
  PackageOpen,
  Receipt,
  Scale,
  Users2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { HeroBanner } from "@/components/dashboard/hero-banner";
import { SalesFunnel } from "@/components/dashboard/sales-funnel";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { HealthScore } from "@/components/dashboard/health-score";
import { AttentionCenter } from "@/components/dashboard/attention-center";
import { SmartInsights } from "@/components/dashboard/smart-insights";
import { ReceivableAging } from "@/components/dashboard/receivable-aging";
import { CollectionSchedule } from "@/components/dashboard/collection-schedule";
import { CashflowCard } from "@/components/dashboard/cashflow-card";
import { ExpenseBreakdown } from "@/components/dashboard/expense-breakdown";
import { PortfolioTable } from "@/components/dashboard/portfolio-table";
import { AgentLeaderboard } from "@/components/dashboard/agent-leaderboard";
import { UpcomingTimeline } from "@/components/dashboard/upcoming-timeline";
import { PeopleSnapshot } from "@/components/dashboard/people-snapshot";
import { PeriodToggle } from "@/components/dashboard/period-toggle";
import { SectionTitle } from "@/components/dashboard/section-title";
import { SpotlightCard } from "@/components/spotlight-card";
import { CollectionsChart } from "@/components/charts/collections-chart";
import { NewBookingDialog } from "@/components/dialogs/new-booking-dialog";
import { useDashboardData } from "@/lib/hooks/use-dashboard-data";
import {
  PERIOD_LABEL,
  agentLeaderboard,
  attentionItems,
  cashFlowWeekly,
  cashPosition,
  collectionSchedule,
  collectionsByMonth,
  expenseBreakdown,
  healthScore,
  inventory,
  payables,
  people,
  periodStats,
  portfolio,
  receivables,
  recentActivity,
  smartInsights,
  upcoming,
  type Period,
} from "@/lib/dashboard-insights";
import { useCompany } from "@/lib/providers/company-provider";
import { usePlanTier } from "@/lib/providers/plan-provider";
import { formatPkr, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const { company } = useCompany();
  const { tier } = usePlanTier();
  const { data, isLoading } = useDashboardData();
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [period, setPeriod] = React.useState<Period>("30d");


  const model = React.useMemo(() => {
    if (!data) return null;
    const money = (n: number) => formatPkr(n, { compact: true });
    return {
      rec: receivables(data),
      stats: periodStats(data, period),
      inv: inventory(data),
      cash: cashPosition(data),
      pay: payables(data),
      health: healthScore(data),
      attention: attentionItems(data, money),
      insights: smartInsights(data, money, period),
      schedule: collectionSchedule(data),
      flow: cashFlowWeekly(data),
      expenses: expenseBreakdown(data),
      port: portfolio(data),
      agents: agentLeaderboard(data),
      events: upcoming(data),
      team: people(data),
      activity: recentActivity(data),
      spark: collectionsByMonth(data),
    };
  }, [data, period]);

  const liveDeals = data?.deals.filter((d) => d.status !== "cancelled") ?? [];
  const totalCollected = liveDeals.reduce((s, d) => s + d.paidAmount, 0);
  const bookedValue = liveDeals.reduce((s, d) => s + d.totalAmount, 0);
  const isEmpty = !!data && data.units.length === 0 && data.deals.length === 0;

  const recentDeals = [...(data?.deals ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6);
  const customerName = (id: string) => data?.customers.find((c) => c.id === id)?.name ?? "—";
  const unitCode = (id: string) => data?.units.find((u) => u.id === id)?.code ?? "—";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <HeroBanner
        companyName={company.name}
        collected={totalCollected}
        bookedValue={bookedValue}
        onNewBooking={() => setBookingOpen(true)}
        onNewLead={() => router.push("/dashboard/crm")}
        onNewVoucher={() => router.push("/dashboard/vouchers/new")}
      />

      {isLoading || !model || !data ? (
        <DashboardSkeleton />
      ) : isEmpty ? (
        <GettingStarted companyName={company.name} onBooking={() => setBookingOpen(true)} />
      ) : (
        <>
          {/* ─────────── health + to-do */}
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-4"><HealthScore {...model.health} /></div>
            <div className="xl:col-span-8"><AttentionCenter items={model.attention} /></div>
          </div>

          {/* ─────────── key numbers */}
          <SectionTitle eyebrow="At a glance" title="Key numbers" right={<PeriodToggle value={period} onChange={setPeriod} />} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label={`Collected · ${PERIOD_LABEL[period].toLowerCase()}`} value={model.stats.collected} format={(n) => formatPkr(n, { compact: true })} icon={HandCoins} accent="gold" delta={model.stats.collectedDelta} index={0} href="/dashboard/accounts" trend={model.spark} />
            <KpiCard label={`New bookings · ${PERIOD_LABEL[period].toLowerCase()}`} value={model.stats.bookings} format={(n) => n.toString()} icon={Handshake} delta={model.stats.bookingsDelta} index={1} href="/dashboard/deals" />
            <KpiCard label="Overdue receivables" value={model.rec.overdueAmount} format={(n) => formatPkr(n, { compact: true })} icon={Scale} accent="gold" index={2} href="/dashboard/deals" />
            <KpiCard label="Properties available" value={model.inv.available} format={(n) => n.toString()} icon={Building2} index={3} href="/dashboard/properties" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Cash & bank in hand" value={model.cash.total} format={(n) => formatPkr(n, { compact: true })} icon={Wallet} index={4} href="/dashboard/accounts" />
            <KpiCard label="Receivable outstanding" value={model.rec.totalOutstanding} format={(n) => formatPkr(n, { compact: true })} icon={Banknote} accent="gold" index={5} href="/dashboard/deals" />
            <KpiCard label="Unpaid bills" value={model.pay.amount} format={(n) => formatPkr(n, { compact: true })} icon={Receipt} index={6} href="/dashboard/expenses" />
            <KpiCard label="Unsold stock value" value={model.inv.availableValue} format={(n) => formatPkr(n, { compact: true })} icon={PackageOpen} accent="gold" index={7} href="/dashboard/properties" />
          </div>

          <SmartInsights insights={model.insights} />

          {/* ─────────── money */}
          <SectionTitle eyebrow="Money" title="Collections, cash & costs" />
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8"><CollectionSchedule schedule={model.schedule} /></div>
            <div className="xl:col-span-4"><ReceivableAging rec={model.rec} customers={data.customers} /></div>
          </div>
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7"><CashflowCard position={model.cash} weekly={model.flow} /></div>
            <div className="xl:col-span-5"><ExpenseBreakdown data={model.expenses} /></div>
          </div>

          {/* ─────────── sales */}
          <SectionTitle eyebrow="Sales & projects" title="How the portfolio is performing" />
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8"><PortfolioTable rows={model.port} /></div>
            <div className="xl:col-span-4"><AgentLeaderboard rows={model.agents} /></div>
          </div>
          <div className="grid gap-4 xl:grid-cols-12">
            <SpotlightCard className="p-5 xl:col-span-8"><CollectionsChart /></SpotlightCard>
            <SpotlightCard className="p-5 xl:col-span-4"><SalesFunnel leads={data.leads} /></SpotlightCard>
          </div>

          {/* ─────────── operations */}
          <SectionTitle eyebrow="Operations" title="What's coming and what just happened" />
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-5"><UpcomingTimeline events={model.events} /></div>
            <SpotlightCard className="p-5 xl:col-span-4"><ActivityFeed events={model.activity} /></SpotlightCard>
            <div className="xl:col-span-3"><PeopleSnapshot data={model.team} /></div>
          </div>

          <SpotlightCard className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-heading text-base font-semibold">Recent bookings</h3>
                <p className="text-xs text-muted-foreground">Latest deals across all projects</p>
              </div>
              <Button variant="ghost" size="sm" className="group gap-1" asChild>
                <Link href="/dashboard/deals">
                  View all
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2.5 font-medium">Voucher</th>
                    <th className="pb-2.5 font-medium">Customer</th>
                    <th className="pb-2.5 font-medium">Property</th>
                    <th className="pb-2.5 font-medium">Amount</th>
                    <th className="pb-2.5 font-medium">Status</th>
                    <th className="pb-2.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDeals.map((deal, i) => {
                    const name = customerName(deal.customerId);
                    return (
                      <motion.tr key={deal.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05 }} className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/50">
                        <td className="py-3 font-mono text-xs text-muted-foreground">{deal.voucherNo}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-gold/25 text-[10px] font-semibold text-primary">
                              {name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                            </span>
                            <span className="font-medium">{name}</span>
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground">{unitCode(deal.unitId)}</td>
                        <td className="py-3 font-medium tabular-nums">{formatPkr(deal.totalAmount)}</td>
                        <td className="py-3"><StatusBadge status={deal.status} /></td>
                        <td className="py-3 text-muted-foreground">{formatDate(deal.createdAt)}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SpotlightCard>

          {tier === "basic" && (
            <Card className="surface-hero sheen relative flex-row items-center justify-between gap-4 overflow-hidden border-0 p-6">
              <div className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 animate-float items-center justify-center rounded-xl bg-gold text-gold-foreground shadow-lg shadow-gold/30"><Crown className="size-5" /></span>
                <div>
                  <p className="font-heading text-base font-semibold">Unlock the CRM &amp; multi-account accounting</p>
                  <p className="text-xs text-white/65">Upgrade to Moderate to manage leads, staff payroll and full accounting statements.</p>
                </div>
              </div>
              <Button className="bg-gold text-gold-foreground hover:bg-gold/90" asChild><Link href="/dashboard/settings/billing">Upgrade plan</Link></Button>
            </Card>
          )}
        </>
      )}

      <NewBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-[34rem] rounded-xl xl:col-span-4" />
        <Skeleton className="h-[34rem] rounded-xl xl:col-span-8" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

/** A brand-new company has no data yet: show how to get going instead of a wall of zeros. */
function GettingStarted({ companyName, onBooking }: { companyName: string; onBooking: () => void }) {
  const steps = [
    { icon: FolderPlus, title: "Create your first project", text: "A housing scheme, tower or plot development.", href: "/dashboard/projects", done: false },
    { icon: Building2, title: "Add properties", text: "Plots, houses, apartments or shops with size and price.", href: "/dashboard/properties", done: false },
    { icon: Users2, title: "Add customers", text: "Buyers, investors and dealers in one address book.", href: "/dashboard/customers", done: false },
    { icon: Handshake, title: "Record a booking", text: "Reserve a property and set its installment plan.", onClick: onBooking, done: false },
    { icon: CalendarCheck, title: "Set up your budget", text: "Give each project a spending limit before money moves.", href: "/dashboard/budgets", done: false },
  ];
  return (
    <SpotlightCard className="p-6">
      <h2 className="font-heading text-xl font-semibold">Welcome to {companyName}</h2>
      <p className="mt-1 text-sm text-muted-foreground">This workspace is empty. Five steps and your dashboard comes alive with live collections, receivables, budgets and more.</p>
      <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((s, i) => {
          const inner = (
            <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110 group-hover:-rotate-6"><s.icon className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold"><span className="text-muted-foreground">{i + 1}.</span>{s.title}</span>
                <span className="block text-xs text-muted-foreground">{s.text}</span>
              </span>
              <CheckCircle2 className={cn("size-5 shrink-0", s.done ? "text-success" : "text-border")} />
            </>
          );
          const cls = "group flex items-center gap-3 rounded-xl border border-border/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-md";
          return (
            <motion.li key={s.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              {s.href ? <Link href={s.href} className={cls}>{inner}</Link> : <button type="button" onClick={s.onClick} className={cn(cls, "w-full")}>{inner}</button>}
            </motion.li>
          );
        })}
      </ol>
    </SpotlightCard>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-warning/15 text-warning border-warning/30",
    confirmed: "bg-primary/10 text-primary border-primary/30",
    completed: "bg-success/15 text-success border-success/30",
    cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return <Badge variant="outline" className={cn("capitalize", variants[status])}>{status}</Badge>;
}
