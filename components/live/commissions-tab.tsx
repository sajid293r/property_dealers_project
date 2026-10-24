"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "@/components/live/export-button";
import { useCompany } from "@/lib/providers/company-provider";
import { usePermissions } from "@/lib/hooks/use-live";
import { api } from "@/lib/api/client";
import { num } from "@/lib/api/finance";
import { formatDate, formatMoney } from "@/lib/format";

interface Res {
  rows: { id: string; commissionNo: string; bookingId: string; bookingNo: string; dealerId: string; dealerName: string; ratePct: string; amount: string; status: string; accruedOn: string }[];
  owed: { dealerId: string; owed: string }[];
}

/** What each dealer has earned and what is still unpaid. Commission is recorded on the booking; paying is a payment voucher. */
export function CommissionsTab() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const q = useQuery({ queryKey: ["live", "commissions"], queryFn: () => api<Res>("/v1/commissions", { companyId: company.id }), staleTime: 15_000 });
  const rows = q.data?.rows ?? [];
  const dealers = [...new Map(rows.map((r) => [r.dealerId, r.dealerName])).entries()].map(([id, name]) => ({
    id, name,
    earned: rows.filter((r) => r.dealerId === id && r.status === "accrued").reduce((s, r) => s + num(r.amount), 0),
    owed: num(q.data?.owed.find((o) => o.dealerId === id)?.owed),
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {dealers.map((d) => (
          <Card key={d.id} className="space-y-1 p-4">
            <p className="font-heading text-base font-semibold">{d.name}</p>
            <p className="text-sm text-muted-foreground">Earned {formatMoney(d.earned, { compact: true })}</p>
            <p className="text-sm">Still owed <span className="font-mono font-medium text-warning">{formatMoney(d.owed)}</span></p>
            {can("accounts.create") && d.owed > 0 && <Button size="sm" variant="outline" asChild><Link href="/dashboard/vouchers/new?type=BPV">Pay the dealer</Link></Button>}
          </Card>
        ))}
        {!q.isLoading && dealers.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">No commission yet. Choose a dealer when you book a property, then record the commission on the booking.</Card>}
      </div>
      <Card className="p-4">
        <div className="mb-3 flex justify-end"><ExportButton name="commissions" headers={["Commission", "Date", "Dealer", "Booking", "Rate %", "Amount", "Status"]} rows={rows.map((r) => [r.commissionNo, r.accruedOn, r.dealerName, r.bookingNo, num(r.ratePct), num(r.amount), r.status])} /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border/70 text-left text-xs text-muted-foreground"><th className="pb-2.5 font-medium">Commission</th><th className="pb-2.5 font-medium">Dealer</th><th className="pb-2.5 font-medium">Booking</th><th className="pb-2.5 font-medium">Rate</th><th className="pb-2.5 pr-3 text-right font-medium">Amount</th><th className="pb-2.5 font-medium">Status</th></tr></thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 3 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-9 w-full" /></td></tr>) : rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5"><p className="font-mono">{r.commissionNo}</p><p className="text-xs text-muted-foreground">{formatDate(r.accruedOn)}</p></td>
                  <td className="py-2.5">{r.dealerName}</td>
                  <td className="py-2.5"><Link href={`/dashboard/deals/${r.bookingId}`} className="font-mono text-primary hover:underline">{r.bookingNo}</Link></td>
                  <td className="py-2.5">{num(r.ratePct)}%</td>
                  <td className={`whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums ${r.status === "void" ? "text-muted-foreground line-through" : ""}`}>{formatMoney(num(r.amount))}</td>
                  <td className="py-2.5 capitalize">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
