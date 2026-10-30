"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { FileSignature } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Contract, ContractStatus } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import { tx } from "@/lib/i18n/runtime";

const CONTRACT_TYPES = ["Sale Agreement", "Lease Agreement", "Dealer Agreement", "Vendor Contract"] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function NewContractDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();

  const [type, setType] = React.useState<string>("");
  const [partyName, setPartyName] = React.useState("");
  const [startDate, setStartDate] = React.useState(today());
  const [endDate, setEndDate] = React.useState("");
  const [value, setValue] = React.useState("");

  function resetForm() {
    setType("");
    setPartyName("");
    setStartDate(today());
    setEndDate("");
    setValue("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const days = differenceInCalendarDays(new Date(endDate), new Date());
    let status: ContractStatus = "active";
    if (days < 0) status = "expired";
    else if (days < 30) status = "expiring";

    const title = `${type} #${1100 + Math.floor(Math.random() * 900)}`;
    const newContract: Contract = {
      id: `contract-${Date.now()}`,
      title,
      type,
      partyName,
      startDate,
      endDate,
      status,
      value: Number(value) || 0,
    };

    queryClient.setQueryData<Contract[]>(["contracts"], (old = []) => [newContract, ...old]);
    toast.success(`${title} created`, { description: `Party: ${partyName}` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={FileSignature}
      title={t("dm.new_contract")}
      description={t("dm.draft_a_sale_lease_or")}
      submitLabel={t("dm.create_contract")}
      submitDisabled={!type || !partyName || !endDate || !value}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label={t("leave.col.type")}>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("dm.select_type")} /></SelectTrigger>
            <SelectContent>
              {CONTRACT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{tx(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("dm.party_name")}>
          <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder={t("auth.field.namePlaceholder")} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={t("dm.start_date")}>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label={t("dm.end_date")}>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label={t("dm.contract_value_pkr")}>
        <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="2500000" />
      </Field>
    </FormDialog>
  );
}
