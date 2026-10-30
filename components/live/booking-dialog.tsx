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
import { useT } from "@/lib/i18n/provider";

/** Book a property for a customer. The database refuses a second live booking on the same property. */
export function LiveBookingDialog({ open, onOpenChange, propertyId: presetProperty }: { open: boolean; onOpenChange: (o: boolean) => void; propertyId?: string }) {
  const t = useT();
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
    group: p.project ?? t("deals.new.noProject"),
  }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Handshake}
      title={t("deals.new.title")}
      description={t("deals.new.description")}
      submitLabel={t("deals.new.submit")}
      submitDisabled={!propertyId || !customerId || num(discount) > price}
      onSubmit={async () => {
        const b = await createBooking(
          company.id,
          { propertyId: propertyId!, customerId: customerId!, paymentType, discount: discount || "0", bookingDate: date, dealerId: dealerId ?? undefined },
          key,
        );
        await invalidate();
        toast.success(t("deals.new.created", { no: b.bookingNo }));
        router.push(`/dashboard/deals/${b.id}`);
      }}
    >
      <Field label={t("deals.new.property")}>
        <SearchSelect
          options={options}
          value={propertyId}
          onChange={setPropertyId}
          placeholder={props.isLoading ? t("deals.new.loading") : t("deals.new.choose")}
          searchPlaceholder={t("deals.new.search")}
          emptyText={t("deals.new.empty")}
          disabled={!!presetProperty}
        />
      </Field>
      <Field label={t("deals.new.customer")}>
        <PartySelect value={customerId} onChange={(id) => setCustomerId(id)} role="customer" placeholder={t("deals.new.chooseCustomer")} createLabel={t("customers.select.addCustomer")} />
      </Field>
      <FieldRow>
        <Field label={t("deals.new.howPay")}>
          <Select value={paymentType} onValueChange={(v) => setPaymentType(v as "cash" | "installment")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="installment">{t("deals.d.installments")}</SelectItem>
              <SelectItem value="cash">{t("deals.d.fullPayment")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("deals.new.date")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </FieldRow>
      <Field label={t("deals.new.discount")}><AmountInput value={discount} onChange={setDiscount} /></Field>
      <Field label={t("deals.new.dealer")}><PartySelect value={dealerId} onChange={(id) => setDealerId(id)} role="dealer" placeholder={t("deals.new.noDealer")} createLabel={t("deals.new.addDealer")} /></Field>
      {chosen && (
        <div className="rounded-lg bg-secondary/50 px-3 py-2.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">{t("deals.new.listPrice")}</span><span className="font-mono tabular-nums">{formatMoney(price)}</span></div>
          <div className="flex justify-between font-medium"><span>{t("deals.d.customerPays")}</span><span className="font-mono tabular-nums">{formatMoney(net)}</span></div>
        </div>
      )}
    </FormDialog>
  );
}
