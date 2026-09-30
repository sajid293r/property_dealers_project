"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSelect } from "@/components/vouchers/account-select";
import { VoucherTypeBadge } from "@/components/vouchers/voucher-type-badge";
import { useAccounts, useVouchers } from "@/lib/hooks/use-data";
import { chartLeafAccounts, buildAccountLedger, formatLedgerBalance } from "@/lib/chart-of-accounts";
import { formatDate, formatPkr } from "@/lib/format";
import { cn } from "@/lib/utils";

export function LedgerTab() {
  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: vouchers, isLoading: vouchersLoading } = useVouchers();
  const isLoading = accountsLoading || vouchersLoading;

  const [accountId, setAccountId] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  const leafAccounts = React.useMemo(() => chartLeafAccounts(accounts ?? []), [accounts]);
  const account = leafAccounts.find((a) => a.id === accountId);

  const fullLedger = React.useMemo(() => {
    if (!account || !vouchers) return [];
    return buildAccountLedger(vouchers, account.id, account.accountClass);
  }, [vouchers, account]);

  const openingBalance = React.useMemo(() => {
    if (!startDate) return 0;
    const before = fullLedger.filter((e) => e.date < startDate);
    return before.length > 0 ? before[before.length - 1].balance : 0;
  }, [fullLedger, startDate]);

  const displayed = fullLedger.filter((e) => (!startDate || e.date >= startDate) && (!endDate || e.date <= endDate));
  const totalDebit = displayed.reduce((s, e) => s + e.debit, 0);
  const totalCredit = displayed.reduce((s, e) => s + e.credit, 0);
  const closingBalance = displayed.length > 0 ? displayed[displayed.length - 1].balance : openingBalance;

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Account</Label>
            <AccountSelect accounts={leafAccounts} value={accountId} onChange={setAccountId} />
          </div>
          <div>
            <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 text-xs font-medium text-muted-foreground">End date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </Card>

      {!account ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Select an account above to see its posted transaction history.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={Wallet} label="Opening Balance" value={formatLedgerBalance(openingBalance)} />
            <StatTile icon={ArrowUpFromLine} label="Total Debit" value={formatPkr(totalDebit, { compact: true })} accent="destructive" />
            <StatTile icon={ArrowDownToLine} label="Total Credit" value={formatPkr(totalCredit, { compact: true })} accent="success" />
            <StatTile icon={Landmark} label="Closing Balance" value={formatLedgerBalance(closingBalance)} accent="gold" />
          </div>

          <Card className="p-5">
            <h3 className="mb-4 font-heading text-base font-semibold">
              {account.code} — {account.name}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="pb-2.5 font-medium">Date</th>
                    <th className="pb-2.5 font-medium">Voucher</th>
                    <th className="pb-2.5 font-medium">Description</th>
                    <th className="pb-2.5 pr-3 text-right font-medium">Debit</th>
                    <th className="pb-2.5 pr-3 text-right font-medium">Credit</th>
                    <th className="pb-2.5 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/40 bg-muted/30">
                    <td colSpan={5} className="py-2 font-medium text-muted-foreground">Opening balance</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatLedgerBalance(openingBalance)}</td>
                  </tr>
                  {displayed.map((e, i) => (
                    <motion.tr
                      key={`${e.voucherId}-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 12) * 0.02 }}
                      className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                    >
                      <td className="py-2.5 text-muted-foreground">{formatDate(e.date)}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <VoucherTypeBadge type={e.voucherType} />
                          <span className="font-mono text-xs">{e.voucherNumber}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{e.description}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{e.debit ? formatPkr(e.debit) : "—"}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{e.credit ? formatPkr(e.credit) : "—"}</td>
                      <td className={cn("py-2.5 text-right tabular-nums font-medium", e.balance < 0 && "text-destructive")}>
                        {formatLedgerBalance(e.balance)}
                      </td>
                    </motion.tr>
                  ))}
                  {displayed.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No posted vouchers for this account in the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td colSpan={3} className="py-2.5 font-semibold">Closing balance</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">{formatPkr(totalDebit)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">{formatPkr(totalCredit)}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold">{formatLedgerBalance(closingBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: "primary" | "success" | "destructive" | "gold";
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    destructive: "bg-destructive/10 text-destructive",
    gold: "bg-gold/15 text-gold",
  }[accent];

  return (
    <Card className="group/stat flex-row items-center gap-3 p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:ring-gold/40">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover/stat:-rotate-6 group-hover/stat:scale-110 ${accentClasses}`}>
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0">
        <p className="font-heading text-lg font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
