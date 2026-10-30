"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileStack } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomers, useUnits, useQuotations, useStaff } from "@/lib/hooks/use-data";
import { PAYMENT_TERMS, nextDocNumber } from "@/lib/sales";
import { formatPkr, dateOffsetFromToday } from "@/lib/format";
import type { Quotation } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import { tx } from "@/lib/i18n/runtime";

export function NewQuotationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { data: customers } = useCustomers();
  const { data: units } = useUnits();
  const { data: staff } = useStaff();
  const { data: quotations } = useQuotations();

  const [customerId, setCustomerId] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [salesPerson, setSalesPerson] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [discountPercent, setDiscountPercent] = React.useState("0");
  const [paymentTerms, setPaymentTerms] = React.useState<string>(PAYMENT_TERMS[0]);
  const [remarks, setRemarks] = React.useState("");

  const salesStaff = (staff ?? []).filter((s) => s.role === "agent" || s.role === "manager");
  const availableUnits = (units ?? []).filter((u) => u.status === "available");
  const selectedUnit = units?.find((u) => u.id === unitId);

  function resetForm() {
    setCustomerId("");
    setUnitId("");
    setSalesPerson("");
    setPrice("");
    setDiscountPercent("0");
    setPaymentTerms(PAYMENT_TERMS[0]);
    setRemarks("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleUnitChange(id: string) {
    setUnitId(id);
    const unit = units?.find((u) => u.id === id);
    if (unit) setPrice(String(unit.price));
  }

  function handleSubmit() {
    const number = nextDocNumber("QTN", quotations ?? []);
    const today = new Date().toISOString().slice(0, 10);
    const newQuotation: Quotation = {
      id: `qtn-${Date.now()}`,
      number,
      date: today,
      validUntil: dateOffsetFromToday(14),
      customerId,
      unitId,
      salesPerson,
      price: Number(price) || 0,
      discountPercent: Number(discountPercent) || 0,
      paymentTerms,
      remarks,
      status: "draft",
      createdAt: today,
    };

    queryClient.setQueryData<Quotation[]>(["quotations"], (old = []) => [newQuotation, ...old]);
    toast.success(`${number} created`, { description: "Saved as a draft — send it when ready." });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={FileStack}
      title={t("dm.new_quotation")}
      description={t("dm.quote_a_property_s_price")}
      submitLabel={t("dm.create_quotation")}
      submitDisabled={!customerId || !unitId || !salesPerson || !price}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label={t("common.customer")}>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("dm.select_customer")} /></SelectTrigger>
            <SelectContent>
              {customers?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("dm.sales_person")}>
          <Select value={salesPerson} onValueChange={setSalesPerson}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("dm.select_agent")} /></SelectTrigger>
            <SelectContent>
              {salesStaff.map((s) => (
                <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <Field label={t("audit.entity.properties")}>
        <Select value={unitId} onValueChange={handleUnitChange}>
          <SelectTrigger className="w-full"><SelectValue placeholder={t("deals.demo.selectProperty")} /></SelectTrigger>
          <SelectContent>
            {availableUnits.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.code} — {u.project} ({formatPkr(u.price, { compact: true })})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <FieldRow>
        <Field label={t("dm.quoted_price_pkr")}>
          <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </Field>
        <Field label={t("dm.discount")}>
          <Input
            type="number"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder="0"
          />
        </Field>
      </FieldRow>

      <Field label={t("dm.payment_terms")}>
        <Select value={paymentTerms} onValueChange={setPaymentTerms}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAYMENT_TERMS.map((t) => (
              <SelectItem key={t} value={t}>{tx(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t("dm.remarks")}>
        <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={t("dm.optional_notes")} rows={2} />
      </Field>

      {selectedUnit && (
        <p className="text-xs text-muted-foreground">
          List price {formatPkr(selectedUnit.price)} · {selectedUnit.sizeMarla} Marla · {selectedUnit.category}
        </p>
      )}
    </FormDialog>
  );
}
