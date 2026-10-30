"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/lib/providers/company-provider";
import { accountLedger, num } from "@/lib/api/finance";
import { fiscalYearOf, todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";

/** The running statement of one ledger account: every posted line, with a running balance. */
export function AccountLedgerSheet({ accountId, title, onClose }: { accountId: string | null; title: string; onClose: () => void }) {
  const t = useT();
  const { company } = useCompany();
  const fy = fiscalYearOf(todayIso());
  const [from, setFrom] = React.useState(fy.from);
  const [to, setTo] = React.useState(fy.to);
  const q = useQuery({
    queryKey: ["live", "ledger", accountId, from, to],
    queryFn: () => accountLedger(company.id, accountId!, from, to),
    enabled: !!accountId && !!from && !!to,
  });
  return (
    <Sheet open={!!accountId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{t("acc.ledger.description")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("acc.ledger.from")} />
            <span className="text-muted-foreground">{t("acc.ledger.toWord")}</span>
            <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("acc.ledger.to")} />
          </div>
          {q.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : q.data ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">{t("common.date")}</th>
                    <th className="pb-2 font-medium">{t("acc.ledger.colEntry")}</th>
                    <th className="pb-2 pe-2 text-end font-medium">{t("vch.d.colDebit")}</th>
                    <th className="pb-2 pe-2 text-end font-medium">{t("vch.d.colCredit")}</th>
                    <th className="pb-2 pe-2 text-end font-medium">{t("acc.col.balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/40 bg-secondary/40 text-xs">
                    <td className="py-1.5 ps-1" colSpan={4}>{t("acc.ledger.opening")}</td>
                    <td className="whitespace-nowrap py-1.5 pe-2 text-end font-mono tabular-nums">{formatMoney(num(q.data.openingBalance))}</td>
                  </tr>
                  {q.data.lines.map((l, i) => (
                    <tr key={`${l.entryId}-${i}`} className="border-b border-border/40 last:border-0">
                      <td className="whitespace-nowrap py-2 text-muted-foreground">{formatDate(l.date)}</td>
                      <td className="py-2">
                        {l.sourceType === "voucher" && l.sourceId ? (
                          <Link href={`/dashboard/vouchers/${l.sourceId}`} className="font-mono text-primary hover:underline">{l.number}</Link>
                        ) : (
                          <span className="font-mono">{l.number}</span>
                        )}
                        <p className="max-w-[240px] truncate text-xs text-muted-foreground">{[l.partyName, l.memo ?? l.description].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="whitespace-nowrap py-2 pe-2 text-end font-mono tabular-nums">{num(l.debit) ? formatMoney(num(l.debit)) : ""}</td>
                      <td className="whitespace-nowrap py-2 pe-2 text-end font-mono tabular-nums">{num(l.credit) ? formatMoney(num(l.credit)) : ""}</td>
                      <td className="whitespace-nowrap py-2 pe-2 text-end font-mono tabular-nums font-medium">{formatMoney(num(l.balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {q.data.lines.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("acc.ledger.empty")}</p>}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{q.error instanceof Error ? q.error.message : ""}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
