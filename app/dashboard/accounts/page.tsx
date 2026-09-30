"use client";

import { Landmark as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AnimatedNumber } from "@/components/animated-number";
import * as React from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, CheckCircle2, Landmark, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TransferPaymentDialog } from "@/components/dialogs/transfer-payment-dialog";
import { ChartOfAccountsView } from "@/components/accounts/chart-of-accounts-view";
import { useAccounts, useTransactions } from "@/lib/hooks/use-data";
import { formatPkr, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AccountsPage() {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: transactions, isLoading: txLoading } = useTransactions();
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [accountFilter, setAccountFilter] = React.useState<string | null>(null);

  const unconfirmedCount = transactions?.filter((t) => !t.confirmed).length ?? 0;
  const filteredTransactions = accountFilter
    ? transactions?.filter((t) => t.accountId === accountFilter)
    : transactions;
  const filterAccount = accounts?.find((a) => a.id === accountFilter);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="Finance"
        title="Accounts"
        description="Cash, bank and petty cash books"
        actions={<>
        <Button variant="outline" className="gap-1.5" onClick={() => setTransferOpen(true)}>
          <ArrowLeftRight className="size-4" />
          Transfer Payment
        </Button>
        </>}
      />

      <Tabs defaultValue="cashbank">
        <TabsList>
          <TabsTrigger value="cashbank">Cash & Bank</TabsTrigger>
          <TabsTrigger value="coa">Chart of Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="cashbank" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {accountsLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
              : accounts?.map((acc, i) => {
                  const active = acc.id === accountFilter;
                  return (
                    <motion.button
                      key={acc.id}
                      type="button"
                      onClick={() => setAccountFilter(active ? null : acc.id)}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.4 }}
                      className="text-left"
                    >
                      <div
                        className={cn(
                          "group relative isolate h-40 overflow-hidden rounded-2xl p-5 text-white shadow-lg transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl",
                          acc.type === "bank"
                            ? "bg-[linear-gradient(135deg,oklch(0.3_0.06_162),oklch(0.18_0.03_158))] shadow-primary/25"
                            : "bg-[linear-gradient(135deg,oklch(0.55_0.12_78),oklch(0.34_0.07_70))] shadow-gold/25",
                          active && "ring-2 ring-gold ring-offset-2 ring-offset-background",
                        )}
                      >
                        <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full border-[18px] border-white/[0.06] transition-transform duration-500 group-hover:scale-110" />
                        <div className="pointer-events-none absolute -bottom-16 right-6 size-40 rounded-full bg-white/[0.06]" />
                        <div className="pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent transition-all duration-700 group-hover:left-[130%]" />
                        <div className="relative flex items-center justify-between">
                          <div className="flex h-7 w-10 items-center justify-center rounded-md bg-gradient-to-br from-[oklch(0.9_0.1_88)] to-[oklch(0.7_0.12_75)] shadow-inner">
                            {acc.type === "bank" ? <Landmark className="size-3.5 text-[oklch(0.35_0.06_75)]" /> : <Wallet className="size-3.5 text-[oklch(0.35_0.06_75)]" />}
                          </div>
                          <span className="font-mono text-[11px] tracking-widest text-white/60">{acc.code}</span>
                        </div>
                        <p className="relative mt-4 text-xs text-white/65">{acc.title}</p>
                        <AnimatedNumber
                          value={acc.balance}
                          format={(n) => formatPkr(n)}
                          className="relative mt-0.5 block font-heading text-2xl font-semibold tabular-nums"
                        />
                        <p className="relative mt-1.5 text-[10px] uppercase tracking-[0.18em] text-white/45">
                          {active ? "Filtering transactions" : "Click to filter"}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
          </div>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-heading text-base font-semibold">Transactions</h3>
                <p className="text-xs text-muted-foreground">
                  {filterAccount
                    ? `Showing ${filterAccount.title} only`
                    : unconfirmedCount > 0
                      ? `${unconfirmedCount} transactions awaiting confirmation`
                      : "All transactions confirmed"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {filterAccount && (
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setAccountFilter(null)}>
                    <X className="size-3.5" />
                    Clear filter
                  </Button>
                )}
                {unconfirmedCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => toast.success(`${unconfirmedCount} transactions confirmed`)}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Confirm all
                  </Button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="pb-2.5 font-medium">Title</th>
                    <th className="pb-2.5 font-medium">Category</th>
                    <th className="pb-2.5 font-medium">Type</th>
                    <th className="pb-2.5 font-medium">Amount</th>
                    <th className="pb-2.5 font-medium">Date</th>
                    <th className="pb-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {txLoading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/40">
                          <td colSpan={6} className="py-2.5"><Skeleton className="h-8 w-full" /></td>
                        </tr>
                      ))
                    : filteredTransactions?.slice(0, 20).map((t, i) => (
                        <motion.tr
                          key={t.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: Math.min(i, 10) * 0.03 }}
                          className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                        >
                          <td className="py-2.5 font-medium">{t.title}</td>
                          <td className="py-2.5 text-muted-foreground">{t.category}</td>
                          <td className="py-2.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize",
                                t.kind === "credit"
                                  ? "bg-success/15 text-success border-success/30"
                                  : "bg-destructive/10 text-destructive border-destructive/30",
                              )}
                            >
                              {t.kind}
                            </Badge>
                          </td>
                          <td className="py-2.5 tabular-nums font-medium">{formatPkr(t.amount)}</td>
                          <td className="py-2.5 text-muted-foreground">{formatDate(t.date)}</td>
                          <td className="py-2.5">
                            {t.confirmed ? (
                              <span className="text-xs text-muted-foreground">Confirmed</span>
                            ) : (
                              <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
                                Pending
                              </Badge>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                  {!txLoading && filteredTransactions?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No transactions for this account yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="coa" className="mt-5">
          <ChartOfAccountsView />
        </TabsContent>
      </Tabs>

      <TransferPaymentDialog open={transferOpen} onOpenChange={setTransferOpen} />
    </div>
  );
}
