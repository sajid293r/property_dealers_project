"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/lib/hooks/use-data";
import { formatPkr } from "@/lib/format";
import type { Account, Transaction } from "@/lib/types";
import { toast } from "sonner";

export function TransferPaymentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: accounts } = useAccounts();

  const [fromId, setFromId] = React.useState("");
  const [toId, setToId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [title, setTitle] = React.useState("");

  const fromAccount = accounts?.find((a) => a.id === fromId);
  const toAccount = accounts?.find((a) => a.id === toId);

  function resetForm() {
    setFromId("");
    setToId("");
    setAmount("");
    setTitle("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    if (!fromAccount || !toAccount) return;
    const value = Number(amount) || 0;
    const today = new Date().toISOString().slice(0, 10);
    const label = title || `Transfer to ${toAccount.title}`;

    const debit: Transaction = {
      id: `txn-${Date.now()}-d`,
      accountId: fromAccount.id,
      kind: "debit",
      amount: value,
      title: label,
      category: "Transfer",
      date: today,
      confirmed: true,
    };
    const credit: Transaction = {
      id: `txn-${Date.now()}-c`,
      accountId: toAccount.id,
      kind: "credit",
      amount: value,
      title: `Transfer from ${fromAccount.title}`,
      category: "Transfer",
      date: today,
      confirmed: true,
    };

    queryClient.setQueryData<Transaction[]>(["transactions"], (old = []) => [debit, credit, ...old]);
    queryClient.setQueryData<Account[]>(["accounts"], (old = []) =>
      old.map((a) => {
        if (a.id === fromAccount.id) return { ...a, balance: a.balance - value };
        if (a.id === toAccount.id) return { ...a, balance: a.balance + value };
        return a;
      }),
    );

    toast.success(`${formatPkr(value)} transferred`, {
      description: `${fromAccount.title} → ${toAccount.title}`,
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={ArrowLeftRight}
      title="Transfer Payment"
      description="Move funds between your cash and bank accounts."
      submitLabel="Transfer"
      submitDisabled={!fromId || !toId || fromId === toId || !amount}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label="From account">
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              {accounts?.map((a) => (
                <SelectItem key={a.id} value={a.id} disabled={a.id === toId}>
                  {a.title} · {formatPkr(a.balance, { compact: true })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="To account">
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Destination" /></SelectTrigger>
            <SelectContent>
              {accounts?.map((a) => (
                <SelectItem key={a.id} value={a.id} disabled={a.id === fromId}>
                  {a.title} · {formatPkr(a.balance, { compact: true })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <Field label="Amount (PKR)">
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100000" />
      </Field>

      <Field label="Description (optional)">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Petty cash top-up" />
      </Field>
    </FormDialog>
  );
}
