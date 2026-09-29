"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HardHat } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContractors, useConstructionContracts } from "@/lib/hooks/use-data";
import { dateOffsetFromToday } from "@/lib/format";
import type { ConstructionContract } from "@/lib/types";
import { toast } from "sonner";

export function AssignContractorDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const { data: contractors } = useContractors();
  const { data: contracts } = useConstructionContracts();

  const [contractorId, setContractorId] = React.useState("");
  const [scopeOfWork, setScopeOfWork] = React.useState("");
  const [contractValue, setContractValue] = React.useState("");
  const [retentionPercent, setRetentionPercent] = React.useState("10");
  const [startDate, setStartDate] = React.useState(() => dateOffsetFromToday(7));
  const [endDate, setEndDate] = React.useState(() => dateOffsetFromToday(120));

  function resetForm() {
    setContractorId("");
    setScopeOfWork("");
    setContractValue("");
    setRetentionPercent("10");
    setStartDate(dateOffsetFromToday(7));
    setEndDate(dateOffsetFromToday(120));
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const maxSeq = (contracts ?? []).reduce((max, c) => {
      const seq = Number(c.number.split("-")[1]);
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
    const number = `CC-${String(maxSeq + 1).padStart(3, "0")}`;
    const today = new Date().toISOString().slice(0, 10);

    const newContract: ConstructionContract = {
      id: `cc-${Date.now()}`,
      number,
      projectId,
      contractorId,
      scopeOfWork,
      contractValue: Number(contractValue) || 0,
      paidAmount: 0,
      retentionPercent: Number(retentionPercent) || 0,
      startDate,
      endDate,
      status: "active",
      progressPercent: 0,
      createdAt: today,
    };

    queryClient.setQueryData<ConstructionContract[]>(["constructionContracts"], (old = []) => [newContract, ...old]);
    const contractor = contractors?.find((c) => c.id === contractorId);
    toast.success(`${number} — ${contractor?.companyName} assigned`, { description: scopeOfWork });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={HardHat}
      title="Assign Contractor"
      description="Bring a contractor onto this project with a scoped contract."
      submitLabel="Assign Contractor"
      submitDisabled={!contractorId || !scopeOfWork || !contractValue}
      onSubmit={handleSubmit}
    >
      <Field label="Contractor">
        <Select value={contractorId} onValueChange={setContractorId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select contractor" /></SelectTrigger>
          <SelectContent>
            {contractors?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.companyName} — {c.trade}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Scope of work">
        <Textarea value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)} placeholder="Civil works — Block D" rows={2} />
      </Field>

      <FieldRow>
        <Field label="Contract value (PKR)">
          <Input type="number" value={contractValue} onChange={(e) => setContractValue(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Retention %">
          <Input type="number" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} placeholder="10" />
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
    </FormDialog>
  );
}
