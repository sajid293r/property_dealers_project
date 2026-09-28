"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { buildChartOfAccounts, formatLedgerBalance, normalBalanceSide } from "@/lib/chart-of-accounts";
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

export function TrialBalanceTab() {
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

  // Only Assets/Liabilities/Equity leaves — Income and Expenses close to
  // Retained Earnings each period in this ledger, so including them here
  // would double-count the year's profit (it's already folded into Equity).
  const rows = React.useMemo(() => {
    const hasChildren = new Set(tree.filter((n) => n.parentId).map((n) => n.parentId!));
    return tree
      .filter(
        (n) =>
          !hasChildren.has(n.id) &&
          n.balance !== 0 &&
          (n.accountClass === "asset" || n.accountClass === "liability" || n.accountClass === "equity"),
      )
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [tree]);

  const totalDebit = rows.reduce((s, n) => (normalBalanceSide(n.accountClass) === "debit" ? s + n.balance : s), 0);
  const totalCredit = rows.reduce((s, n) => (normalBalanceSide(n.accountClass) === "credit" ? s + n.balance : s), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 1;

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total Debit" value={totalDebit} format={(n) => formatLedgerBalance(n)} icon={Scale} index={0} />
        <KpiCard label="Total Credit" value={totalCredit} format={(n) => formatLedgerBalance(n)} icon={Scale} index={1} accent="gold" />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 2 * 0.06 }}
          className={cn(
            "flex items-center gap-3 rounded-xl border p-4 shadow-sm",
            balanced ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
          )}
        >
          <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", balanced ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
            {balanced ? <CheckCircle2 className="size-4.5" /> : <AlertTriangle className="size-4.5" />}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Balance check</p>
            <p className="mt-0.5 text-sm font-semibold">{balanced ? "Debit = Credit" : "Out of balance"}</p>
          </div>
        </motion.div>
      </div>

      <Card className="p-5">
        <div className="mb-4">
          <h3 className="font-heading text-base font-semibold">Trial Balance</h3>
          <p className="text-xs text-muted-foreground">
            Balance-sheet accounts only — income and expenses close to Retained Earnings each period.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Code</th>
                <th className="pb-2.5 font-medium">Account</th>
                <th className="pb-2.5 pr-3 text-right font-medium">Debit</th>
                <th className="pb-2.5 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n, i) => {
                const side = normalBalanceSide(n.accountClass);
                return (
                  <motion.tr
                    key={n.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i, 14) * 0.02 }}
                    className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                  >
                    <td className="py-2 font-mono text-xs text-muted-foreground">{n.code}</td>
                    <td className="py-2 font-medium">{n.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{side === "debit" ? formatLedgerBalance(n.balance) : "—"}</td>
                    <td className="py-2 text-right tabular-nums">{side === "credit" ? formatLedgerBalance(n.balance) : "—"}</td>
                  </motion.tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td colSpan={2} className="py-2.5 font-semibold">Total</td>
                <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">{formatLedgerBalance(totalDebit)}</td>
                <td className="py-2.5 text-right tabular-nums font-semibold">{formatLedgerBalance(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
