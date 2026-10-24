"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, Receipt, ScrollText, TrendingDown, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { StatTile } from "@/components/live/stat-tile";
import { useCompany } from "@/lib/providers/company-provider";
import { usePermissions } from "@/lib/hooks/use-live";
import { listExpenses, num } from "@/lib/api/finance";
import { fiscalYearOf, todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { ExportButton } from "@/components/live/export-button";

/** What the business spent, listed straight from the ledger (so it always agrees with the profit-and-loss report). */
export function LiveExpenses() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const month = todayIso().slice(0, 7);
  const [from, setFrom] = React.useState(`${month}-01`);
  const [to, setTo] = React.useState(fiscalYearOf(todayIso()).to);
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const q = useQuery({
    queryKey: ["live", "expenses", from, to, debounced],
    queryFn: () => listExpenses(company.id, { from, to, search: debounced || undefined }),
    enabled: !!from && !!to,
    staleTime: 15_000,
  });
  const total = num(q.data?.total);
  const top = q.data?.byAccount[0];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={Receipt}
        eyebrow="Finance"
        title="Expenses"
        description="Everything spent, from your approved payment vouchers and purchase invoices"
        actions={
          can("accounts.create") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1.5"><Plus className="size-4" /> New expense</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem asChild><Link href="/dashboard/vouchers/new?type=CPV">Paid in cash</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/dashboard/vouchers/new?type=BPV">Paid from a bank account</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/dashboard/vouchers/new?type=PIV">Supplier invoice (pay later)</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={TrendingDown} label="Spent in this period" value={formatMoney(total, { compact: true })} accent="warning" />
        <StatTile icon={Wallet} label="Biggest category" value={top ? top.accountName : "—"} accent="gold" />
        <StatTile icon={ScrollText} label="Entries" value={q.data?.rows.length ?? 0} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <span className="text-sm text-muted-foreground">to</span>
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <DataTableSearch value={search} onChange={setSearch} placeholder="Search account, supplier, note…" />
        <ExportButton name="expenses" headers={["Date", "Voucher", "Account code", "Account", "Paid to", "Note", "Amount"]} rows={(q.data?.rows ?? []).map((r) => [r.date, r.number, r.accountCode, r.accountName, r.partyName, r.description, num(r.amount)])} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="pb-2.5 font-medium">Date</th>
                  <th className="pb-2.5 font-medium">Account</th>
                  <th className="pb-2.5 font-medium">Paid to / note</th>
                  <th className="pb-2.5 font-medium">Voucher</th>
                  <th className="pb-2.5 pr-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading
                  ? Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={5} className="py-1.5"><Skeleton className="h-9 w-full" /></td></tr>)
                  : (q.data?.rows ?? []).map((r) => (
                      <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                        <td className="whitespace-nowrap py-2.5 text-muted-foreground">{formatDate(r.date)}</td>
                        <td className="py-2.5"><span className="font-mono text-xs text-muted-foreground">{r.accountCode}</span> {r.accountName}</td>
                        <td className="py-2.5"><p>{r.partyName ?? "—"}</p><p className="max-w-[260px] truncate text-xs text-muted-foreground">{r.description}</p></td>
                        <td className="py-2.5">
                          {r.sourceType === "voucher" && r.sourceId ? <Link href={`/dashboard/vouchers/${r.sourceId}`} className="font-mono text-primary hover:underline">{r.number}</Link> : <span className="font-mono">{r.number}</span>}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums">{formatMoney(num(r.amount))}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!q.isLoading && (q.data?.rows ?? []).length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No expenses in this period.</p>}
          </div>
        </Card>
        <Card className="h-fit p-5">
          <h3 className="mb-3 font-heading text-base font-semibold">By category</h3>
          <div className="space-y-2.5">
            {(q.data?.byAccount ?? []).slice(0, 10).map((a) => (
              <div key={a.accountId}>
                <div className="flex justify-between gap-3 text-sm"><span className="truncate">{a.accountName}</span><span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(num(a.amount), { compact: true })}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${total > 0 ? Math.max(2, (num(a.amount) / total) * 100) : 0}%` }} /></div>
              </div>
            ))}
            {(q.data?.byAccount ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
