"use client";

import * as React from "react";
import { Building, DatabaseZap, FileX2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
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
  const [sample, setSample] = React.useState(true);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName("");
      setCity("");
      setIndustry(TYPES[0]);
      setNtn("");
      setSample(true);
    }
    onOpenChange(next);
  }

  function handleSubmit() {
    const created = addCompany({ name, city, industry, ntn, sample });
    setCompanyId(created.id);
    toast.success(`${name} created`, {
      description: sample
        ? "Filled with sample projects, properties and people so you can explore — its data stays separate from your other companies."
        : "A fresh, empty workspace — its data stays separate from your other companies.",
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
      <Field label="Start with">
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Starting data">
          {[
            { value: true, icon: DatabaseZap, title: "Sample data", text: "Explore with example projects, properties and people. Easy to tell apart from real records." },
            { value: false, icon: FileX2, title: "Empty workspace", text: "Start clean and add your own projects, properties and customers." },
          ].map((o) => (
            <button
              key={o.title}
              type="button"
              role="radio"
              aria-checked={sample === o.value}
              onClick={() => setSample(o.value)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-start transition-all hover:-translate-y-0.5",
                sample === o.value ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30" : "border-border/70 hover:border-gold/50",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold"><o.icon className="size-4 text-primary" />{o.title}</span>
              <span className="text-xs text-muted-foreground">{o.text}</span>
            </button>
          ))}
        </div>
      </Field>
    </FormDialog>
  );
}
