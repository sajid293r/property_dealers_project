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
      await api(`/v1/installments/${installmentId}/penalty`, { method: "POST", companyId: company.id, body: { amount, reason: "Late payment" } });
      await invalidate();
      toast.success("Late charge added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
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
          <h3 className="mb-1 flex items-center gap-2 font-heading text-base font-semibold"><AlertTriangle className="size-4 text-warning" /> Late charges</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            {num(x.penaltyRule.ratePctPerMonth) > 0 ? `Your rule: ${num(x.penaltyRule.ratePctPerMonth)}% a month after ${x.penaltyRule.graceDays} days' grace.` : <>No late-charge rule is set. <Link href="/dashboard/administration/company-profile" className="text-primary underline">Set one</Link>.</>} The next payment pays late charges first.
          </p>
          {x.penaltySuggestions.map((s) => (
            <div key={s.installmentId} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm">
              <span>Installment {s.seq} is late since {formatDate(s.dueDate)} — suggested <span className="font-mono font-medium">{formatMoney(num(s.amount))}</span></span>
              {can("accounts.create") && !cancelled && <Button size="sm" disabled={busy} onClick={() => void charge(s.installmentId, s.amount)}>Charge it</Button>}
            </div>
          ))}
          {x.penalties.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-2 text-sm last:border-0">
              <span>Installment {p.installmentSeq} · {formatDate(p.assessedOn)}{p.reason ? ` · ${p.reason}` : ""}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono">{formatMoney(num(p.amount))}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{p.status}</span>
                {(p.status === "open") && can("accounts.approve") && <Button size="sm" variant="ghost" onClick={() => setWaiving(p.id)}>Waive</Button>}
              </span>
            </div>
          ))}
        </Card>
      )}

      {(x.dealerId || x.commissions.length > 0) && (
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><Percent className="size-4" /> Dealer commission</h3>
            {!liveCommission && x.dealerId && !cancelled && can("deals.approve") && <Button size="sm" variant="outline" onClick={() => setCommission(true)}>Record commission</Button>}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">Dealer: {x.dealerName ?? "—"}. Pay the dealer with a payment voucher against “Dealer Commission Payable”.</p>
          {x.commissions.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-2 text-sm last:border-0">
              <span><span className="font-mono">{c.commissionNo}</span> · {num(c.ratePct)}% · {formatDate(c.accruedOn)}</span>
              <span className="flex items-center gap-2">
                <span className={`font-mono ${c.status === "void" ? "text-muted-foreground line-through" : ""}`}>{formatMoney(num(c.amount))}</span>
                {c.status === "accrued" && can("deals.approve") && <Button size="icon-sm" variant="ghost" aria-label="Void commission" onClick={() => setVoidingCommission(c.id)}><Ban className="size-4" /></Button>}
              </span>
            </div>
          ))}
        </Card>
      )}

      {(cancelled || x.refunds.length > 0) && (
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><Undo2 className="size-4" /> Refund</h3>
            {cancelled && num(x.refundable) > 0 && can("accounts.approve") && <Button size="sm" onClick={() => setRefund(true)}>Refund the customer</Button>}
          </div>
          {cancelled && <p className="mb-2 text-sm">Received on this booking and not yet returned: <span className="font-mono font-medium">{formatMoney(num(x.refundable))}</span></p>}
          {x.refunds.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-2 text-sm last:border-0">
              <span><span className="font-mono">{r.refundNo}</span> · {formatDate(r.refundDate)}{r.note ? ` · ${r.note}` : ""}<span className="block text-xs text-muted-foreground">Refunded {formatMoney(num(r.refundAmount))}{num(r.deductionAmount) > 0 ? ` · kept ${formatMoney(num(r.deductionAmount))} as cancellation charge` : ""}</span></span>
              {r.status === "posted" ? (can("accounts.approve") && <Button size="icon-sm" variant="ghost" aria-label="Void refund" onClick={() => setVoidingRefund(r.id)}><RotateCcw className="size-4" /></Button>) : <span className="rounded-full bg-muted px-2 py-0.5 text-xs">void</span>}
            </div>
          ))}
        </Card>
      )}

      {(x.transfers.length > 0 || (!cancelled && can("deals.edit"))) && (
        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><ArrowRightLeft className="size-4" /> Transfers</h3>
            {!cancelled && can("deals.edit") && <Button size="sm" variant="outline" onClick={() => setTransfer(true)}>Transfer to another customer</Button>}
          </div>
          {x.transfers.length === 0 ? <p className="text-sm text-muted-foreground">This booking has not been transferred.</p> : x.transfers.map((t) => (
            <div key={t.id} className="border-b border-border/40 py-2 text-sm last:border-0">
              <p><span className="font-mono">{t.transferNo}</span> · {formatDate(t.transferDate)} · {t.fromName} → <span className="font-medium">{t.toName}</span></p>
              <p className="text-xs text-muted-foreground">{formatMoney(num(t.amountMoved))} already paid moved with it{t.note ? ` · ${t.note}` : ""}</p>
            </div>
          ))}
        </Card>
      )}

      <RefundDialog open={refund} onOpenChange={setRefund} bookingId={bookingId} refundable={num(x.refundable)} />
      <TransferDialog open={transfer} onOpenChange={setTransfer} bookingId={bookingId} currentCustomer={customerId} />
      <CommissionDialog open={commission} onOpenChange={setCommission} bookingId={bookingId} />
      <ReasonDialog open={!!waiving} onOpenChange={(o) => !o && setWaiving(null)} icon={Ban} title="Waive late charge" description="The charge is reversed in the books. Use this for a goodwill concession." submitLabel="Waive" reasonLabel="Why?"
        onSubmit={async (reason) => { await api(`/v1/penalties/${waiving}/waive`, { method: "POST", companyId: company.id, body: { reason } }); await invalidate(); toast.success("Late charge waived"); }} />
      <ReasonDialog open={!!voidingRefund} onOpenChange={(o) => !o && setVoidingRefund(null)} icon={RotateCcw} title="Void refund" description="The entry is reversed and the money counts as still held for the customer." submitLabel="Void refund"
        onSubmit={async (reason) => { await api(`/v1/refunds/${voidingRefund}/void`, { method: "POST", companyId: company.id, body: { reason } }); await invalidate(); toast.success("Refund voided"); }} />
      <ReasonDialog open={!!voidingCommission} onOpenChange={(o) => !o && setVoidingCommission(null)} icon={Ban} title="Void commission" description="The commission entry is reversed." submitLabel="Void commission"
        onSubmit={async (reason) => { await api(`/v1/commissions/${voidingCommission}/void`, { method: "POST", companyId: company.id, body: { reason } }); await invalidate(); toast.success("Commission voided"); }} />
    </>
  );
}

function RefundDialog({ open, onOpenChange, bookingId, refundable }: { open: boolean; onOpenChange: (o: boolean) => void; bookingId: string; refundable: number }) {
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
    <FormDialog open={open} onOpenChange={onOpenChange} icon={Undo2} title="Refund the customer" description={`Up to ${formatMoney(refundable)} can be returned. Anything you keep is booked as cancellation income.`} submitLabel="Save refund"
      submitDisabled={total <= 0 || total > refundable || (num(refund) > 0 && method !== "cash" && from === "cash")}
      onSubmit={async () => { await api(`/v1/bookings/${bookingId}/refund`, { method: "POST", companyId: company.id, body: { refundAmount: refund || "0", deductionAmount: keep || "0", method, bankAccountId: from === "cash" ? undefined : from, note: note.trim() || undefined } }); await invalidate(); toast.success("Refund recorded"); setRefund(""); setKeep(""); }}>
      <FieldRow>
        <Field label="Refund to the customer"><AmountInput value={refund} onChange={setRefund} /></Field>
        <Field label="Cancellation charge kept"><AmountInput value={keep} onChange={setKeep} /></Field>
      </FieldRow>
      {total > refundable && <p className="text-xs text-destructive">That is more than was received.</p>}
      <FieldRow>
        <Field label="Paid by"><Select value={method} onValueChange={(v) => { setMethod(v); setFrom(v === "cash" ? "cash" : banks.data?.[0]?.id ?? "cash"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RECEIPT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Paid from"><Select value={from} onValueChange={setFrom}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{method === "cash" && <SelectItem value="cash">Cash in hand</SelectItem>}{(banks.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} · {b.accountNo}</SelectItem>)}</SelectContent></Select></Field>
      </FieldRow>
      <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Per refund policy" /></Field>
    </FormDialog>
  );
}

function TransferDialog({ open, onOpenChange, bookingId, currentCustomer }: { open: boolean; onOpenChange: (o: boolean) => void; bookingId: string; currentCustomer: string }) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [to, setTo] = React.useState<string | null>(null);
  const [fee, setFee] = React.useState("");
  const [note, setNote] = React.useState("");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={ArrowRightLeft} title="Transfer to another customer" description="The booking and the money already paid move to the new customer. A transfer fee, if any, is invoiced to them." submitLabel="Transfer" submitDisabled={!to || to === currentCustomer}
      onSubmit={async () => { await api(`/v1/bookings/${bookingId}/transfer`, { method: "POST", companyId: company.id, body: { toPartyId: to, fee: fee || "0", date: todayIso(), note: note.trim() || undefined } }); await invalidate(); toast.success("Booking transferred"); setFee(""); setNote(""); }}>
      <Field label="New customer"><PartySelect value={to} onChange={(id) => setTo(id)} role="customer" placeholder="Choose a customer" createLabel="Add a new customer" /></Field>
      <Field label="Transfer fee (optional)"><AmountInput value={fee} onChange={setFee} /></Field>
      <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </FormDialog>
  );
}

function CommissionDialog({ open, onOpenChange, bookingId }: { open: boolean; onOpenChange: (o: boolean) => void; bookingId: string }) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [rate, setRate] = React.useState("2");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={Percent} title="Record dealer commission" description="A percentage of the net price. It is booked as an expense, owed to the dealer." submitLabel="Record" submitDisabled={!(Number(rate) > 0 && Number(rate) <= 100)}
      onSubmit={async () => { await api(`/v1/bookings/${bookingId}/commission`, { method: "POST", companyId: company.id, body: { ratePct: Number(rate) } }); await invalidate(); toast.success("Commission recorded"); }}>
      <Field label="Commission rate (%)"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
    </FormDialog>
  );
}
