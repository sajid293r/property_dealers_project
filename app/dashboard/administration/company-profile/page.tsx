"use client";

import { ClipboardList as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import * as React from "react";
import { Building2, ImageUp, Languages, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory"] as const;
const BUSINESS_TYPES = ["Independent dealer", "Agency", "Developer / housing scheme", "Dealer network"] as const;

export default function CompanyProfilePage() {
  const [bilingual, setBilingual] = React.useState(false);
  const [whatsappFirst, setWhatsappFirst] = React.useState(true);

  function handleSave() {
    toast.success("Company profile saved");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="Administration"
        title="Company Profile"
        description="How your business appears across vouchers, contracts and exported reports"
      />

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ImageUp className="size-4" />
          </div>
          <h3 className="font-heading text-base font-semibold">Branding</h3>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground">
            <Building2 className="size-6" />
          </div>
          <div className="flex-1">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info("Logo upload is mocked in this prototype")}>
              <ImageUp className="size-3.5" />
              Upload logo
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">PNG or SVG, at least 256×256px. Used on PDFs and vouchers.</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <h3 className="font-heading text-base font-semibold">Business details</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Legal company name" defaultValue="Al-Noor Estate Advisors" />
          <Field label="Display name" defaultValue="Al-Noor Estates" />
          <div>
            <Label className="mb-2 text-xs font-medium text-muted-foreground">Business type</Label>
            <Select defaultValue={BUSINESS_TYPES[1]}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="NTN" defaultValue="1234567-8" />
          <Field label="Phone" defaultValue="042-111-000-999" />
          <Field label="Email" defaultValue="info@alnoorestates.pk" type="email" />
          <Field label="Website" defaultValue="alnoorestates.pk" className="sm:col-span-2" />
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin className="size-4" />
          </div>
          <h3 className="font-heading text-base font-semibold">Registered address</h3>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Address" defaultValue="Plot 12, MM Alam Road" className="sm:col-span-2" />
          <Field label="City" defaultValue="Lahore" />
          <div>
            <Label className="mb-2 text-xs font-medium text-muted-foreground">Province</Label>
            <Select defaultValue={PROVINCES[0]}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVINCES.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Languages className="size-4" />
          </div>
          <h3 className="font-heading text-base font-semibold">Regional &amp; localization</h3>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3.5">
          <div>
            <p className="text-sm font-medium">Currency</p>
            <p className="text-xs text-muted-foreground">Pakistani Rupee (PKR) — fixed for this market</p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">Rs</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3.5">
          <div>
            <p className="text-sm font-medium">Bilingual data entry</p>
            <p className="text-xs text-muted-foreground">Show Urdu fields alongside English across forms</p>
          </div>
          <Switch checked={bilingual} onCheckedChange={setBilingual} />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3.5">
          <div>
            <p className="text-sm font-medium">WhatsApp-first reminders</p>
            <p className="text-xs text-muted-foreground">Prefer WhatsApp over SMS for installment &amp; follow-up alerts</p>
          </div>
          <Switch checked={whatsappFirst} onCheckedChange={setWhatsappFirst} />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save changes</Button>
      </div>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  className,
  type = "text",
}: {
  label: string;
  defaultValue: string;
  className?: string;
  type?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 text-xs font-medium text-muted-foreground">{label}</Label>
      <Input type={type} defaultValue={defaultValue} />
    </div>
  );
}
