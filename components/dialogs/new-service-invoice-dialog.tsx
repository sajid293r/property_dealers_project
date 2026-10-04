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

export function NewServiceInvoiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
      title="New Service Invoice"
      description="Bill a property owner for maintenance, security or development charges."
      submitLabel="Create Invoice"
      submitDisabled={!customerId || !period || !amount}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label="Customer">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>
              {customers?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Property (optional)">
          <Select value={unitId} onValueChange={setUnitId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              {units?.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.code} — {u.project}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Service type">
          <Select value={serviceType} onValueChange={(v) => setServiceType(v as ServiceType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Billing period">
          <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="October 2026" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Amount (PKR)">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
