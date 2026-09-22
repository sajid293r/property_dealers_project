"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Download,
  Landmark,
  TrendingUp,
  TrendingDown,
  Handshake,
  Building2,
  HandCoins,
  Receipt,
  CheckCircle2,
  TimerReset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { UnitStatusDonut } from "@/components/charts/unit-status-donut";
import { useTransactions, useDeals, useUnits, useExpenses } from "@/lib/hooks/use-data";
import { formatPkr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Income statements, profit reports and exportable financial statements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => toast.success("CSV export queued")}>
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => toast.success("PDF export queued")}>
            <FileText className="size-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="income">
        <TabsList>
          <TabsTrigger value="income">Income Statement</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="income" className="mt-5">
          <IncomeStatementTab />
        </TabsContent>
        <TabsContent value="sales" className="mt-5">
          <SalesTab />
        </TabsContent>
        <TabsContent value="stock" className="mt-5">
          <StockTab />
        </TabsContent>
        <TabsContent value="expenses" className="mt-5">
          <ExpensesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabSection({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {children}
    </motion.div>
  );
}

function IncomeStatementTab() {
  const { data: transactions, isLoading } = useTransactions();

  const byCategory = React.useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    (transactions ?? []).forEach((t) => {
      const entry = map.get(t.category) ?? { income: 0, expense: 0 };
      if (t.kind === "credit") entry.income += t.amount;
      else entry.expense += t.amount;
      map.set(t.category, entry);
    });
    return Array.from(map.entries())
      .map(([category, v]) => ({ category, ...v, net: v.income - v.expense }))
      .sort((a, b) => b.income + b.expense - (a.income + a.expense));
  }, [transactions]);

  const revenue = byCategory.reduce((s, c) => s + c.income, 0);
  const expense = byCategory.reduce((s, c) => s + c.expense, 0);
  const net = revenue - expense;

  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;

  return (
    <TabSection>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total Revenue" value={revenue} format={(n) => formatPkr(n, { compact: true })} icon={TrendingUp} index={0} />
        <KpiCard label="Total Expenses" value={expense} format={(n) => formatPkr(n, { compact: true })} icon={TrendingDown} index={1} />
        <KpiCard label="Net Profit" value={net} format={(n) => formatPkr(n, { compact: true })} icon={Landmark} index={2} accent="gold" />
      </div>
      <Card className="p-5">
        <h3 className="mb-4 font-heading text-base font-semibold">By category</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Category</th>
                <th className="pb-2.5 font-medium">Income</th>
                <th className="pb-2.5 font-medium">Expense</th>
                <th className="pb-2.5 font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.category} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 font-medium">{c.category}</td>
                  <td className="py-2.5 tabular-nums text-success">{c.income > 0 ? formatPkr(c.income) : "—"}</td>
                  <td className="py-2.5 tabular-nums text-destructive">{c.expense > 0 ? formatPkr(c.expense) : "—"}</td>
                  <td className={cn("py-2.5 tabular-nums font-medium", c.net >= 0 ? "text-success" : "text-destructive")}>
                    {formatPkr(c.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td className="py-2.5 font-semibold">Total</td>
                <td className="py-2.5 tabular-nums font-semibold text-success">{formatPkr(revenue)}</td>
                <td className="py-2.5 tabular-nums font-semibold text-destructive">{formatPkr(expense)}</td>
                <td className={cn("py-2.5 tabular-nums font-semibold", net >= 0 ? "text-success" : "text-destructive")}>
                  {formatPkr(net)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </TabSection>
  );
}

function SalesTab() {
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const { data: units, isLoading: unitsLoading } = useUnits();
  const isLoading = dealsLoading || unitsLoading;

  const byProject = React.useMemo(() => {
    const map = new Map<string, { count: number; total: number; collected: number }>();
    (deals ?? []).forEach((d) => {
      const unit = units?.find((u) => u.id === d.unitId);
      const project = unit?.project ?? "Unknown";
      const entry = map.get(project) ?? { count: 0, total: 0, collected: 0 };
      entry.count += 1;
      entry.total += d.totalAmount;
      entry.collected += d.paidAmount;
      map.set(project, entry);
    });
    return Array.from(map.entries())
      .map(([project, v]) => ({ project, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [deals, units]);

  const totalBookings = deals?.length ?? 0;
  const totalValue = deals?.reduce((s, d) => s + d.totalAmount, 0) ?? 0;
  const totalCollected = deals?.reduce((s, d) => s + d.paidAmount, 0) ?? 0;
  const outstanding = totalValue - totalCollected;

  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;

  return (
    <TabSection>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Bookings" value={totalBookings} format={(n) => n.toString()} icon={Handshake} index={0} />
        <KpiCard label="Total Sales Value" value={totalValue} format={(n) => formatPkr(n, { compact: true })} icon={Building2} index={1} />
        <KpiCard label="Total Collected" value={totalCollected} format={(n) => formatPkr(n, { compact: true })} icon={HandCoins} index={2} accent="gold" />
        <KpiCard label="Outstanding" value={outstanding} format={(n) => formatPkr(n, { compact: true })} icon={TimerReset} index={3} />
      </div>
      <Card className="p-5">
        <h3 className="mb-4 font-heading text-base font-semibold">Sales by project</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Project</th>
                <th className="pb-2.5 font-medium">Bookings</th>
                <th className="pb-2.5 font-medium">Total Value</th>
                <th className="pb-2.5 font-medium">Collected</th>
              </tr>
            </thead>
            <tbody>
              {byProject.map((p) => (
                <tr key={p.project} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 font-medium">{p.project}</td>
                  <td className="py-2.5 tabular-nums text-muted-foreground">{p.count}</td>
                  <td className="py-2.5 tabular-nums font-medium">{formatPkr(p.total)}</td>
                  <td className="py-2.5 tabular-nums text-success">{formatPkr(p.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </TabSection>
  );
}

function StockTab() {
  const { data: units, isLoading } = useUnits();

  const byProject = React.useMemo(() => {
    const map = new Map<string, { total: number; available: number; reserved: number; sold: number; value: number }>();
    (units ?? []).forEach((u) => {
      const entry = map.get(u.project) ?? { total: 0, available: 0, reserved: 0, sold: 0, value: 0 };
      entry.total += 1;
      entry.value += u.price;
      if (u.status === "available") entry.available += 1;
      else if (u.status === "reserved") entry.reserved += 1;
      else entry.sold += 1;
      map.set(u.project, entry);
    });
    return Array.from(map.entries()).map(([project, v]) => ({ project, ...v }));
  }, [units]);

  const totalUnits = units?.length ?? 0;
  const totalValue = units?.reduce((s, u) => s + u.price, 0) ?? 0;
  const soldValue = units?.filter((u) => u.status === "sold").reduce((s, u) => s + u.price, 0) ?? 0;

  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;

  return (
    <TabSection>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Total Units" value={totalUnits} format={(n) => n.toString()} icon={Building2} index={0} />
            <KpiCard label="Total Inventory Value" value={totalValue} format={(n) => formatPkr(n, { compact: true })} icon={Landmark} index={1} />
            <KpiCard label="Sold Value" value={soldValue} format={(n) => formatPkr(n, { compact: true })} icon={CheckCircle2} index={2} accent="gold" />
          </div>
          <Card className="p-5">
            <h3 className="mb-4 font-heading text-base font-semibold">Stock by project</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="pb-2.5 font-medium">Project</th>
                    <th className="pb-2.5 font-medium">Total</th>
                    <th className="pb-2.5 font-medium">Available</th>
                    <th className="pb-2.5 font-medium">Reserved</th>
                    <th className="pb-2.5 font-medium">Sold</th>
                    <th className="pb-2.5 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map((p) => (
                    <tr key={p.project} className="border-b border-border/40 last:border-0">
                      <td className="py-2.5 font-medium">{p.project}</td>
                      <td className="py-2.5 tabular-nums">{p.total}</td>
                      <td className="py-2.5 tabular-nums text-success">{p.available}</td>
                      <td className="py-2.5 tabular-nums text-warning">{p.reserved}</td>
                      <td className="py-2.5 tabular-nums text-muted-foreground">{p.sold}</td>
                      <td className="py-2.5 tabular-nums font-medium">{formatPkr(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <Card className="p-5">
          <h3 className="mb-3 font-heading text-base font-semibold">Overall status</h3>
          <UnitStatusDonut units={units ?? []} />
        </Card>
      </div>
    </TabSection>
  );
}

function ExpensesTab() {
  const { data: expenses, isLoading } = useExpenses();

  const byType = React.useMemo(() => {
    const map = new Map<string, { total: number; paid: number; unpaid: number; count: number }>();
    (expenses ?? []).forEach((e) => {
      const entry = map.get(e.type) ?? { total: 0, paid: 0, unpaid: 0, count: 0 };
      entry.total += e.amount;
      entry.count += 1;
      if (e.status === "paid") entry.paid += e.amount;
      else entry.unpaid += e.amount;
      map.set(e.type, entry);
    });
    return Array.from(map.entries())
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const total = expenses?.reduce((s, e) => s + e.amount, 0) ?? 0;
  const paid = expenses?.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount, 0) ?? 0;
  const unpaid = total - paid;

  if (isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;

  return (
    <TabSection>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total Expenses" value={total} format={(n) => formatPkr(n, { compact: true })} icon={Receipt} index={0} />
        <KpiCard label="Paid" value={paid} format={(n) => formatPkr(n, { compact: true })} icon={CheckCircle2} index={1} />
        <KpiCard label="Unpaid" value={unpaid} format={(n) => formatPkr(n, { compact: true })} icon={TimerReset} index={2} accent="gold" />
      </div>
      <Card className="p-5">
        <h3 className="mb-4 font-heading text-base font-semibold">By type</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Type</th>
                <th className="pb-2.5 font-medium">Count</th>
                <th className="pb-2.5 font-medium">Paid</th>
                <th className="pb-2.5 font-medium">Unpaid</th>
                <th className="pb-2.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {byType.map((t) => (
                <tr key={t.type} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 font-medium">{t.type}</td>
                  <td className="py-2.5 tabular-nums text-muted-foreground">{t.count}</td>
                  <td className="py-2.5 tabular-nums text-success">{t.paid > 0 ? formatPkr(t.paid) : "—"}</td>
                  <td className="py-2.5 tabular-nums text-warning">{t.unpaid > 0 ? formatPkr(t.unpaid) : "—"}</td>
                  <td className="py-2.5 tabular-nums font-medium">{formatPkr(t.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </TabSection>
  );
}
