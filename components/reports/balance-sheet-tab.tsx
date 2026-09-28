"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Landmark, Scale, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AccountStatementTree } from "@/components/reports/account-statement-tree";
import { buildChartOfAccounts, formatLedgerBalance } from "@/lib/chart-of-accounts";
import {
  useAccounts,
  useContracts,
  useCustomers,
  useExpenses,
  useStaff,
  useTransactions,
  useUnits,
} from "@/lib/hooks/use-data";
import { cn } from "@/lib/utils";

export function BalanceSheetTab() {
  const { data: units, isLoading: l1 } = useUnits();
  const { data: customers, isLoading: l2 } = useCustomers();
  const { data: staff, isLoading: l3 } = useStaff();
  const { data: accounts, isLoading: l4 } = useAccounts();
  const { data: transactions, isLoading: l5 } = useTransactions();
  const { data: expenses, isLoading: l6 } = useExpenses();
  const { data: contracts, isLoading: l7 } = useContracts();
  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

  const tree = React.useMemo(() => {
    if (isLoading) return [];
    return buildChartOfAccounts({
      units: units ?? [],
      customers: customers ?? [],
      staff: staff ?? [],
      accounts: accounts ?? [],
      transactions: transactions ?? [],
      expenses: expenses ?? [],
      contracts: contracts ?? [],
    });
  }, [isLoading, units, customers, staff, accounts, transactions, expenses, contracts]);

  const byId = new Map(tree.map((n) => [n.id, n]));
  const totalAssets = byId.get("03")?.balance ?? 0;
  const totalLiabilities = byId.get("02")?.balance ?? 0;
  const totalEquity = byId.get("01")?.balance ?? 0;
  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;
  const today = new Date().toISOString().slice(0, 10);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total Assets" value={totalAssets} format={(n) => formatLedgerBalance(n)} icon={Landmark} index={0} />
        <KpiCard label="Total Liabilities" value={totalLiabilities} format={(n) => formatLedgerBalance(n)} icon={Scale} index={1} />
        <KpiCard label="Total Equity" value={totalEquity} format={(n) => formatLedgerBalance(n)} icon={TrendingUp} index={2} accent="gold" />
      </div>

      <Card className="space-y-1 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-base font-semibold">Balance Sheet</h3>
            <p className="text-xs text-muted-foreground">As of {new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(today))}</p>
          </div>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              balanced ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            {balanced ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            {balanced ? "Balanced" : "Out of balance"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-heading font-semibold">Assets</p>
            <AccountStatementTree nodes={tree} rootId="03" />
            <div className="mt-1 flex items-center justify-between border-t-2 border-border pt-2 font-semibold">
              <span>Total Assets</span>
              <span className="tabular-nums">{formatLedgerBalance(totalAssets)}</span>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-1.5 text-sm font-heading font-semibold">Liabilities</p>
              <AccountStatementTree nodes={tree} rootId="02" />
              <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-2 font-medium">
                <span>Total Liabilities</span>
                <span className="tabular-nums">{formatLedgerBalance(totalLiabilities)}</span>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-heading font-semibold">Equity</p>
              <AccountStatementTree nodes={tree} rootId="01" />
              <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-2 font-medium">
                <span>Total Equity</span>
                <span className="tabular-nums">{formatLedgerBalance(totalEquity)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between border-t-2 border-border pt-2 font-semibold">
              <span>Total Liabilities &amp; Equity</span>
              <span className="tabular-nums">{formatLedgerBalance(totalLiabilities + totalEquity)}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
