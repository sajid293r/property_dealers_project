"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomers, useUnits, useServiceInvoices } from "@/lib/hooks/use-data";
import { SERVICE_TYPES, nextDocNumber } from "@/lib/sales";
import { dateOffsetFromToday } from "@/lib/format";
import type { ServiceInvoice, ServiceType } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import { tx } from "@/lib/i18n/runtime";

export function NewServiceInvoiceDialog({
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
  const { data: invoices } = useServiceInvoices();

  const [customerId, setCustomerId] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [serviceType, setServiceType] = React.useState<ServiceType>("Maintenance");
  const [period, setPeriod] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [dueDate, setDueDate] = React.useState(() => dateOffsetFromToday(10));

  function resetForm() {
    setCustomerId("");
    setUnitId("");
    setServiceType("Maintenance");
    setPeriod("");
    setAmount("");
    setDueDate(dateOffsetFromToday(10));
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const number = nextDocNumber("SVC", invoices ?? []);
    const today = new Date().toISOString().slice(0, 10);
    const newInvoice: ServiceInvoice = {
      id: `svc-${Date.now()}`,
      number,
      date: today,
      dueDate,
      customerId,
      unitId: unitId || undefined,
      serviceType,
      period,
      amount: Number(amount) || 0,
      status: "unpaid",
      createdAt: today,
    };

    queryClient.setQueryData<ServiceInvoice[]>(["serviceInvoices"], (old = []) => [newInvoice, ...old]);
    toast.success(`${number} created`, { description: `${serviceType} · ${period}` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Wrench}
      title={t("dm.new_service_invoice")}
      description={t("dm.bill_a_property_owner_for")}
      submitLabel={t("dm.create_invoice")}
      submitDisabled={!customerId || !period || !amount}
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
        <Field label={t("dm.property_optional")}>
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("common.none")} /></SelectTrigger>
            <SelectContent>
              {units?.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.code} — {u.project}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={t("dm.service_type")}>
          <Select value={serviceType} onValueChange={(v) => setServiceType(v as ServiceType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{tx(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("dm.billing_period")}>
          <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder={t("sinv.new.periodPlaceholder")} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={t("dm.amount_pkr")}>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label={t("print.invoice.dueDate")}>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
