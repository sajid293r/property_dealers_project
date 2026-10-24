"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BookOpen, Landmark, Plus, Scale, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { StatTile } from "@/components/live/stat-tile";
import { BankAccountDialog } from "@/components/live/bank-account-dialog";
import { AccountDialog } from "@/components/live/account-dialog";
import { AccountLedgerSheet } from "@/components/live/account-ledger-sheet";
import { useCompany } from "@/lib/providers/company-provider";
import { useBankAccounts, useChartAccounts, usePermissions } from "@/lib/hooks/use-live";
import { num, trialBalance } from "@/lib/api/finance";
import { fiscalYearOf, todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";

const CLASS_LABEL = { asset: "Assets", liability: "Liabilities", equity: "Capital", income: "Income", expense: "Expenses" } as const;

export function LiveAccounts() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const banks = useBankAccounts();
  const accounts = useChartAccounts();
  const [bankDialog, setBankDialog] = React.useState(false);
  const [accountDialog, setAccountDialog] = React.useState(false);
  const [ledger, setLedger] = React.useState<{ id: string; title: string } | null>(null);
  const [search, setSearch] = React.useState("");

  // balances come from the trial balance for "everything up to today"
  const tb = useQuery({
    queryKey: ["live", "trial-balance", "to-date"],
    queryFn: () => trialBalance(company.id, "2000-01-01", todayIso()),
    staleTime: 20_000,
  });
  const balanceById = React.useMemo(() => new Map((tb.data?.rows ?? []).map((r) => [r.id, r.closing])), [tb.data]);

  const bankTotal = (banks.data ?? []).reduce((s, b) => s + num(b.bookBalance), 0);
  const cashAccount = (accounts.data ?? []).find((a) => a.category === "asset_cash" && !a.isGroup);
  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (accounts.data ?? []).filter((a) => a.active && (!q || a.name.toLowerCase().includes(q) || a.code.includes(q)));
  }, [accounts.data, search]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={Landmark}
        eyebrow="Finance"
        title="Accounts"
        description="Your bank accounts and the chart of accounts, straight from the ledger"
        actions={
          <div className="flex flex-wrap gap-2">
            {can("accounts.create") && (
              <>
                <Button variant="outline" className="gap-1.5" onClick={() => setAccountDialog(true)}><BookOpen className="size-4" /> New account</Button>
                <Button className="gap-1.5" onClick={() => setBankDialog(true)}><Plus className="size-4" /> Add bank account</Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Landmark} label="Bank accounts" value={(banks.data ?? []).length} />
        <StatTile icon={Wallet} label="Money in banks" value={formatMoney(bankTotal, { compact: true })} accent="success" />
        <StatTile icon={Scale} label="Cash in hand" value={cashAccount ? formatMoney(balanceById.get(cashAccount.id) ?? 0, { compact: true }) : "—"} accent="gold" />
      </div>

      <Tabs defaultValue="banks">
        <TabsList>
          <TabsTrigger value="banks">Bank accounts</TabsTrigger>
          <TabsTrigger value="chart">Chart of accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="banks" className="mt-4">
          {banks.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
          ) : (banks.data ?? []).length === 0 ? (
            <Card className="p-10 text-center">
              <Landmark className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No bank accounts yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Add the company’s accounts to record bank payments, receipts and reconcile statements.</p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(banks.data ?? []).map((b, i) => (
                <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="h-full space-y-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-heading text-base font-semibold">{b.bankName}</p>
                        <p className="truncate text-xs text-muted-foreground">{b.accountTitle}{b.branchName ? ` · ${b.branchName}` : ""}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 font-mono text-[10.5px]">{b.glCode}</Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{b.accountNo}{b.iban ? ` · ${b.iban}` : ""}</p>
                    <div>
                      <p className="text-xs text-muted-foreground">Book balance</p>
                      <p className="break-words font-heading text-xl font-semibold tabular-nums">{formatMoney(num(b.bookBalance))}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {b.unclearedCount} uncleared · {b.lastReconciledOn ? `reconciled ${formatDate(b.lastReconciledOn)}` : "never reconciled"}
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => setLedger({ id: b.glAccountId, title: `${b.bankName} · ${b.accountNo}` })}>Transactions</Button>
                      <Button size="sm" variant="outline" asChild><Link href={`/dashboard/bank-reconciliation?account=${b.id}`}>Reconcile</Link></Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chart" className="mt-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <DataTableSearch value={search} onChange={setSearch} placeholder="Search name or code…" />
              <span className="text-xs text-muted-foreground">{rows.length} accounts</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Code</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 pr-3 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.isLoading
                    ? Array.from({ length: 8 }).map((_, i) => <tr key={i}><td colSpan={4} className="py-1.5"><Skeleton className="h-7 w-full" /></td></tr>)
                    : rows.map((a) => {
                        const depth = Math.max(0, a.code.split(".").length - 1);
                        const bal = balanceById.get(a.id);
                        return (
                          <tr
                            key={a.id}
                            className={`border-b border-border/40 last:border-0 ${a.isGroup ? "bg-secondary/30 font-medium" : "cursor-pointer hover:bg-secondary/40"}`}
                            onClick={() => !a.isGroup && setLedger({ id: a.id, title: `${a.code} · ${a.name}` })}
                          >
                            <td className="whitespace-nowrap py-2 font-mono text-xs text-muted-foreground">{a.code}</td>
                            <td className="py-2" style={{ paddingLeft: depth * 12 }}>{a.name}</td>
                            <td className="py-2 text-muted-foreground">{CLASS_LABEL[a.class]}</td>
                            <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums">{bal !== undefined && bal !== 0 ? formatMoney(bal) : ""}</td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Financial year {fiscalYearOf(todayIso()).name}. Click an account to see its transactions.</p>
          </Card>
        </TabsContent>
      </Tabs>

      <BankAccountDialog open={bankDialog} onOpenChange={setBankDialog} />
      <AccountDialog open={accountDialog} onOpenChange={setAccountDialog} />
      <AccountLedgerSheet accountId={ledger?.id ?? null} title={ledger?.title ?? ""} onClose={() => setLedger(null)} />
    </div>
  );
}
