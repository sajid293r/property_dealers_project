"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderKanban } from "lucide-react";
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
import { useStaff, useProjects } from "@/lib/hooks/use-data";
import { useCompany } from "@/lib/providers/company-provider";
import { createProject } from "@/lib/api/live";
import { PROJECT_TYPES, nextProjectCode } from "@/lib/projects";
import { dateOffsetFromToday } from "@/lib/format";
import type { Project, ProjectType } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

const CITIES = ["Lahore", "Islamabad", "Rawalpindi", "Karachi", "Faisalabad"] as const;

export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { company, live } = useCompany();
  const { data: staff } = useStaff();
  const { data: projects } = useProjects();

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<ProjectType>("Residential");
  const [city, setCity] = React.useState<string>(CITIES[0]);
  const [address, setAddress] = React.useState("");
  const [landAreaMarla, setLandAreaMarla] = React.useState("");
  const [projectManagerId, setProjectManagerId] = React.useState("");
  const [budget, setBudget] = React.useState("");
  const [plannedStartDate, setPlannedStartDate] = React.useState(() => dateOffsetFromToday(14));
  const [plannedEndDate, setPlannedEndDate] = React.useState(() => dateOffsetFromToday(365));
  const [description, setDescription] = React.useState("");

  const managers = staff?.filter((s) => s.role === "manager" || s.role === "admin") ?? [];

  function resetForm() {
    setName("");
    setType("Residential");
    setCity(CITIES[0]);
    setAddress("");
    setLandAreaMarla("");
    setProjectManagerId("");
    setBudget("");
    setPlannedStartDate(dateOffsetFromToday(14));
    setPlannedEndDate(dateOffsetFromToday(365));
    setDescription("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (live) {
      const created = await createProject(company.id, {
        name: name.trim(),
        type: type === "Mixed-Use" ? "mixed_use" : (type.toLowerCase() as "residential" | "commercial"),
        city: city || undefined,
        address: address.trim() || undefined,
        description: description.trim() || undefined,
        landAreaMarla: Number(landAreaMarla) || undefined,
        approvedBudget: budget || "0",
        plannedStart: plannedStartDate || undefined,
        plannedEnd: plannedEndDate || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(t("projects.new.created", { code: created.code, name: created.name }), { description: t("projects.new.createdHintLive") });
      return;
    }
    const code = nextProjectCode(projects ?? []);
    const today = new Date().toISOString().slice(0, 10);
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      code,
      name,
      type,
      status: "planning",
      description,
      city,
      address,
      landAreaMarla: Number(landAreaMarla) || 0,
      projectManagerId,
      budget: Number(budget) || 0,
      plannedStartDate,
      plannedEndDate,
      createdAt: today,
    };

    queryClient.setQueryData<Project[]>(["projects"], (old = []) => [newProject, ...old]);
    toast.success(t("projects.new.created", { code, name }), { description: t("projects.new.createdHintDemo") });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={FolderKanban}
      title={t("projects.new.title")}
      description={t("projects.new.description")}
      submitLabel={t("projects.new.submit")}
      submitDisabled={!name || !address || !landAreaMarla || (!live && !projectManagerId) || !budget}
      onSubmit={handleSubmit}
    >
      <Field label={t("projects.new.name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Willow Park Residencia" />
      </Field>

      <FieldRow>
        <Field label={t("projects.new.type")}>
          <Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((pt) => (
                <SelectItem key={pt} value={pt}>{t(`projects.type.${pt}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {!live && (
          <Field label={t("projects.new.manager")}>
            <Select value={projectManagerId} onValueChange={setProjectManagerId}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("projects.new.selectStaff")} /></SelectTrigger>
              <SelectContent>
                {managers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </FieldRow>

      <FieldRow>
        <Field label={t("projects.new.city")}>
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CITIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("projects.new.land")}>
          <Input type="number" value={landAreaMarla} onChange={(e) => setLandAreaMarla(e.target.value)} placeholder="1200" />
        </Field>
      </FieldRow>

      <Field label={t("projects.new.address")}>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Main GT Road, near..." />
      </Field>

      <FieldRow>
        <Field label={t("projects.new.budget")}>
          <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
        </Field>
        <Field label={t("projects.new.start")}>
          <Input type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label={t("projects.new.end")}>
        <Input type="date" value={plannedEndDate} onChange={(e) => setPlannedEndDate(e.target.value)} />
      </Field>

      <Field label={t("projects.new.about")}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("projects.new.aboutPlaceholder")} rows={2} />
      </Field>
    </FormDialog>
  );
}
