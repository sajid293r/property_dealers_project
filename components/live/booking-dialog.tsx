"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountInput } from "@/components/live/amount-input";
import { SearchSelect } from "@/components/live/search-select";
import { PartySelect } from "@/components/live/party-select";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance } from "@/lib/hooks/use-live";
import { createBooking, listAvailableProperties } from "@/lib/api/sales";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

/** Book a property for a customer. The database refuses a second live booking on the same property. */
export function LiveBookingDialog({ open, onOpenChange, propertyId: presetProperty }: { open: boolean; onOpenChange: (o: boolean) => void; propertyId?: string }) {
  const { company } = useCompany();
  const router = useRouter();
  const invalidate = useInvalidateFinance();
  const props = useQuery({ queryKey: ["live", "available-properties"], queryFn: () => listAvailableProperties(company.id), enabled: open, staleTime: 15_000 });
  const [propertyId, setPropertyId] = React.useState<string | null>(presetProperty ?? null);
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [paymentType, setPaymentType] = React.useState<"cash" | "installment">("installment");
  const [discount, setDiscount] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const [dealerId, setDealerId] = React.useState<string | null>(null);
  // one key per opening of the dialog: a double-click or a retry can never book the property twice
  const key = React.useMemo(() => (open ? crypto.randomUUID() : ""), [open]);

  const chosen = props.data?.find((p) => p.id === propertyId);
  const price = chosen ? num(chosen.listPrice) : 0;
  const net = Math.max(price - num(discount), 0);
  const options = (props.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.code} — ${p.title}`,
    hint: formatMoney(num(p.listPrice), { compact: true }),
    group: p.project ?? "No project",
  }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Handshake}
      title="New booking"
      description="Reserve a property for a customer. You can set up the payment plan and take the first payment on the next screen."
      submitLabel="Create booking"
      submitDisabled={!propertyId || !customerId || num(discount) > price}
      onSubmit={async () => {
        const b = await createBooking(
          company.id,
          { propertyId: propertyId!, customerId: customerId!, paymentType, discount: discount || "0", bookingDate: date, dealerId: dealerId ?? undefined },
          key,
        );
        await invalidate();
        toast.success(`${b.bookingNo} created`);
        router.push(`/dashboard/deals/${b.id}`);
      }}
    >
      <Field label="Property">
        <SearchSelect
          options={options}
          value={propertyId}
          onChange={setPropertyId}
          placeholder={props.isLoading ? "Loading properties…" : "Choose an available property"}
          searchPlaceholder="Search by code, name or project"
          emptyText="No available property matches"
          disabled={!!presetProperty}
        />
      </Field>
      <Field label="Customer">
        <PartySelect value={customerId} onChange={(id) => setCustomerId(id)} role="customer" placeholder="Choose a customer" createLabel="Add a new customer" />
      </Field>
      <FieldRow>
        <Field label="How will they pay?">
          <Select value={paymentType} onValueChange={(v) => setPaymentType(v as "cash" | "installment")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="installment">Installments</SelectItem>
              <SelectItem value="cash">Full payment</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Booking date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </FieldRow>
      <Field label="Discount (optional)"><AmountInput value={discount} onChange={setDiscount} /></Field>
      <Field label="Dealer who brought the customer (optional)"><PartySelect value={dealerId} onChange={(id) => setDealerId(id)} role="dealer" placeholder="No dealer" createLabel="Add a new dealer" /></Field>
      {chosen && (
        <div className="rounded-lg bg-secondary/50 px-3 py-2.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">List price</span><span className="font-mono tabular-nums">{formatMoney(price)}</span></div>
          <div className="flex justify-between font-medium"><span>Customer pays</span><span className="font-mono tabular-nums">{formatMoney(net)}</span></div>
        </div>
      )}
    </FormDialog>
  );
}
