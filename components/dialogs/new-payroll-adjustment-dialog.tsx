"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaff } from "@/lib/hooks/use-data";
import { ADJUSTMENT_TYPES, ALLOWANCE_CATEGORIES, DEDUCTION_REASONS } from "@/lib/payroll";
import { dateOffsetFromToday, formatPkr } from "@/lib/format";
import type { PayrollAdjustment, PayrollAdjustmentType } from "@/lib/types";
import { toast } from "sonner";

// Loans/advances move cash immediately via "Record Advance" — kept out of this
// generic dialog so there's exactly one path for giving staff a loan.
const CREATABLE_TYPES = ADJUSTMENT_TYPES.filter((t) => t.type !== "loan");

export function NewPayrollAdjustmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: staff } = useStaff();

  const [staffId, setStaffId] = React.useState("");
  const [type, setType] = React.useState<PayrollAdjustmentType>("allowance");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState<string>(ALLOWANCE_CATEGORIES[0]);
  const [effectiveDate, setEffectiveDate] = React.useState(() => dateOffsetFromToday(0));

  const member = staff?.find((s) => s.id === staffId);
  const presetReasons = type === "allowance" ? ALLOWANCE_CATEGORIES : type === "deduction" ? DEDUCTION_REASONS : null;
  const isIncrement = type === "increment";

  function resetForm() {
    setStaffId("");
    setType("allowance");
    setAmount("");
    setReason(ALLOWANCE_CATEGORIES[0]);
    setEffectiveDate(dateOffsetFromToday(0));
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleTypeChange(next: PayrollAdjustmentType) {
    setType(next);
    setReason(next === "allowance" ? ALLOWANCE_CATEGORIES[0] : next === "deduction" ? DEDUCTION_REASONS[0] : "");
  }

  function handleSubmit() {
    if (!member) return;
    const value = Number(amount) || 0;
    const today = new Date().toISOString().slice(0, 10);
    const id = `padj-${Date.now()}`;
    const finalReason = reason.trim() || (isIncrement ? "Annual performance review" : "Other");

    const newAdjustment: PayrollAdjustment = {
      id,
      staffId,
      type,
      amount: value,
      reason: finalReason,
      effectiveDate,
      status: "pending",
      previousSalary: isIncrement ? member.salary : undefined,
      newSalary: isIncrement ? member.salary + value : undefined,
      createdBy: "You",
      createdAt: today,
    };

    queryClient.setQueryData<PayrollAdjustment[]>(["payrollAdjustments"], (old = []) => [newAdjustment, ...old]);
    toast.success(`${ADJUSTMENT_TYPES.find((t) => t.type === type)?.label} recorded for ${member.name}`, {
      description: "Awaiting approval",
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Gift}
      title="New Payroll Adjustment"
      description="Raise an increment, allowance or deduction for approval."
      submitLabel="Submit for Approval"
      submitDisabled={!staffId || !amount}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label="Staff member">
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select staff" /></SelectTrigger>
            <SelectContent>
              {staff?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name} · {s.department}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Type">
          <Select value={type} onValueChange={(v) => handleTypeChange(v as PayrollAdjustmentType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CREATABLE_TYPES.map((t) => (
                <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={type === "increment" ? "Increase (PKR)" : "Amount (PKR)"}>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Effective date">
          <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </Field>
      </FieldRow>

      {presetReasons ? (
        <Field label="Reason">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {presetReasons.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Annual performance review" />
        </Field>
      )}

      {isIncrement && amount && (
        <p className="text-xs text-muted-foreground">
          This raises {member?.name ?? "their"} salary by{" "}
          <span className="font-medium text-foreground">{formatPkr(Number(amount) || 0)}</span> once approved.
        </p>
      )}
    </FormDialog>
  );
}
