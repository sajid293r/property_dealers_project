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
      title="New Contract"
      description="Draft a sale, lease or dealer agreement."
      submitLabel="Create Contract"
      submitDisabled={!type || !partyName || !endDate || !value}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label="Type">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {CONTRACT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Party name">
          <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Ahmed Khan" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Start date">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End date">
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Contract value (PKR)">
        <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="2500000" />
      </Field>
    </FormDialog>
  );
}
