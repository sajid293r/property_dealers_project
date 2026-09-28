"use client";

import * as React from "react";
import { Landmark, TrendingDown, TrendingUp } from "lucide-react";
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

export function ProfitLossTab() {
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
  const totalIncome = byId.get("04")?.balance ?? 0;
  const totalExpense = byId.get("05")?.balance ?? 0;
  const netProfit = totalIncome - totalExpense;

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total Income" value={totalIncome} format={(n) => formatLedgerBalance(n)} icon={TrendingUp} index={0} />
        <KpiCard label="Total Expenses" value={totalExpense} format={(n) => formatLedgerBalance(n)} icon={TrendingDown} index={1} />
        <KpiCard
          label={netProfit >= 0 ? "Net Profit" : "Net Loss"}
          value={netProfit}
          format={(n) => `${n < 0 ? "-" : ""}${formatLedgerBalance(n)}`}
          icon={Landmark}
          index={2}
          accent={netProfit >= 0 ? "gold" : "primary"}
        />
      </div>

      <Card className="p-5">
        <h3 className="mb-4 font-heading text-base font-semibold">Profit &amp; Loss</h3>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-heading font-semibold">Income</p>
            <AccountStatementTree nodes={tree} rootId="04" />
            <div className="mt-1 flex items-center justify-between border-t-2 border-border pt-2 font-semibold">
              <span>Total Income</span>
              <span className="tabular-nums">{formatLedgerBalance(totalIncome)}</span>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-heading font-semibold">Expenses</p>
            <AccountStatementTree nodes={tree} rootId="05" />
            <div className="mt-1 flex items-center justify-between border-t-2 border-border pt-2 font-semibold">
              <span>Total Expenses</span>
              <span className="tabular-nums">{formatLedgerBalance(totalExpense)}</span>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "mt-5 flex items-center justify-between rounded-lg px-4 py-3 font-semibold",
            netProfit >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          <span>Net Profit</span>
          <span className="tabular-nums">{netProfit < 0 ? "-" : ""}{formatLedgerBalance(netProfit)}</span>
        </div>
      </Card>
    </div>
  );
}
