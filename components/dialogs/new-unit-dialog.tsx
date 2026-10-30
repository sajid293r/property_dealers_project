"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects, usePropertyTypes, useUnits } from "@/lib/hooks/use-data";
import { useCompany } from "@/lib/providers/company-provider";
import { createProperty } from "@/lib/api/live";
import type { Unit, UnitPaymentType } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80";

export function NewUnitDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const { company, live } = useCompany();
  const { data: units } = useUnits();
  const { data: realProjects } = useProjects();
  const { data: types } = usePropertyTypes();

  // real company: choose from its projects (by id); demo: the project names already on the sample properties
  const projectOptions = React.useMemo(
    () =>
      live
        ? (realProjects ?? []).map((p) => ({ value: p.id, label: p.name }))
        : Array.from(new Set((units ?? []).map((u) => u.project))).map((name) => ({ value: name, label: name })),
    [live, realProjects, units],
  );
  const categoryOptions = React.useMemo(() => (types ?? []).map((t) => ({ value: t.id, label: t.name })), [types]);

  const [title, setTitle] = React.useState("");
  const [project, setProject] = React.useState("");
  const [category, setCategory] = React.useState<string>("");
  const [block, setBlock] = React.useState("");
  const [sizeMarla, setSizeMarla] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [paymentType, setPaymentType] = React.useState<UnitPaymentType>("installment");

  function resetForm() {
    setTitle("");
    setProject("");
    setCategory("");
    setBlock("");
    setSizeMarla("");
    setPrice("");
    setPaymentType("installment");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (live) {
      const typeName = categoryOptions.find((c) => c.value === category)?.label ?? t("properties.new.defaultType");
      const created = await createProperty(company.id, {
        title: title.trim() || (block.trim() ? t("properties.new.defaultTitle", { type: typeName, block: block.trim() }) : typeName),
        typeId: category,
        projectId: project,
        block: block.trim() || undefined,
        listPrice: price,
        size: { value: Number(sizeMarla), unit: "marla" },
        installmentsAvailable: paymentType === "installment",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["units"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      toast.success(t("properties.new.added", { code: created.code }), { description: `${created.title} · ${created.project}` });
      return;
    }
    const code = `PRP-${Math.floor(1000 + Math.random() * 8999)}`;
    const newUnit: Unit = {
      id: `unit-${Date.now()}`,
      code,
      title: title || `Plot ${code.replace("PRP-", "")}`,
      project,
      category,
      sizeMarla: Number(sizeMarla) || 0,
      sqft: (Number(sizeMarla) || 0) * 272,
      price: Number(price) || 0,
      status: "available",
      paymentType,
      block: block.toUpperCase() || "A",
      imageUrl: FALLBACK_IMAGE,
    };

    queryClient.setQueryData<Unit[]>(["units"], (old = []) => [newUnit, ...old]);
    toast.success(t("properties.new.added", { code }), { description: `${newUnit.title} · ${project}` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Building2}
      title={t("properties.new.title")}
      description={t("properties.new.description")}
      submitLabel={t("properties.new.submit")}
      submitDisabled={!project || !category || !sizeMarla || !price}
      onSubmit={handleSubmit}
    >
      <Field label={t("properties.new.name")}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Corner plot, Block A" />
      </Field>

      {live && projectOptions.length === 0 && (
        <p className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
          {t("properties.new.createProjectFirst")}
        </p>
      )}

      <FieldRow>
        <Field label={t("properties.new.project")}>
          <Select value={project} onValueChange={setProject}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("properties.new.selectProject")} /></SelectTrigger>
            <SelectContent>
              {projectOptions.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("properties.new.category")}>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("properties.new.selectCategory")} /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={t("properties.new.block")}>
          <Input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="A" maxLength={live ? 60 : 2} />
        </Field>
        <Field label={t("properties.new.size")}>
          <Input type="number" value={sizeMarla} onChange={(e) => setSizeMarla(e.target.value)} placeholder="10" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={t("properties.new.price")}>
          <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15000000" />
        </Field>
        <Field label={t("properties.new.paymentType")}>
          <Select value={paymentType} onValueChange={(v) => setPaymentType(v as UnitPaymentType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">{t("properties.new.cash")}</SelectItem>
              <SelectItem value="installment">{t("properties.new.installment")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
