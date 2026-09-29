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
import { PROJECT_TYPES, nextProjectCode } from "@/lib/projects";
import { dateOffsetFromToday } from "@/lib/format";
import type { Project, ProjectType } from "@/lib/types";
import { toast } from "sonner";

const CITIES = ["Lahore", "Islamabad", "Rawalpindi", "Karachi", "Faisalabad"] as const;

export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
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

  function handleSubmit() {
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
    toast.success(`${code} — ${name} created`, { description: "Add units to it from Inventory once approvals are through." });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={FolderKanban}
      title="New Project"
      description="Open a new development scheme — units and contractors attach to it once it's live."
      submitLabel="Create Project"
      submitDisabled={!name || !address || !landAreaMarla || !projectManagerId || !budget}
      onSubmit={handleSubmit}
    >
      <Field label="Project name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Willow Park Residencia" />
      </Field>

      <FieldRow>
        <Field label="Type">
          <Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Project manager">
          <Select value={projectManagerId} onValueChange={setProjectManagerId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select staff" /></SelectTrigger>
            <SelectContent>
              {managers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="City">
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CITIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Land area (Marla)">
          <Input type="number" value={landAreaMarla} onChange={(e) => setLandAreaMarla(e.target.value)} placeholder="1200" />
        </Field>
      </FieldRow>

      <Field label="Address">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Main GT Road, near..." />
      </Field>

      <FieldRow>
        <Field label="Approved budget (PKR)">
          <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Planned start">
          <Input type="date" value={plannedStartDate} onChange={(e) => setPlannedStartDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Planned completion">
        <Input type="date" value={plannedEndDate} onChange={(e) => setPlannedEndDate(e.target.value)} />
      </Field>

      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this scheme is..." rows={2} />
      </Field>
    </FormDialog>
  );
}
