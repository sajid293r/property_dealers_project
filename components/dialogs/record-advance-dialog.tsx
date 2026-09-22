"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { FormDialog, Field } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaff, useAccounts } from "@/lib/hooks/use-data";
import { formatPkr } from "@/lib/format";
import type { StaffMember, Account, Transaction } from "@/lib/types";
import { toast } from "sonner";

export function RecordAdvanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: staff } = useStaff();
  const { data: accounts } = useAccounts();

  const [staffId, setStaffId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");

  const member = staff?.find((s) => s.id === staffId);
  const cashAccount = accounts?.find((a) => a.code === "AC-001") ?? accounts?.[0];

  function resetForm() {
    setStaffId("");
    setAmount("");
    setNote("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    if (!member || !cashAccount) return;
    const value = Number(amount) || 0;

    queryClient.setQueryData<StaffMember[]>(["staff"], (old = []) =>
      old.map((s) => (s.id === member.id ? { ...s, balance: s.balance + value } : s)),
    );
    queryClient.setQueryData<Account[]>(["accounts"], (old = []) =>
      old.map((a) => (a.id === cashAccount.id ? { ...a, balance: a.balance - value } : a)),
    );
    queryClient.setQueryData<Transaction[]>(["transactions"], (old = []) => [
      {
        id: `txn-${Date.now()}`,
        accountId: cashAccount.id,
        kind: "debit",
        amount: value,
        title: note || `Advance — ${member.name}`,
        category: "Salary",
        date: new Date().toISOString().slice(0, 10),
        confirmed: true,
      },
      ...old,
    ]);

    toast.success(`${formatPkr(value)} advance recorded for ${member.name}`, {
      description: "Added to their outstanding balance",
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={HandCoins}
      title="Record Advance"
      description="Give a staff loan or advance against next payroll."
      submitLabel="Record Advance"
      submitDisabled={!staffId || !amount}
      onSubmit={handleSubmit}
    >
      <Field label="Staff member">
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select staff" /></SelectTrigger>
          <SelectContent>
            {staff?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} · {s.department}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Amount (PKR)">
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="20000" />
      </Field>

      {member && amount && (
        <p className="text-xs text-muted-foreground">
          New outstanding balance: <span className="font-medium text-foreground">{formatPkr(member.balance + (Number(amount) || 0))}</span>
        </p>
      )}

      <Field label="Note (optional)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Medical advance" />
      </Field>
    </FormDialog>
  );
}
