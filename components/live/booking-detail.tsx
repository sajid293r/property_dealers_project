"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Ban, CalendarClock, CheckCircle2, Handshake, HandCoins, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptDialog } from "@/components/live/receipt-dialog";
import { ScheduleDialog } from "@/components/live/schedule-dialog";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { BookingExtras } from "@/components/live/booking-extras";
import { AttachmentsButton } from "@/components/live/attachments";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { getBooking, listReceipts, setBookingStatus } from "@/lib/api/sales";
import { num } from "@/lib/api/finance";
import { BOOKING_STATUS_CLASS, BOOKING_STATUS_LABEL, INSTALLMENT_KIND_LABEL, INSTALLMENT_STATUS_CLASS, INSTALLMENT_STATUS_LABEL, methodLabel } from "@/lib/live-sales";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { PrintLink } from "@/components/live/print-button";

export function LiveBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [receipt, setReceipt] = React.useState(false);
  const [plan, setPlan] = React.useState(false);
  const [cancel, setCancel] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const q = useQuery({ queryKey: ["live", "booking", id], queryFn: () => getBooking(company.id, id), staleTime: 5_000 });
  const rec = useQuery({ queryKey: ["live", "receipts", "booking", id], queryFn: () => listReceipts(company.id, { bookingId: id }), staleTime: 5_000 });

  if (q.isLoading) return <div className="mx-auto max-w-[1200px] space-y-5"><Skeleton className="h-9 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  const b = q.data;
  if (!b) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <Link href="/dashboard/deals" className="text-sm text-muted-foreground hover:text-foreground">← Back to bookings</Link>
        <Card className="p-10 text-center text-sm text-muted-foreground">{q.error instanceof Error ? q.error.message : "This booking doesn't exist."}</Card>
      </div>
    );
  }

  const net = num(b.netPrice);
  const paid = num(b.paidAmount);
  const pct = net > 0 ? Math.min(100, (paid / net) * 100) : 0;
  const open = b.status !== "cancelled";
  const needsPlan = b.installments.length === 0 && open;
  const moves = b.nextSteps.filter((s) => s.to !== "cancelled" && (!s.requiredPermission || can(s.requiredPermission)));
  const canCancel = b.nextSteps.some((s) => s.to === "cancelled" && (!s.requiredPermission || can(s.requiredPermission)));

  async function move(to: "confirmed" | "completed") {
    setBusy(true);
    try {
      await setBookingStatus(company.id, id, to);
      await invalidate();
      toast.success(to === "confirmed" ? "Booking confirmed" : "Booking completed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={Handshake}
        back={{ href: "/dashboard/deals", label: "Deals & Bookings" }}
        title={b.bookingNo}
        badge={<span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BOOKING_STATUS_CLASS[b.status]}`}>{BOOKING_STATUS_LABEL[b.status]}</span>}
        description={`${b.customerName} · ${b.propertyCode} ${b.propertyTitle}${b.projectName ? ` · ${b.projectName}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <PrintLink kind="booking" id={id} label="Print plan" size="default" /><AttachmentsButton entityType="booking" entityId={id} title={`${b.bookingNo} — ${b.customerName}`} canEdit={can("deals.edit")} size="default" categories={["Agreement", "CNIC copy", "Payment proof", "Allotment letter", "Other"]} />{open && can("deals.create") && <Button variant="outline" className="gap-1.5" onClick={() => setReceipt(true)}><HandCoins className="size-4" /> Receive payment</Button>}
            {needsPlan && can("deals.edit") && <Button variant="outline" className="gap-1.5" onClick={() => setPlan(true)}><CalendarClock className="size-4" /> Set payment plan</Button>}
            {moves.map((m) => (
              <Button key={m.to} className="gap-1.5" disabled={busy} onClick={() => void move(m.to as "confirmed" | "completed")}>
                <CheckCircle2 className="size-4" /> {m.to === "confirmed" ? "Confirm booking" : "Mark completed"}
              </Button>
            ))}
            {canCancel && <Button variant="outline" className="gap-1.5 text-destructive" onClick={() => setCancel(true)}><Ban className="size-4" /> Cancel booking</Button>}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">Payment plan</h3>
            {b.installments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {b.paymentType === "cash" ? "A full-payment booking. Receive the payment when it arrives." : "No payment plan yet. Set one up to track installments and dues."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">What</th>
                      <th className="pb-2 font-medium">Due</th>
                      <th className="pb-2 pr-3 text-right font-medium">Amount</th>
                      <th className="pb-2 pr-3 text-right font-medium">Paid</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.installments.map((i) => {
                      const late = (i.status === "due" || i.status === "partial") && i.dueDate < todayIso();
                      return (
                        <tr key={i.id} className="border-b border-border/40 last:border-0">
                          <td className="py-2 text-muted-foreground">{i.seq}</td>
                          <td className="py-2">{INSTALLMENT_KIND_LABEL[i.kind] ?? i.kind}</td>
                          <td className={`py-2 ${late ? "font-medium text-warning" : "text-muted-foreground"}`}>{formatDate(i.dueDate)}{late && " · overdue"}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums">{formatMoney(num(i.amount))}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums">{num(i.paidAmount) ? formatMoney(num(i.paidAmount)) : ""}</td>
                          <td className="py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${INSTALLMENT_STATUS_CLASS[i.status]}`}>{INSTALLMENT_STATUS_LABEL[i.status]}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">Receipts</h3>
            {(rec.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No payment received yet.</p>
            ) : (
              <div className="space-y-2">
                {(rec.data ?? []).map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <div>
                      <p className="font-mono font-medium">{r.receiptNo} <span className="font-sans font-normal text-muted-foreground">· {formatDate(r.receivedOn)}</span></p>
                      <p className="text-xs text-muted-foreground">{[methodLabel(r.method), r.instrumentRef, r.depositAccountName].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex items-center gap-2"><p className={`whitespace-nowrap font-mono tabular-nums ${r.status === "void" ? "text-muted-foreground line-through" : "font-medium"}`}>{formatMoney(num(r.amount))}</p><PrintLink kind="receipt" id={r.id} iconOnly label="Print receipt" variant="ghost" /></div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <BookingExtras bookingId={id} status={b.status} customerId={b.customerId} />
        </div>

        <Card className="h-fit space-y-4 p-5">
          <div>
            <p className="text-xs text-muted-foreground">Customer pays</p>
            <p className="break-words font-heading text-2xl font-semibold tabular-nums">{formatMoney(net)}</p>
            {num(b.discount) > 0 && <p className="text-xs text-muted-foreground">after a discount of {formatMoney(num(b.discount))}</p>}
          </div>
          <div>
            <Progress value={pct} className="h-2" />
            <div className="mt-2 flex justify-between text-sm">
              <span className="flex items-center gap-1.5"><Wallet className="size-3.5 text-success" /> Paid</span>
              <span className="font-mono tabular-nums">{formatMoney(paid)}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Balance</span><span className="font-mono tabular-nums">{formatMoney(Math.max(net - paid, 0))}</span></div>
            {num(b.overdueAmount) > 0 && <div className="mt-1 flex justify-between text-sm font-medium text-warning"><span>Overdue</span><span className="font-mono tabular-nums">{formatMoney(num(b.overdueAmount))}</span></div>}
          </div>
          <div className="space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <p>Booked on {formatDate(b.bookingDate)}</p>
            <p>{b.paymentType === "cash" ? "Full payment" : "Installments"}</p>
            {b.nextDueDate && <p>Next due {formatDate(b.nextDueDate)}</p>}
            {b.cancelReason && <p className="text-destructive">Cancelled: {b.cancelReason}</p>}
          </div>
        </Card>
      </div>

      <ReceiptDialog open={receipt} onOpenChange={setReceipt} bookingId={id} />
      <ScheduleDialog open={plan} onOpenChange={setPlan} bookingId={id} netPrice={net} />
      <ReasonDialog
        open={cancel}
        onOpenChange={setCancel}
        icon={Ban}
        title={`Cancel ${b.bookingNo}`}
        description="The property becomes available again. Money already received stays on the customer's account until you refund it from this page."
        submitLabel="Cancel booking"
        reasonLabel="Why is it being cancelled?"
        onSubmit={async (reason) => {
          await setBookingStatus(company.id, id, "cancelled", reason);
          await invalidate();
          toast.success("Booking cancelled");
        }}
      />
    </div>
  );
}
