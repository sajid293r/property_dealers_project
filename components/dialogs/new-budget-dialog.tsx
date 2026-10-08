"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PiggyBank } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects } from "@/lib/hooks/use-data";
import { BUDGET_FY, CONTROL_MODE_META, PROJECT_BUDGET_TEMPLATE, buildLinesFromTemplate } from "@/lib/budgets";
import { dateOffsetFromToday, formatPkr } from "@/lib/format";
import type { Budget, BudgetControlMode, BudgetKind, BudgetLine } from "@/lib/types";
import { toast } from "sonner";

export function NewBudgetDialog({
  open,
  onOpenChange,
  existingProjectIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Projects that already have a budget (one project budget per project). */
  existingProjectIds: string[];
}) {
  const queryClient = useQueryClient();
  const { data: projects } = useProjects();
  const [kind, setKind] = React.useState<BudgetKind>("project");
  const [projectId, setProjectId] = React.useState("");
  const [total, setTotal] = React.useState("");
  const [control, setControl] = React.useState<BudgetControlMode>("warn");

  const available = (projects ?? []).filter((p) => !existingProjectIds.includes(p.id));
  const project = projects?.find((p) => p.id === projectId);
  const amount = Number(total.replace(/[^0-9]/g, "")) || 0;

  function reset() {
    setKind("project");
    setProjectId("");
    setTotal("");
    setControl("warn");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit() {
    const id = `bud-${Date.now()}`;
    const name = kind === "project" ? `${project?.name ?? "Project"} — Project Budget` : `Operating Budget ${BUDGET_FY}`;
    const budget: Budget = {
      id,
      name,
      kind,
      projectId: kind === "project" ? projectId : undefined,
      fiscalYear: kind === "project" ? "Lifetime" : BUDGET_FY,
      status: "draft",
      controlMode: control,
      version: 1,
      createdBy: "You",
      createdAt: dateOffsetFromToday(0),
      revisions: [],
    };
    const lines: BudgetLine[] = buildLinesFromTemplate(id, amount);
    queryClient.setQueryData<Budget[]>(["budgets"], (old = []) => [budget, ...old]);
    queryClient.setQueryData<BudgetLine[]>(["budgetLines"], (old = []) => [...lines, ...old]);
    toast.success(`${name} created as a draft`, { description: "Split across standard categories — adjust the lines, then submit for approval." });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={PiggyBank}
      title="New budget"
      description="Set a spending limit before the money moves."
      submitLabel="Create draft"
      submitDisabled={amount <= 0 || (kind === "project" && !projectId)}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label="Budget type">
          <Select value={kind} onValueChange={(v) => setKind(v as BudgetKind)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Project (lifetime cost)</SelectItem>
              <SelectItem value="operating">Operating (fiscal year)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Control mode">
          <Select value={control} onValueChange={(v) => setControl(v as BudgetControlMode)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CONTROL_MODE_META) as BudgetControlMode[]).map((m) => (
                <SelectItem key={m} value={m}>{CONTROL_MODE_META[m].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>
      <p className="-mt-2 text-xs text-muted-foreground">{CONTROL_MODE_META[control].hint}.</p>

      {kind === "project" && (
        <Field label="Project">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={available.length ? "Select a project" : "Every project already has a budget"} />
            </SelectTrigger>
            <SelectContent>
              {available.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field label="Total budget (PKR)">
        <Input
          inputMode="numeric"
          value={total ? Number(total.replace(/[^0-9]/g, "")).toLocaleString("en-PK") : ""}
          onChange={(e) => setTotal(e.target.value)}
          placeholder={project ? formatPkr(project.budget) : "e.g. 250,000,000"}
        />
      </Field>

      {amount > 0 && (
        <div className="rounded-lg bg-secondary/50 p-3 text-xs">
          <p className="mb-1.5 font-medium">Starting split (editable afterwards)</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
            {PROJECT_BUDGET_TEMPLATE.map((t) => (
              <span key={t.category} className="flex justify-between">
                <span>{t.category}</span>
                <span className="tabular-nums text-foreground">{Math.round(t.share * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </FormDialog>
  );
}
