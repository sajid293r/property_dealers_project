"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUnits, useCustomers } from "@/lib/hooks/use-data";
import { formatPkr } from "@/lib/format";
import type { Deal, Unit } from "@/lib/types";
import { toast } from "sonner";

export function NewBookingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: units } = useUnits();
  const { data: customers } = useCustomers();

  const [customerId, setCustomerId] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [advance, setAdvance] = React.useState("");

  const availableUnits = React.useMemo(() => (units ?? []).filter((u) => u.status === "available"), [units]);
  const selectedUnit = units?.find((u) => u.id === unitId);

  function resetForm() {
    setCustomerId("");
    setUnitId("");
    setAdvance("");
  }

  // Reset on close (an event, not an effect) so the form is fresh next time it opens.
  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleUnitChange(id: string) {
    setUnitId(id);
    const unit = units?.find((u) => u.id === id);
    if (unit) setAdvance(Math.round(unit.price * 0.2).toString());
  }

  function handleSubmit() {
    if (!selectedUnit) return;
    const customer = customers?.find((c) => c.id === customerId);
    // Only ever invoked from the submit button (an event, not render) — id/voucher
    // generation here is intentionally impure.
    // eslint-disable-next-line react-hooks/purity
    const voucherNo = `VCH-${Math.floor(1000 + Math.random() * 8999)}`;
    const newDeal: Deal = {
      // eslint-disable-next-line react-hooks/purity
      id: `deal-${Date.now()}`,
      voucherNo,
      unitId: selectedUnit.id,
      customerId,
      totalAmount: selectedUnit.price,
      paidAmount: Number(advance) || 0,
      status: "pending",
      paymentType: selectedUnit.paymentType,
      createdAt: new Date().toISOString().slice(0, 10),
      installments: [],
    };

    queryClient.setQueryData<Deal[]>(["deals"], (old = []) => [newDeal, ...old]);
    queryClient.setQueryData<Unit[]>(["units"], (old = []) =>
      old.map((u) => (u.id === selectedUnit.id ? { ...u, status: "reserved" as const } : u)),
    );

    toast.success(`Booking ${voucherNo} created`, {
      description: `${selectedUnit.code} reserved for ${customer?.name ?? "customer"}.`,
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Handshake}
      title="New Booking"
      description="Reserve a unit and record the advance payment."
      submitLabel="Create Booking"
      submitDisabled={!customerId || !unitId || !advance}
      onSubmit={handleSubmit}
    >
      <Field label="Customer">
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select a customer" /></SelectTrigger>
          <SelectContent>
            {customers?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name} · {c.phone}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Unit">
        <Select value={unitId} onValueChange={handleUnitChange}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select an available unit" /></SelectTrigger>
          <SelectContent>
            {availableUnits.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.code} · {u.project} · {formatPkr(u.price, { compact: true })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {selectedUnit && (
        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-sm">
          <div>
            <p className="font-medium">{selectedUnit.title}</p>
            <p className="text-xs text-muted-foreground">{selectedUnit.sizeMarla} Marla · {selectedUnit.category}</p>
          </div>
          <Badge variant="outline" className="capitalize">{selectedUnit.paymentType}</Badge>
        </div>
      )}

      <FieldRow>
        <Field label="Total amount">
          <Input disabled value={selectedUnit ? formatPkr(selectedUnit.price) : "—"} />
        </Field>
        <Field label="Advance / booking amount">
          <Input
            type="number"
            value={advance}
            onChange={(e) => setAdvance(e.target.value)}
            placeholder="500000"
          />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
