"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomers, useDeals } from "@/lib/hooks/use-data";
import { PAKISTANI_BANKS } from "@/lib/sales";
import { dateOffsetFromToday } from "@/lib/format";
import type { PostDatedCheque } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

export function NewChequeDialog({
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

  const [customerId, setCustomerId] = React.useState("");
  const [dealId, setDealId] = React.useState("");
  const [chequeNo, setChequeNo] = React.useState("");
  const [bankName, setBankName] = React.useState<string>(PAKISTANI_BANKS[0]);
  const [amount, setAmount] = React.useState("");
  const [chequeDate, setChequeDate] = React.useState(() => dateOffsetFromToday(30));
  const [remarks, setRemarks] = React.useState("");

  const customerDeals = (deals ?? []).filter((d) => d.customerId === customerId);

  function resetForm() {
    setCustomerId("");
    setDealId("");
    setChequeNo("");
    setBankName(PAKISTANI_BANKS[0]);
    setAmount("");
    setChequeDate(dateOffsetFromToday(30));
    setRemarks("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const today = new Date().toISOString().slice(0, 10);
    const newCheque: PostDatedCheque = {
      id: `pdc-${Date.now()}`,
      chequeNo,
      bankName,
      amount: Number(amount) || 0,
      chequeDate,
      receivedDate: today,
      customerId,
      dealId: dealId || undefined,
      status: "in_hand",
      remarks,
    };

    queryClient.setQueryData<PostDatedCheque[]>(["postDatedCheques"], (old = []) => [newCheque, ...old]);
    toast.success(`Cheque #${chequeNo} recorded`, { description: `${bankName} · dated ${chequeDate}` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={CalendarClock}
      title={t("dm.record_post_dated_cheque")}
      description={t("dm.log_a_cheque_collected_from")}
      submitLabel={t("dm.save_cheque")}
      submitDisabled={!customerId || !chequeNo || !amount}
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

      <FieldRow>
        <Field label={t("dm.cheque_no")}>
          <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} placeholder="1234567" />
        </Field>
        <Field label={t("chq.csv.bank")}>
          <Select value={bankName} onValueChange={setBankName}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAKISTANI_BANKS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={t("dm.amount_pkr")}>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label={t("chq.csv.date")}>
          <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label={t("dm.remarks")}>
        <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={t("common.optional")} />
      </Field>
    </FormDialog>
  );
}
