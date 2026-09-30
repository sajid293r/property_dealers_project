"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Building2, Crown, HandCoins, TimerReset, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { HeroBanner } from "@/components/dashboard/hero-banner";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { SalesFunnel } from "@/components/dashboard/sales-funnel";
import { SpotlightCard } from "@/components/spotlight-card";
import { CollectionsChart } from "@/components/charts/collections-chart";
import { UnitStatusDonut } from "@/components/charts/unit-status-donut";
import { NewBookingDialog } from "@/components/dialogs/new-booking-dialog";
import { useUnits, useDeals, useCustomers, useLeads } from "@/lib/hooks/use-data";
import { monthlyCollections } from "@/lib/mock-data/trends";
import { formatPkr, formatDate } from "@/lib/format";
import { usePlanTier } from "@/lib/providers/plan-provider";
import { cn } from "@/lib/utils";

const TREND_COLLECTIONS = monthlyCollections.map((m) => m.collections);
const ANNUAL_TARGET_PCT_BASE = monthlyCollections.reduce((s, m) => s + m.target, 0);

export default function DashboardPage() {
  const router = useRouter();
  const { data: units, isLoading: unitsLoading } = useUnits();
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const { data: customers } = useCustomers();
  const { data: leads } = useLeads();
  const { tier } = usePlanTier();
  const [bookingOpen, setBookingOpen] = React.useState(false);

  const isLoading = unitsLoading || dealsLoading;

  const availableUnits = units?.filter((u) => u.status === "available").length ?? 0;
  const totalCollections = deals?.reduce((sum, d) => sum + d.paidAmount, 0) ?? 0;
  const pendingInstallments =
    deals?.reduce(
      (sum, d) =>
        sum + d.installments.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0),
      0,
    ) ?? 0;
  const activeDeals =
    deals?.filter((d) => d.status === "confirmed" || d.status === "pending").length ?? 0;

  const recentDeals = [...(deals ?? [])]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6);

  const customerName = (id: string) => customers?.find((c) => c.id === id)?.name ?? "—";
  const unitTitle = (id: string) => units?.find((u) => u.id === id)?.code ?? "—";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <HeroBanner
        collected={totalCollections}
        target={ANNUAL_TARGET_PCT_BASE}
        onNewBooking={() => setBookingOpen(true)}
        onNewLead={() => router.push("/dashboard/crm")}
        onNewVoucher={() => router.push("/dashboard/vouchers/new")}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Available Units"
          value={availableUnits}
          format={(n) => n.toString()}
          icon={Building2}
          delta={4.2}
          index={0}
          href="/dashboard/inventory"
          trend={[12, 14, 13, 16, 15, 18, 17, 20, 19, 22]}
        />
        <KpiCard
          label="Total Collections"
          value={totalCollections}
          format={(n) => formatPkr(n, { compact: true })}
          icon={HandCoins}
          delta={12.8}
          index={1}
          accent="gold"
          href="/dashboard/accounts"
          trend={TREND_COLLECTIONS}
        />
        <KpiCard
          label="Pending Installments"
          value={pendingInstallments}
          format={(n) => formatPkr(n, { compact: true })}
          icon={TimerReset}
          delta={-3.1}
          index={2}
          href="/dashboard/deals"
          trend={[30, 28, 31, 27, 26, 28, 24, 25, 22, 21]}
        />
        <KpiCard
          label="Active Deals"
          value={activeDeals}
          format={(n) => n.toString()}
          icon={TrendingUp}
          delta={7.5}
          index={3}
          accent="gold"
          href="/dashboard/deals"
          trend={[5, 6, 6, 8, 7, 9, 10, 9, 12, 13]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SpotlightCard className="p-5 xl:col-span-2">
          <CollectionsChart />
        </SpotlightCard>
        <SpotlightCard className="p-5">
          <h3 className="mb-3 font-heading text-base font-semibold">Inventory status</h3>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <UnitStatusDonut units={units ?? []} />
          )}
        </SpotlightCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SpotlightCard className="p-5">
          <ActivityFeed />
        </SpotlightCard>
        <SpotlightCard className="p-5">
          <SalesFunnel leads={leads ?? []} />
        </SpotlightCard>
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
                <th className="pb-2.5 font-medium">Unit</th>
                <th className="pb-2.5 font-medium">Amount</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-2.5" colSpan={6}>
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                : recentDeals.map((deal, i) => {
                    const name = customerName(deal.customerId);
                    return (
                      <motion.tr
                        key={deal.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                        className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/50"
                      >
                        <td className="py-3 font-mono text-xs text-muted-foreground">{deal.voucherNo}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-gold/25 text-[10px] font-semibold text-primary">
                              {name
                                .split(" ")
                                .map((p) => p[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                            <span className="font-medium">{name}</span>
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground">{unitTitle(deal.unitId)}</td>
                        <td className="py-3 tabular-nums font-medium">{formatPkr(deal.totalAmount)}</td>
                        <td className="py-3">
                          <StatusBadge status={deal.status} />
                        </td>
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
            <span className="flex size-11 shrink-0 animate-float items-center justify-center rounded-xl bg-gold text-gold-foreground shadow-lg shadow-gold/30">
              <Crown className="size-5" />
            </span>
            <div>
              <p className="font-heading text-base font-semibold">
                Unlock the CRM &amp; multi-account accounting
              </p>
              <p className="text-xs text-white/65">
                Upgrade to Moderate to manage leads, staff payroll and full accounting statements.
              </p>
            </div>
          </div>
          <Button className="bg-gold text-gold-foreground hover:bg-gold/90" asChild>
            <Link href="/dashboard/settings/billing">Upgrade plan</Link>
          </Button>
        </Card>
      )}

      <NewBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: "bg-warning/15 text-warning border-warning/30",
    confirmed: "bg-primary/10 text-primary border-primary/30",
    completed: "bg-success/15 text-success border-success/30",
    cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <Badge variant="outline" className={cn("capitalize", variants[status])}>
      {status}
    </Badge>
  );
}
