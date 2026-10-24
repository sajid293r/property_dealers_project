"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Handshake, HandCoins, Plus, Receipt, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { StatTile } from "@/components/live/stat-tile";
import { LiveBookingDialog } from "@/components/live/booking-dialog";
import { ReceiptDialog } from "@/components/live/receipt-dialog";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { CollectionsTab } from "@/components/live/collections-live";
import { CommissionsTab } from "@/components/live/commissions-tab";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { listBookings, listReceipts, voidReceipt, type BookingStatus } from "@/lib/api/sales";
import { num } from "@/lib/api/finance";
import { BOOKING_STATUS_CLASS, BOOKING_STATUS_LABEL, methodLabel } from "@/lib/live-sales";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { ExportButton } from "@/components/live/export-button";
import { PrintLink } from "@/components/live/print-button";

function StatusPill({ status }: { status: BookingStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BOOKING_STATUS_CLASS[status]}`}>{BOOKING_STATUS_LABEL[status]}</span>;
}

export function LiveDeals() {
  const router = useRouter();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [status, setStatus] = React.useState<"all" | BookingStatus>("all");
  const [search, setSearch] = React.useState("");
  const [booking, setBooking] = React.useState(false);
  const [receipt, setReceipt] = React.useState(false);
  const [voiding, setVoiding] = React.useState<{ id: string; no: string } | null>(null);

  const bookings = useQuery({ queryKey: ["live", "bookings", "all"], queryFn: () => listBookings(company.id), staleTime: 15_000 });
  const receipts = useQuery({ queryKey: ["live", "receipts"], queryFn: () => listReceipts(company.id), staleTime: 15_000 });

  const all = bookings.data ?? [];
  const live = all.filter((b) => b.status !== "cancelled");
  const value = live.reduce((s, b) => s + num(b.netPrice), 0);
  const collected = live.reduce((s, b) => s + num(b.paidAmount), 0);
  const overdue = live.reduce((s, b) => s + num(b.overdueAmount), 0);
  const q = search.trim().toLowerCase();
  const shown = all.filter((b) => (status === "all" || b.status === status) && (!q || `${b.bookingNo} ${b.customerName} ${b.propertyCode} ${b.propertyTitle} ${b.projectName ?? ""}`.toLowerCase().includes(q)));
  const shownReceipts = (receipts.data ?? []).filter((r) => !q || `${r.receiptNo} ${r.customerName} ${r.bookingNo ?? ""} ${r.instrumentRef ?? ""}`.toLowerCase().includes(q));

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={Handshake}
        eyebrow="Sales"
        title="Deals & Bookings"
        description={`${all.length} bookings · payment plans and customer receipts`}
        actions={
          <div className="flex flex-wrap gap-2">
            {can("deals.create") && <Button variant="outline" className="gap-1.5" onClick={() => setReceipt(true)}><HandCoins className="size-4" /> Receive payment</Button>}
            {can("deals.create") && <Button className="gap-1.5" onClick={() => setBooking(true)}><Plus className="size-4" /> New booking</Button>}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Handshake} label="Active bookings" value={live.length} />
        <StatTile icon={Wallet} label="Contract value" value={formatMoney(value, { compact: true })} accent="gold" />
        <StatTile icon={HandCoins} label="Collected" value={formatMoney(collected, { compact: true })} accent="success" />
        <StatTile icon={AlertTriangle} label="Overdue" value={formatMoney(overdue, { compact: true })} accent={overdue > 0 ? "warning" : "muted"} />
      </div>

      <Tabs defaultValue="bookings">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <TabsList>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="receipts">Receipts</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="commissions">Commissions</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder="Search booking, customer, property…" /><ExportButton label="Export bookings" name="bookings" headers={["Booking", "Date", "Customer", "Property", "Project", "Net price", "Paid", "Overdue", "Status"]} rows={shown.map((b) => [b.bookingNo, b.bookingDate, b.customerName, b.propertyCode, b.projectName, num(b.netPrice), num(b.paidAmount), num(b.overdueAmount), b.status])} /><ExportButton label="Export receipts" name="receipts" headers={["Receipt", "Date", "Customer", "Booking", "Method", "Reference", "Amount", "Status"]} rows={shownReceipts.map((r) => [r.receiptNo, r.receivedOn, r.customerName, r.bookingNo, r.method, r.instrumentRef, num(r.amount), r.status])} /></div>
        </div>

        <TabsContent value="bookings" className="mt-4">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(["all", "pending", "confirmed", "completed", "cancelled"] as const).map((s) => (
                <Button key={s} size="sm" variant={status === s ? "default" : "outline"} className="h-7 rounded-full px-3 text-xs" onClick={() => setStatus(s)}>
                  {s === "all" ? "All" : BOOKING_STATUS_LABEL[s]}
                </Button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="pb-2.5 font-medium">Booking</th>
                    <th className="pb-2.5 font-medium">Customer</th>
                    <th className="pb-2.5 font-medium">Property</th>
                    <th className="pb-2.5 pr-3 text-right font-medium">Price</th>
                    <th className="pb-2.5 font-medium">Paid</th>
                    <th className="pb-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.isLoading
                    ? Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-11 w-full" /></td></tr>)
                    : shown.map((b, i) => {
                        const pct = num(b.netPrice) > 0 ? Math.min(100, (num(b.paidAmount) / num(b.netPrice)) * 100) : 0;
                        return (
                          <motion.tr key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.025 }}
                            className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-secondary/40" onClick={() => router.push(`/dashboard/deals/${b.id}`)}>
                            <td className="py-2.5"><p className="font-mono font-medium">{b.bookingNo}</p><p className="text-xs text-muted-foreground">{formatDate(b.bookingDate)}</p></td>
                            <td className="py-2.5 font-medium">{b.customerName}</td>
                            <td className="py-2.5"><p>{b.propertyCode} · {b.propertyTitle}</p><p className="text-xs text-muted-foreground">{b.projectName ?? "—"}</p></td>
                            <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums">{formatMoney(num(b.netPrice))}</td>
                            <td className="min-w-[150px] py-2.5">
                              <Progress value={pct} className="h-1.5" />
                              <p className="mt-1 text-xs text-muted-foreground">{formatMoney(num(b.paidAmount), { compact: true })} of {formatMoney(num(b.netPrice), { compact: true })}
                                {num(b.overdueAmount) > 0 && <span className="ml-1 font-medium text-warning">· overdue</span>}</p>
                            </td>
                            <td className="py-2.5"><StatusPill status={b.status} /></td>
                          </motion.tr>
                        );
                      })}
                </tbody>
              </table>
              {!bookings.isLoading && shown.length === 0 && (
                <p className="py-12 text-center text-sm text-muted-foreground">{all.length === 0 ? "No bookings yet. Use “New booking” to sell your first property." : "No booking matches your filters."}</p>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="collections" className="mt-4"><CollectionsTab /></TabsContent>
        <TabsContent value="commissions" className="mt-4"><CommissionsTab /></TabsContent>

        <TabsContent value="receipts" className="mt-4">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="pb-2.5 font-medium">Receipt</th>
                    <th className="pb-2.5 font-medium">Customer</th>
                    <th className="pb-2.5 font-medium">Booking</th>
                    <th className="pb-2.5 font-medium">Paid by</th>
                    <th className="pb-2.5 pr-3 text-right font-medium">Amount</th>
                    <th className="pb-2.5 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.isLoading
                    ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-9 w-full" /></td></tr>)
                    : shownReceipts.map((r) => (
                        <tr key={r.id} className="border-b border-border/40 last:border-0">
                          <td className="py-2.5"><p className="font-mono font-medium">{r.receiptNo}</p><p className="text-xs text-muted-foreground">{formatDate(r.receivedOn)}</p></td>
                          <td className="py-2.5">{r.customerName}</td>
                          <td className="py-2.5">{r.bookingId ? <Link href={`/dashboard/deals/${r.bookingId}`} className="font-mono text-primary hover:underline">{r.bookingNo}</Link> : "—"}</td>
                          <td className="py-2.5"><p>{methodLabel(r.method)}</p><p className="text-xs text-muted-foreground">{[r.instrumentRef, r.depositAccountName].filter(Boolean).join(" · ")}</p></td>
                          <td className={`whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums ${r.status === "void" ? "text-muted-foreground line-through" : ""}`}>{formatMoney(num(r.amount))}</td>
                          <td className="py-2.5 text-right">
                            <PrintLink kind="receipt" id={r.id} iconOnly label="Print receipt" variant="ghost" />{r.status === "void" ? <Badge variant="outline">Void</Badge> : can("accounts.approve") && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setVoiding({ id: r.id, no: r.receiptNo })}>Void</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
              {!receipts.isLoading && shownReceipts.length === 0 && (
                <div className="py-12 text-center">
                  <Receipt className="mx-auto size-7 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">No receipts yet.</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <LiveBookingDialog open={booking} onOpenChange={setBooking} />
      <ReceiptDialog open={receipt} onOpenChange={setReceipt} />
      <ReasonDialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        icon={Ban}
        title={`Void ${voiding?.no ?? "receipt"}`}
        description="The entry in the books is reversed and the installments it paid become due again. Nothing is deleted."
        submitLabel="Void receipt"
        dateLabel="Reverse on"
        onSubmit={async (reason, date) => {
          await voidReceipt(company.id, voiding!.id, reason, date);
          await invalidate();
          toast.success(`${voiding!.no} voided`);
        }}
      />
    </div>
  );
}
