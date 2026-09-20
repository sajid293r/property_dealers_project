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
import { useUnits } from "@/lib/hooks/use-data";
import type { Unit, UnitPaymentType } from "@/lib/types";
import { toast } from "sonner";

const CATEGORIES = ["Residential Plot", "Commercial Plot", "House", "Apartment"] as const;
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80";

export function NewUnitDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: units } = useUnits();

  const projects = React.useMemo(() => Array.from(new Set((units ?? []).map((u) => u.project))), [units]);

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

  function handleSubmit() {
    const code = `UNT-${Math.floor(1000 + Math.random() * 8999)}`;
    const newUnit: Unit = {
      id: `unit-${Date.now()}`,
      code,
      title: title || `Plot ${code.replace("UNT-", "")}`,
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
    toast.success(`Unit ${code} added`, { description: `${newUnit.title} · ${project}` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Building2}
      title="Add Unit"
      description="List a new plot or property in your inventory."
      submitLabel="Add Unit"
      submitDisabled={!project || !category || !sizeMarla || !price}
      onSubmit={handleSubmit}
    >
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Corner plot, Block A" />
      </Field>

      <FieldRow>
        <Field label="Project">
          <Select value={project} onValueChange={setProject}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Block">
          <Input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="A" maxLength={2} />
        </Field>
        <Field label="Size (Marla)">
          <Input type="number" value={sizeMarla} onChange={(e) => setSizeMarla(e.target.value)} placeholder="10" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Price (PKR)">
          <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15000000" />
        </Field>
        <Field label="Payment type">
          <Select value={paymentType} onValueChange={(v) => setPaymentType(v as UnitPaymentType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="installment">Installment</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
