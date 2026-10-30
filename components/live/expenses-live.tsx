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
import { useT } from "@/lib/i18n/provider";

/** What the business spent, listed straight from the ledger (so it always agrees with the profit-and-loss report). */
export function LiveExpenses() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const month = todayIso().slice(0, 7);
  const [from, setFrom] = React.useState(`${month}-01`);
  const [to, setTo] = React.useState(fiscalYearOf(todayIso()).to);
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
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
        eyebrow={t("nav.section.finance")}
        title={t("exp.title")}
        description={t("exp.description")}
        actions={
          can("accounts.create") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1.5"><Plus className="size-4" /> {t("exp.new")}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem asChild><Link href="/dashboard/vouchers/new?type=CPV">{t("exp.paidCash")}</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/dashboard/vouchers/new?type=BPV">{t("exp.paidBank")}</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/dashboard/vouchers/new?type=PIV">{t("exp.supplierInvoice")}</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={TrendingDown} label={t("exp.tile.spent")} value={formatMoney(total, { compact: true })} accent="warning" />
        <StatTile icon={Wallet} label={t("exp.tile.biggest")} value={top ? top.accountName : "—"} accent="gold" />
        <StatTile icon={ScrollText} label={t("exp.tile.entries")} value={q.data?.rows.length ?? 0} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("acc.ledger.from")} />
        <span className="text-sm text-muted-foreground">{t("acc.ledger.toWord")}</span>
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("acc.ledger.to")} />
        <DataTableSearch value={search} onChange={setSearch} placeholder={t("exp.search")} />
        <ExportButton name="expenses" headers={[t("common.date"), t("vch.csv.voucher"), t("exp.csv.accountCode"), t("vch.d.colAccount"), t("exp.csv.paidTo"), t("exp.csv.note"), t("common.amount")]} rows={(q.data?.rows ?? []).map((r) => [r.date, r.number, r.accountCode, r.accountName, r.partyName, r.description, num(r.amount)])} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                  <th className="pb-2.5 font-medium">{t("common.date")}</th>
                  <th className="pb-2.5 font-medium">{t("vch.d.colAccount")}</th>
                  <th className="pb-2.5 font-medium">{t("exp.col.paidTo")}</th>
                  <th className="pb-2.5 font-medium">{t("vch.col.voucher")}</th>
                  <th className="pb-2.5 pe-3 text-end font-medium">{t("common.amount")}</th>
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
                        <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{formatMoney(num(r.amount))}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!q.isLoading && (q.data?.rows ?? []).length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t("exp.empty")}</p>}
          </div>
        </Card>
        <Card className="h-fit p-5">
          <h3 className="mb-3 font-heading text-base font-semibold">{t("exp.byCategory")}</h3>
          <div className="space-y-2.5">
            {(q.data?.byAccount ?? []).slice(0, 10).map((a) => (
              <div key={a.accountId}>
                <div className="flex justify-between gap-3 text-sm"><span className="truncate">{a.accountName}</span><span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(num(a.amount), { compact: true })}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${total > 0 ? Math.max(2, (num(a.amount) / total) * 100) : 0}%` }} /></div>
              </div>
            ))}
            {(q.data?.byAccount ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("exp.nothingYet")}</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
