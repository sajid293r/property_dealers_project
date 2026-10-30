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
import { BOOKING_STATUS_CLASS, INSTALLMENT_STATUS_CLASS, methodLabel } from "@/lib/live-sales";
import { tOr } from "@/lib/i18n/runtime";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { PrintLink } from "@/components/live/print-button";
import { useT } from "@/lib/i18n/provider";
import { Ltr } from "@/components/ltr";

export function LiveBookingDetail() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
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
        <Link href="/dashboard/deals" className="text-sm text-muted-foreground hover:text-foreground"><span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {t("deals.d.backToBookings")}</Link>
        <Card className="p-10 text-center text-sm text-muted-foreground">{q.error instanceof Error ? q.error.message : t("deals.d.notFound")}</Card>
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
      toast.success(to === "confirmed" ? t("deals.d.confirmed") : t("deals.d.completed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.thatDidNotWork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={Handshake}
        back={{ href: "/dashboard/deals", label: t("nav.item.deals") }}
        title={b.bookingNo}
        badge={<span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BOOKING_STATUS_CLASS[b.status]}`}>{t(`status.${b.status}`)}</span>}
        description={`${b.customerName} · ${b.propertyCode} ${b.propertyTitle}${b.projectName ? ` · ${b.projectName}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <PrintLink kind="booking" id={id} label={t("deals.d.printPlan")} size="default" /><AttachmentsButton entityType="booking" entityId={id} title={`${b.bookingNo} — ${b.customerName}`} canEdit={can("deals.edit")} size="default" categories={["Agreement", "CNIC copy", "Payment proof", "Allotment letter", "Other"]} />{open && can("deals.create") && <Button variant="outline" className="gap-1.5" onClick={() => setReceipt(true)}><HandCoins className="size-4" /> {t("deals.receivePayment")}</Button>}
            {needsPlan && can("deals.edit") && <Button variant="outline" className="gap-1.5" onClick={() => setPlan(true)}><CalendarClock className="size-4" /> {t("deals.d.setPlan")}</Button>}
            {moves.map((m) => (
              <Button key={m.to} className="gap-1.5" disabled={busy} onClick={() => void move(m.to as "confirmed" | "completed")}>
                <CheckCircle2 className="size-4" /> {m.to === "confirmed" ? t("deals.d.confirm") : t("deals.d.markCompleted")}
              </Button>
            ))}
            {canCancel && <Button variant="outline" className="gap-1.5 text-destructive" onClick={() => setCancel(true)}><Ban className="size-4" /> {t("deals.d.cancel")}</Button>}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">{t("deals.d.plan")}</h3>
            {b.installments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {b.paymentType === "cash" ? t("deals.d.planCash") : t("deals.d.planNone")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">{t("deals.d.colWhat")}</th>
                      <th className="pb-2 font-medium">{t("deals.d.colDue")}</th>
                      <th className="pb-2 pe-3 text-end font-medium">{t("deals.d.colAmount")}</th>
                      <th className="pb-2 pe-3 text-end font-medium">{t("deals.d.colPaid")}</th>
                      <th className="pb-2 font-medium">{t("deals.d.colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.installments.map((i) => {
                      const late = (i.status === "due" || i.status === "partial") && i.dueDate < todayIso();
                      return (
                        <tr key={i.id} className="border-b border-border/40 last:border-0">
                          <td className="py-2 text-muted-foreground">{i.seq}</td>
                          <td className="py-2">{tOr(t, `deals.kind.${i.kind}`, i.kind)}</td>
                          <td className={`py-2 ${late ? "font-medium text-warning" : "text-muted-foreground"}`}>{formatDate(i.dueDate)}{late && ` ${t("deals.overdueFlag")}`}</td>
                          <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{formatMoney(num(i.amount))}</td>
                          <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{num(i.paidAmount) ? formatMoney(num(i.paidAmount)) : ""}</td>
                          <td className="py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${INSTALLMENT_STATUS_CLASS[i.status]}`}>{t(`status.${i.status}`)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">{t("deals.d.receipts")}</h3>
            {(rec.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("deals.d.noPayment")}</p>
            ) : (
              <div className="space-y-2">
                {(rec.data ?? []).map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <div>
                      <p className="font-mono font-medium"><Ltr>{r.receiptNo}</Ltr> <span className="font-sans font-normal text-muted-foreground">· {formatDate(r.receivedOn)}</span></p>
                      <p className="text-xs text-muted-foreground">{[methodLabel(r.method), r.instrumentRef, r.depositAccountName].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex items-center gap-2"><p className={`whitespace-nowrap font-mono tabular-nums ${r.status === "void" ? "text-muted-foreground line-through" : "font-medium"}`}>{formatMoney(num(r.amount))}</p><PrintLink kind="receipt" id={r.id} iconOnly label={t("deals.printReceipt")} variant="ghost" /></div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <BookingExtras bookingId={id} status={b.status} customerId={b.customerId} />
        </div>

        <Card className="h-fit space-y-4 p-5">
          <div>
            <p className="text-xs text-muted-foreground">{t("deals.d.customerPays")}</p>
            <p className="break-words font-heading text-2xl font-semibold tabular-nums">{formatMoney(net)}</p>
            {num(b.discount) > 0 && <p className="text-xs text-muted-foreground">{t("deals.d.afterDiscount", { amount: formatMoney(num(b.discount)) })}</p>}
          </div>
          <div>
            <Progress value={pct} className="h-2" />
            <div className="mt-2 flex justify-between text-sm">
              <span className="flex items-center gap-1.5"><Wallet className="size-3.5 text-success" /> {t("deals.d.paid")}</span>
              <span className="font-mono tabular-nums">{formatMoney(paid)}</span>
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("deals.d.balance")}</span><span className="font-mono tabular-nums">{formatMoney(Math.max(net - paid, 0))}</span></div>
            {num(b.overdueAmount) > 0 && <div className="mt-1 flex justify-between text-sm font-medium text-warning"><span>{t("deals.d.overdue")}</span><span className="font-mono tabular-nums">{formatMoney(num(b.overdueAmount))}</span></div>}
          </div>
          <div className="space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <p>{t("deals.d.bookedOn", { date: formatDate(b.bookingDate) })}</p>
            <p>{b.paymentType === "cash" ? t("deals.d.fullPayment") : t("deals.d.installments")}</p>
            {b.nextDueDate && <p>{t("deals.d.nextDue", { date: formatDate(b.nextDueDate) })}</p>}
            {b.cancelReason && <p className="text-destructive">{t("deals.d.cancelledWhy", { reason: b.cancelReason })}</p>}
          </div>
        </Card>
      </div>

      <ReceiptDialog open={receipt} onOpenChange={setReceipt} bookingId={id} />
      <ScheduleDialog open={plan} onOpenChange={setPlan} bookingId={id} netPrice={net} />
      <ReasonDialog
        open={cancel}
        onOpenChange={setCancel}
        icon={Ban}
        title={t("deals.d.cancelTitle", { no: b.bookingNo })}
        description={t("deals.d.cancelDescription")}
        submitLabel={t("deals.d.cancel")}
        reasonLabel={t("deals.d.cancelReason")}
        onSubmit={async (reason) => {
          await setBookingStatus(company.id, id, "cancelled", reason);
          await invalidate();
          toast.success(t("deals.d.cancelled"));
        }}
      />
    </div>
  );
}
