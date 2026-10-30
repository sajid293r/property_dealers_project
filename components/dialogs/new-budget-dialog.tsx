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
import { useT } from "@/lib/i18n/provider";

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
  const t = useT();
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
    toast.success(t("dm.bud.created_draft", { name }), { description: t("dm.bud.split") });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={PiggyBank}
      title={t("bud.new")}
      description={t("dm.set_a_spending_limit_before")}
      submitLabel={t("rec.st.dlgSubmit")}
      submitDisabled={amount <= 0 || (kind === "project" && !projectId)}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label={t("dm.budget_type")}>
          <Select value={kind} onValueChange={(v) => setKind(v as BudgetKind)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="project">{t("dm.project_lifetime_cost")}</SelectItem>
              <SelectItem value="operating">{t("dm.operating_fiscal_year")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("dm.control_mode")}>
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
        <Field label={t("audit.entity.projects")}>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={available.length ? t("dm.bud.select_project") : t("dm.bud.every_project")} />
            </SelectTrigger>
            <SelectContent>
              {available.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field label={t("dm.total_budget_pkr")}>
        <Input
          inputMode="numeric"
          value={total ? Number(total.replace(/[^0-9]/g, "")).toLocaleString("en-PK") : ""}
          onChange={(e) => setTotal(e.target.value)}
          placeholder={project ? formatPkr(project.budget) : "e.g. 250,000,000"}
        />
      </Field>

      {amount > 0 && (
        <div className="rounded-lg bg-secondary/50 p-3 text-xs">
          <p className="mb-1.5 font-medium">{t("dm.starting_split_editable_afterwards")}</p>
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
