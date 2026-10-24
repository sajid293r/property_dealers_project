"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountInput } from "@/components/live/amount-input";
import { SearchSelect } from "@/components/live/search-select";
import { useCompany } from "@/lib/providers/company-provider";
import { useBankAccounts, useInvalidateFinance } from "@/lib/hooks/use-live";
import { createReceipt, getBooking, listBookings, type ReceiptMethod } from "@/lib/api/sales";
import { num } from "@/lib/api/finance";
import { RECEIPT_METHODS } from "@/lib/live-sales";
import { amountInWords } from "@/lib/amount-words";
import { todayIso } from "@/lib/fiscal";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

/** Record money received from a customer. It is applied to the oldest unpaid installments automatically. */
export function ReceiptDialog({ open, onOpenChange, bookingId: preset }: { open: boolean; onOpenChange: (o: boolean) => void; bookingId?: string }) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const banks = useBankAccounts();
  const [bookingId, setBookingId] = React.useState<string | null>(preset ?? null);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<ReceiptMethod>("cash");
  const [into, setInto] = React.useState<string>("cash");
  const [ref, setRef] = React.useState("");
  const [date, setDate] = React.useState(todayIso());

  const all = useQuery({ queryKey: ["live", "bookings", "open"], queryFn: () => listBookings(company.id), enabled: open && !preset, staleTime: 15_000 });
  const detail = useQuery({ queryKey: ["live", "booking", bookingId], queryFn: () => getBooking(company.id, bookingId!), enabled: open && !!bookingId });
  const m = RECEIPT_METHODS.find((x) => x.value === method)!;
  const openBookings = (all.data ?? []).filter((b) => b.status !== "cancelled").map((b) => ({ value: b.id, label: `${b.bookingNo} — ${b.customerName}`, hint: b.propertyCode }));
  const unpaid = (detail.data?.installments ?? []).filter((i) => i.status === "due" || i.status === "partial");
  const dueNow = unpaid.reduce((s, i) => s + num(i.amount) - num(i.paidAmount), 0);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={HandCoins}
      title="Receive payment"
      description="Record money received from the customer. It goes into the books straight away."
      submitLabel="Save receipt"
      submitDisabled={!bookingId || num(amount) <= 0 || (m.needsRef && !ref.trim()) || (method !== "cash" && into === "cash")}
      onSubmit={async () => {
        const r = await createReceipt(company.id, {
          bookingId: bookingId!,
          amount,
          method,
          ...(into === "cash" ? {} : { bankAccountId: into }),
          receivedOn: date,
          instrumentRef: ref.trim() || undefined,
        });
        await invalidate();
        toast.success(`${r.receiptNo} saved`);
        setAmount("");
        setRef("");
      }}
    >
      {!preset && (
        <Field label="Booking">
          <SearchSelect options={openBookings} value={bookingId} onChange={setBookingId} placeholder="Choose the booking" searchPlaceholder="Search booking or customer" emptyText="No booking found" />
        </Field>
      )}
      {detail.data && (
        <div className="rounded-lg bg-secondary/50 px-3 py-2.5 text-sm">
          <p className="font-medium">{detail.data.customerName} · {detail.data.propertyCode}</p>
          <p className="text-muted-foreground">Due on installments: <span className="font-mono">{formatMoney(dueNow)}</span></p>
        </div>
      )}
      <Field label="Amount received">
        <AmountInput value={amount} onChange={setAmount} />
      </Field>
      {num(amount) > 0 && <p className="-mt-2 text-xs italic text-muted-foreground">{amountInWords(amount)}</p>}
      <FieldRow>
        <Field label="Paid by">
          <Select
            value={method}
            onValueChange={(v) => {
              setMethod(v as ReceiptMethod);
              if (v === "cash") setInto("cash");
              else if (into === "cash") setInto(banks.data?.[0]?.id ?? "cash");
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{RECEIPT_METHODS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Received on"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="Deposited into">
          <Select value={into} onValueChange={setInto}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {method === "cash" && <SelectItem value="cash">Cash in hand</SelectItem>}
              {(banks.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} · {b.accountNo}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {m.needsRef && <Field label={m.refLabel}><Input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} /></Field>}
      </FieldRow>
      {method !== "cash" && (banks.data ?? []).length === 0 && (
        <p className="text-xs text-warning">Add a bank account under Accounts first, to deposit a cheque or transfer into.</p>
      )}
    </FormDialog>
  );
}
