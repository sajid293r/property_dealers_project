"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Building2, HandCoins, PlusCircle, TimerReset, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CollectionsChart } from "@/components/charts/collections-chart";
import { UnitStatusDonut } from "@/components/charts/unit-status-donut";
import { NewBookingDialog } from "@/components/dialogs/new-booking-dialog";
import { useUnits, useDeals, useCustomers } from "@/lib/hooks/use-data";
import { formatPkr, formatDate } from "@/lib/format";
import { usePlanTier } from "@/lib/providers/plan-provider";

export default function DashboardPage() {
  const { data: units, isLoading: unitsLoading } = useUnits();
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const { data: customers } = useCustomers();
  const { tier } = usePlanTier();
  const [bookingOpen, setBookingOpen] = React.useState(false);

  const isLoading = unitsLoading || dealsLoading;

  const availableUnits = units?.filter((u) => u.status === "available").length ?? 0;
  const totalCollections = deals?.reduce((sum, d) => sum + d.paidAmount, 0) ?? 0;
  const pendingInstallments =
    deals?.reduce(
      (sum, d) =>
        sum +
        d.installments.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0),
      0,
    ) ?? 0;
  const activeDeals = deals?.filter((d) => d.status === "confirmed" || d.status === "pending").length ?? 0;

  const recentDeals = [...(deals ?? [])]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6);

  const customerName = (id: string) => customers?.find((c) => c.id === id)?.name ?? "—";
  const unitTitle = (id: string) => units?.find((u) => u.id === id)?.code ?? "—";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h1 className="font-heading text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening across your projects today.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setBookingOpen(true)}>
          <PlusCircle className="size-4" />
          New Booking
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Available Units"
          value={availableUnits}
          format={(n) => n.toString()}
          icon={Building2}
          delta={4.2}
          index={0}
          href="/dashboard/inventory"
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
        />
        <KpiCard
          label="Pending Installments"
          value={pendingInstallments}
          format={(n) => formatPkr(n, { compact: true })}
          icon={TimerReset}
          delta={-3.1}
          index={2}
          href="/dashboard/deals"
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
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <CollectionsChart />
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-heading text-base font-semibold">Inventory status</h3>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <UnitStatusDonut units={units ?? []} />
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-base font-semibold">Recent bookings</h3>
            <p className="text-xs text-muted-foreground">Latest deals across all projects</p>
          </div>
          <Button variant="ghost" size="sm">View all</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
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
                      <td className="py-2.5" colSpan={6}><Skeleton className="h-5 w-full" /></td>
                    </tr>
                  ))
                : recentDeals.map((deal, i) => (
                    <motion.tr
                      key={deal.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-border/40 last:border-0 hover:bg-secondary/40"
                    >
                      <td className="py-2.5 font-mono text-xs text-muted-foreground">{deal.voucherNo}</td>
                      <td className="py-2.5 font-medium">{customerName(deal.customerId)}</td>
                      <td className="py-2.5 text-muted-foreground">{unitTitle(deal.unitId)}</td>
                      <td className="py-2.5 tabular-nums">{formatPkr(deal.totalAmount)}</td>
                      <td className="py-2.5">
                        <StatusBadge status={deal.status} />
                      </td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(deal.createdAt)}</td>
                    </motion.tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      {tier === "basic" && (
        <Card className="flex items-center justify-between gap-4 border-gold/40 bg-gold/5 p-5">
          <div>
            <p className="font-heading text-sm font-semibold">Unlock the CRM &amp; multi-account accounting</p>
            <p className="text-xs text-muted-foreground">
              Upgrade to Moderate to manage leads, staff payroll and full accounting statements.
            </p>
          </div>
          <Button variant="outline" className="border-gold/50 text-gold hover:bg-gold/10">
            Upgrade plan
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
    <Badge variant="outline" className={variants[status] ?? ""}>
      {status}
    </Badge>
  );
}
