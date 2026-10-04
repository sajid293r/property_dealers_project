"use client";

import * as React from "react";
import { Building } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/lib/providers/company-provider";
import { toast } from "sonner";

const CITIES = ["Lahore", "Islamabad", "Rawalpindi", "Karachi", "Faisalabad", "Multan", "Gujranwala"] as const;
const TYPES = ["Real estate agency", "Housing scheme developer", "Dealer network", "Construction company"] as const;

export function NewCompanyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addCompany, setCompanyId } = useCompany();
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [industry, setIndustry] = React.useState<string>(TYPES[0]);
  const [ntn, setNtn] = React.useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName("");
      setCity("");
      setIndustry(TYPES[0]);
      setNtn("");
    }
    onOpenChange(next);
  }

  function handleSubmit() {
    const created = addCompany({ name, city, industry, ntn });
    setCompanyId(created.id);
    toast.success(`${name} created`, {
      description: "A fresh, empty workspace — its data stays separate from your other companies.",
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Building}
      title="Add a company"
      description="Create a separate workspace with its own projects, properties, people and books."
      submitLabel="Create company"
      submitDisabled={!name.trim() || !city}
      onSubmit={handleSubmit}
    >
      <Field label="Company name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skyline Developers (Pvt) Ltd" />
      </Field>
      <FieldRow>
        <Field label="City">
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select city" /></SelectTrigger>
            <SelectContent>
              {CITIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="NTN (optional)">
          <Input value={ntn} onChange={(e) => setNtn(e.target.value)} placeholder="1234567-8" />
        </Field>
      </FieldRow>
      <Field label="Business type">
        <Select value={industry} onValueChange={setIndustry}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FormDialog>
  );
}
