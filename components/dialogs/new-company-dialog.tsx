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
import { useT } from "@/lib/i18n/provider";

const CITIES = ["Lahore", "Islamabad", "Rawalpindi", "Karachi", "Faisalabad", "Multan", "Gujranwala"] as const;
const TYPES = ["Real estate agency", "Housing scheme developer", "Dealer network", "Construction company"] as const;

export function NewCompanyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
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
        ? t("dm.co.sample_desc")
        : t("dm.co.empty_desc"),
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Building}
      title={t("shell.company.add")}
      description={t("dm.create_a_separate_workspace_with")}
      submitLabel={t("dm.create_company")}
      submitDisabled={!name.trim() || !city}
      onSubmit={handleSubmit}
    >
      <Field label={t("adm.profile.name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("dm.skyline_developers_pvt_ltd")} />
      </Field>
      <FieldRow>
        <Field label={t("adm.profile.city")}>
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("customers.new.selectCity")} /></SelectTrigger>
            <SelectContent>
              {CITIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("customers.party.ntnOptional")}>
          <Input value={ntn} onChange={(e) => setNtn(e.target.value)} placeholder="1234567-8" />
        </Field>
      </FieldRow>
      <Field label={t("dm.business_type")}>
        <Select value={industry} onValueChange={setIndustry}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t("dm.start_with")}>
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t("dm.starting_data")}>
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
