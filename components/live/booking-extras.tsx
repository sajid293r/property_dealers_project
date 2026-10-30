"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, Ban, Percent, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { AmountInput } from "@/components/live/amount-input";
import { PartySelect } from "@/components/live/party-select";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useBankAccounts, useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { api } from "@/lib/api/client";
import { num } from "@/lib/api/finance";
import { RECEIPT_METHODS } from "@/lib/live-sales";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import { Ltr } from "@/components/ltr";
import { tOr } from "@/lib/i18n/runtime";

interface Extras {
  dealerId: string | null; dealerName: string | null; refundable: string; received: string;
  penalties: { id: string; installmentSeq: number; amount: string; paidAmount: string; status: string; reason: string | null; assessedOn: string }[];
  penaltySuggestions: { installmentId: string; seq: number; dueDate: string; amount: string }[];
  penaltyRule: { ratePctPerMonth: string; graceDays: number };
  refunds: { id: string; refundNo: string; refundAmount: string; deductionAmount: string; method: string; refundDate: string; note: string | null; status: string }[];
  transfers: { id: string; transferNo: string; fromName: string; toName: string; transferDate: string; amountMoved: string; note: string | null }[];
  commissions: { id: string; commissionNo: string; dealerName: string; ratePct: string; amount: string; status: string; accruedOn: string }[];
}

export function BookingExtras({ bookingId, status, customerId }: { bookingId: string; status: string; customerId: string }) {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const q = useQuery({ queryKey: ["live", "booking-extras", bookingId], queryFn: () => api<Extras>(`/v1/bookings/${bookingId}/extras`, { companyId: company.id }), staleTime: 5_000 });
  const [refund, setRefund] = React.useState(false);
  const [transfer, setTransfer] = React.useState(false);
  const [commission, setCommission] = React.useState(false);
  const [waiving, setWaiving] = React.useState<string | null>(null);
  const [voidingRefund, setVoidingRefund] = React.useState<string | null>(null);
  const [voidingCommission, setVoidingCommission] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const x = q.data;
  if (!x) return null;

  async function charge(installmentId: string, amount: string) {
    setBusy(true);
    try {
      await api(`/v1/installments/${installmentId}/penalty`, { method: "POST", companyId: company.id, body: { amount, reason: t("deals.late.reasonDefault") } });
      await invalidate();
      toast.success(t("deals.late.added"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.thatDidNotWork"));
    } finally {
      setBusy(false);
    }
  }

  const cancelled = status === "cancelled";
  const liveCommission = x.commissions.find((c) => c.status === "accrued");
  const showLate = x.penalties.length > 0 || x.penaltySuggestions.length > 0 || num(x.penaltyRule.ratePctPerMonth) > 0;

  return (
    <>
      {showLate && (
        <Card className="p-5">
          <h3 className="mb-1 flex items-center gap-2 font-heading text-base font-semibold"><AlertTriangle className="size-4 text-warning" /> {t("deals.late.title")}</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            {num(x.penaltyRule.ratePctPerMonth) > 0 ? t("deals.late.rule", { rate: num(x.penaltyRule.ratePctPerMonth), days: x.penaltyRule.graceDays }) : <>{t("deals.late.noRule")} <Link href="/dashboard/administration/company-profile" className="text-primary underline">{t("deals.late.setOne")}</Link>.</>} {t("deals.late.paysFirst")}
          </p>
          {x.penaltySuggestions.map((s) => (
            <div key={s.installmentId} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
              <span>{t("deals.late.suggested", { seq: s.seq, date: formatDate(s.dueDate), amount: formatMoney(num(s.amount)) })}</span>
              {can("accounts.create") && !cancelled && <Button size="sm" disabled={busy} onClick={() => void charge(s.installmentId, s.amount)}>{t("deals.late.chargeIt")}</Button>}
            </div>
          ))}
          {x.penalties.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-2 text-sm last:border-0">
              <span>{t("deals.late.installmentLine", { seq: p.installmentSeq, date: formatDate(p.assessedOn) })}{p.reason ? ` · ${p.reason}` : ""}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono">{formatMoney(num(p.amount))}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{tOr(t, `status.${p.status}`, p.status)}</span>
                {(p.status === "open") && can("accounts.approve") && <Button size="sm" variant="ghost" onClick={() => setWaiving(p.id)}>{t("deals.late.waive")}</Button>}
              </span>
            </div>
          ))}
        </Card>
      )}

      {(x.dealerId || x.commissions.length > 0) && (
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><Percent className="size-4" /> {t("deals.com.title")}</h3>
            {!liveCommission && x.dealerId && !cancelled && can("deals.approve") && <Button size="sm" variant="outline" onClick={() => setCommission(true)}>{t("deals.com.record")}</Button>}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">{t("deals.com.dealerNote", { name: x.dealerName ?? "—" })}</p>
          {x.commissions.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-2 text-sm last:border-0">
              <span><span className="font-mono"><Ltr>{c.commissionNo}</Ltr></span> · <Ltr>{num(c.ratePct)}%</Ltr> · {formatDate(c.accruedOn)}</span>
              <span className="flex items-center gap-2">
                <span className={`font-mono ${c.status === "void" ? "text-muted-foreground line-through" : ""}`}>{formatMoney(num(c.amount))}</span>
                {c.status === "accrued" && can("deals.approve") && <Button size="icon-sm" variant="ghost" aria-label={t("deals.com.void")} onClick={() => setVoidingCommission(c.id)}><Ban className="size-4" /></Button>}
              </span>
            </div>
          ))}
        </Card>
      )}

      {(cancelled || x.refunds.length > 0) && (
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><Undo2 className="size-4" /> {t("deals.refund.title")}</h3>
            {cancelled && num(x.refundable) > 0 && can("accounts.approve") && <Button size="sm" onClick={() => setRefund(true)}>{t("deals.refund.button")}</Button>}
          </div>
          {cancelled && <p className="mb-2 text-sm">{t("deals.refund.heldNote")} <span className="font-mono font-medium">{formatMoney(num(x.refundable))}</span></p>}
          {x.refunds.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-2 text-sm last:border-0">
              <span><span className="font-mono">{r.refundNo}</span> · {formatDate(r.refundDate)}{r.note ? ` · ${r.note}` : ""}<span className="block text-xs text-muted-foreground">{t("deals.refund.detail", { refund: formatMoney(num(r.refundAmount)) })}{num(r.deductionAmount) > 0 ? t("deals.refund.kept", { amount: formatMoney(num(r.deductionAmount)) }) : ""}</span></span>
              {r.status === "posted" ? (can("accounts.approve") && <Button size="icon-sm" variant="ghost" aria-label={t("deals.refund.voidBtn")} onClick={() => setVoidingRefund(r.id)}><RotateCcw className="size-4" /></Button>) : <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t("deals.refund.voidBadge")}</span>}
            </div>
          ))}
        </Card>
      )}

      {(x.transfers.length > 0 || (!cancelled && can("deals.edit"))) && (
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><ArrowRightLeft className="size-4" /> {t("deals.xfer.title")}</h3>
            {!cancelled && can("deals.edit") && <Button size="sm" variant="outline" onClick={() => setTransfer(true)}>{t("deals.xfer.button")}</Button>}
          </div>
          {x.transfers.length === 0 ? <p className="text-sm text-muted-foreground">{t("deals.xfer.none")}</p> : x.transfers.map((tr) => (
            <div key={tr.id} className="border-b border-border/40 py-2 text-sm last:border-0">
              <p><span className="font-mono"><Ltr>{tr.transferNo}</Ltr></span> · {formatDate(tr.transferDate)} · {tr.fromName} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span> <span className="font-medium">{tr.toName}</span></p>
              <p className="text-xs text-muted-foreground">{t("deals.xfer.moved", { amount: formatMoney(num(tr.amountMoved)) })}{tr.note ? ` · ${tr.note}` : ""}</p>
            </div>
          ))}
        </Card>
      )}

      <RefundDialog open={refund} onOpenChange={setRefund} bookingId={bookingId} refundable={num(x.refundable)} />
      <TransferDialog open={transfer} onOpenChange={setTransfer} bookingId={bookingId} currentCustomer={customerId} />
      <CommissionDialog open={commission} onOpenChange={setCommission} bookingId={bookingId} />
      <ReasonDialog open={!!waiving} onOpenChange={(o) => !o && setWaiving(null)} icon={Ban} title={t("deals.late.waiveTitle")} description={t("deals.late.waiveDescription")} submitLabel={t("deals.late.waive")} reasonLabel={t("deals.late.waiveReason")}
        onSubmit={async (reason) => { await api(`/v1/penalties/${waiving}/waive`, { method: "POST", companyId: company.id, body: { reason } }); await invalidate(); toast.success(t("deals.late.waived")); }} />
      <ReasonDialog open={!!voidingRefund} onOpenChange={(o) => !o && setVoidingRefund(null)} icon={RotateCcw} title={t("deals.refund.voidBtn")} description={t("deals.refund.voidDescription")} submitLabel={t("deals.refund.voidBtn")}
        onSubmit={async (reason) => { await api(`/v1/refunds/${voidingRefund}/void`, { method: "POST", companyId: company.id, body: { reason } }); await invalidate(); toast.success(t("deals.refund.voided")); }} />
      <ReasonDialog open={!!voidingCommission} onOpenChange={(o) => !o && setVoidingCommission(null)} icon={Ban} title={t("deals.com.void")} description={t("deals.com.voidDescription")} submitLabel={t("deals.com.void")}
        onSubmit={async (reason) => { await api(`/v1/commissions/${voidingCommission}/void`, { method: "POST", companyId: company.id, body: { reason } }); await invalidate(); toast.success(t("deals.com.voided")); }} />
    </>
  );
}

function RefundDialog({ open, onOpenChange, bookingId, refundable }: { open: boolean; onOpenChange: (o: boolean) => void; bookingId: string; refundable: number }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const banks = useBankAccounts();
  const [refund, setRefund] = React.useState("");
  const [keep, setKeep] = React.useState("");
  const [method, setMethod] = React.useState("cash");
  const [from, setFrom] = React.useState("cash");
  const [note, setNote] = React.useState("");
  const total = num(refund) + num(keep);
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={Undo2} title={t("deals.refund.button")} description={t("deals.refund.dlgDescription", { amount: formatMoney(refundable) })} submitLabel={t("deals.refund.dlgSubmit")}
      submitDisabled={total <= 0 || total > refundable || (num(refund) > 0 && method !== "cash" && from === "cash")}
      onSubmit={async () => { await api(`/v1/bookings/${bookingId}/refund`, { method: "POST", companyId: company.id, body: { refundAmount: refund || "0", deductionAmount: keep || "0", method, bankAccountId: from === "cash" ? undefined : from, note: note.trim() || undefined } }); await invalidate(); toast.success(t("deals.refund.recorded")); setRefund(""); setKeep(""); }}>
      <FieldRow>
        <Field label={t("deals.refund.toCustomer")}><AmountInput value={refund} onChange={setRefund} /></Field>
        <Field label={t("deals.refund.keep")}><AmountInput value={keep} onChange={setKeep} /></Field>
      </FieldRow>
      {total > refundable && <p className="text-xs text-destructive">{t("deals.refund.tooMuch")}</p>}
      <FieldRow>
        <Field label={t("deals.rcpt.paidBy")}><Select value={method} onValueChange={(v) => { setMethod(v); setFrom(v === "cash" ? "cash" : banks.data?.[0]?.id ?? "cash"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RECEIPT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{t(`deals.method.${m.value}`)}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("deals.refund.paidFrom")}><Select value={from} onValueChange={setFrom}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{method === "cash" && <SelectItem value="cash">{t("deals.rcpt.cashInHand")}</SelectItem>}{(banks.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} · {b.accountNo}</SelectItem>)}</SelectContent></Select></Field>
      </FieldRow>
      <Field label={t("deals.refund.note")}><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("deals.refund.notePlaceholder")} /></Field>
    </FormDialog>
  );
}

function TransferDialog({ open, onOpenChange, bookingId, currentCustomer }: { open: boolean; onOpenChange: (o: boolean) => void; bookingId: string; currentCustomer: string }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [to, setTo] = React.useState<string | null>(null);
  const [fee, setFee] = React.useState("");
  const [note, setNote] = React.useState("");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={ArrowRightLeft} title={t("deals.xfer.button")} description={t("deals.xfer.dlgDescription")} submitLabel={t("deals.xfer.dlgSubmit")} submitDisabled={!to || to === currentCustomer}
      onSubmit={async () => { await api(`/v1/bookings/${bookingId}/transfer`, { method: "POST", companyId: company.id, body: { toPartyId: to, fee: fee || "0", date: todayIso(), note: note.trim() || undefined } }); await invalidate(); toast.success(t("deals.xfer.done")); setFee(""); setNote(""); }}>
      <Field label={t("deals.xfer.newCustomer")}><PartySelect value={to} onChange={(id) => setTo(id)} role="customer" placeholder={t("deals.new.chooseCustomer")} createLabel={t("customers.select.addCustomer")} /></Field>
      <Field label={t("deals.xfer.fee")}><AmountInput value={fee} onChange={setFee} /></Field>
      <Field label={t("deals.refund.note")}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </FormDialog>
  );
}

function CommissionDialog({ open, onOpenChange, bookingId }: { open: boolean; onOpenChange: (o: boolean) => void; bookingId: string }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [rate, setRate] = React.useState("2");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={Percent} title={t("deals.com.dlgTitle")} description={t("deals.com.dlgDescription")} submitLabel={t("deals.com.dlgSubmit")} submitDisabled={!(Number(rate) > 0 && Number(rate) <= 100)}
      onSubmit={async () => { await api(`/v1/bookings/${bookingId}/commission`, { method: "POST", companyId: company.id, body: { ratePct: Number(rate) } }); await invalidate(); toast.success(t("deals.com.recorded")); }}>
      <Field label={t("deals.com.rate")}><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
    </FormDialog>
  );
}
