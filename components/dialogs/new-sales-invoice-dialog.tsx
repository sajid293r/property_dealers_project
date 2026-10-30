"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomers, useDeals, useSalesInvoices } from "@/lib/hooks/use-data";
import { PAYMENT_MODES, nextDocNumber } from "@/lib/sales";
import { dateOffsetFromToday } from "@/lib/format";
import type { SalesInvoice } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import { tx } from "@/lib/i18n/runtime";

export function NewSalesInvoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { data: customers } = useCustomers();
  const { data: deals } = useDeals();
  const { data: invoices } = useSalesInvoices();

  const [customerId, setCustomerId] = React.useState("");
  const [dealId, setDealId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [dueDate, setDueDate] = React.useState(() => dateOffsetFromToday(7));
  const [paymentMode, setPaymentMode] = React.useState<string>(PAYMENT_MODES[0]);

  const customerDeals = (deals ?? []).filter((d) => d.customerId === customerId);

  function resetForm() {
    setCustomerId("");
    setDealId("");
    setDescription("");
    setAmount("");
    setDueDate(dateOffsetFromToday(7));
    setPaymentMode(PAYMENT_MODES[0]);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const number = nextDocNumber("SINV", invoices ?? []);
    const today = new Date().toISOString().slice(0, 10);
    const newInvoice: SalesInvoice = {
      id: `sinv-${Date.now()}`,
      number,
      date: today,
      dueDate,
      customerId,
      dealId: dealId || undefined,
      description,
      amount: Number(amount) || 0,
      paymentMode,
      status: "unpaid",
      createdAt: today,
    };

    queryClient.setQueryData<SalesInvoice[]>(["salesInvoices"], (old = []) => [newInvoice, ...old]);
    toast.success(`${number} created`, { description: `Due ${dueDate}` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={ReceiptText}
      title={t("dm.new_sales_invoice")}
      description={t("dm.bill_a_customer_for_a")}
      submitLabel={t("dm.create_invoice")}
      submitDisabled={!customerId || !description || !amount}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label={t("common.customer")}>
          <Select
            value={customerId}
            onValueChange={(v) => {
              setCustomerId(v);
              setDealId("");
            }}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder={t("dm.select_customer")} /></SelectTrigger>
            <SelectContent>
              {customers?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("dm.related_deal_optional")}>
          <Select value={dealId} onValueChange={setDealId} disabled={!customerId}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("common.none")} /></SelectTrigger>
            <SelectContent>
              {customerDeals.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.voucherNo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <Field label={t("rec.st.colDescription")}>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("dm.installment_4_plot_prp_1042")} />
      </Field>

      <FieldRow>
        <Field label={t("dm.amount_pkr")}>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label={t("print.invoice.dueDate")}>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label={t("dm.payment_mode")}>
        <Select value={paymentMode} onValueChange={setPaymentMode}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAYMENT_MODES.map((m) => (
              <SelectItem key={m} value={m}>{tx(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FormDialog>
  );
}
