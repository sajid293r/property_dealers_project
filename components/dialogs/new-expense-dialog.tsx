"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
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
import type { Expense } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

const EXPENSE_TYPES = ["Utility", "Rent", "Marketing", "Maintenance", "Travel", "Office Supplies"] as const;

export function NewExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { data: accounts } = useAccounts();

  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<string>("");
  const [amount, setAmount] = React.useState("");
  const [paidVia, setPaidVia] = React.useState("");
  const [status, setStatus] = React.useState<"paid" | "unpaid">("unpaid");

  function resetForm() {
    setTitle("");
    setType("");
    setAmount("");
    setPaidVia("");
    setStatus("unpaid");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      title: title || type,
      type,
      amount: Number(amount) || 0,
      paidVia,
      status,
      date: new Date().toISOString().slice(0, 10),
    };

    queryClient.setQueryData<Expense[]>(["expenses"], (old = []) => [newExpense, ...old]);
    toast.success(t("dm.exp.recorded", { title: newExpense.title }));
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Receipt}
      title={t("dm.new_expense")}
      description={t("dm.log_a_bill_or_voucher")}
      submitLabel={t("dm.add_expense")}
      submitDisabled={!type || !amount || !paidVia}
      onSubmit={handleSubmit}
    >
      <Field label={t("properties.new.name")}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("dm.facebook_ads_september")} />
      </Field>

      <FieldRow>
        <Field label={t("leave.col.type")}>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("dm.select_type")} /></SelectTrigger>
            <SelectContent>
              {EXPENSE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("dm.amount_pkr")}>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25000" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={t("dm.paid_via")}>
          <Select value={paidVia} onValueChange={setPaidVia}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("dm.select_account")} /></SelectTrigger>
            <SelectContent>
              {accounts?.map((a) => (
                <SelectItem key={a.id} value={a.title}>{a.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("common.status")}>
          <Select value={status} onValueChange={(v) => setStatus(v as "paid" | "unpaid")}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unpaid">{t("sinv.status.unpaid")}</SelectItem>
              <SelectItem value="paid">{t("deals.col.paid")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
