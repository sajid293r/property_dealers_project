"use client";

import { LiveCompanyProfile } from "@/components/live/admin-live";

import { ClipboardList as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import * as React from "react";
import { ImageUp, Languages, MapPin } from "lucide-react";
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
import { useCompany } from "@/lib/providers/company-provider";
import { CompanyAvatar } from "@/components/company-avatar";
import { CompanyLanguageCard } from "@/components/live/company-language-card";
import { useT } from "@/lib/i18n/provider";

const PROVINCES = ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory"] as const;
const BUSINESS_TYPES = ["Independent dealer", "Agency", "Developer / housing scheme", "Dealer network"] as const;

function DemoCompanyProfilePage() {
  const t = useT();
  const { company } = useCompany();
  const [bilingual, setBilingual] = React.useState(false);
  const [whatsappFirst, setWhatsappFirst] = React.useState(true);

  function handleSave() {
    toast.success(t("adm.profile.saved"));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow={t("perm.module.administration")}
        title={t("nav.item.administration.company-profile")}
        description={t("dm.how_your_business_appears_across")}
      />

      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ImageUp className="size-4" />
          </div>
          <h3 className="font-heading text-base font-semibold">{t("dm.branding")}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <CompanyAvatar company={company} className="size-16 rounded-2xl text-xl" />
          <div className="flex-1">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info(t("dm.logo_upload_is_mocked_in"))}>
              <ImageUp className="size-3.5" />
              {t("dm.upload_logo")}
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">{t("dm.png_or_svg_at_least")}</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <h3 className="font-heading text-base font-semibold">{t("dm.business_details")}</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t("dm.legal_company_name")} defaultValue={company.name} />
          <Field label={t("dm.display_name")} defaultValue={company.shortName} />
          <div>
            <Label className="mb-2 text-xs font-medium text-muted-foreground">{t("dm.business_type")}</Label>
            <Select defaultValue={BUSINESS_TYPES[1]}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label={t("adm.profile.ntn")} defaultValue={company.ntn} />
          <Field label={t("common.phone")} defaultValue={company.phone} />
          <Field label={t("auth.field.email")} defaultValue={company.email} type="email" />
          <Field label={t("leads.source.website")} defaultValue={company.email.split("@")[1] ?? ""} className="sm:col-span-2" />
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin className="size-4" />
          </div>
          <h3 className="font-heading text-base font-semibold">{t("dm.registered_address")}</h3>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t("adm.profile.address")} defaultValue="Plot 12, MM Alam Road" className="sm:col-span-2" />
          <Field label={t("adm.profile.city")} defaultValue={company.city} />
          <div>
            <Label className="mb-2 text-xs font-medium text-muted-foreground">{t("dm.province")}</Label>
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
          <h3 className="font-heading text-base font-semibold">{t("dm.cp.regional")}</h3>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3.5">
          <div>
            <p className="text-sm font-medium">{t("dm.currency")}</p>
            <p className="text-xs text-muted-foreground">{t("dm.pakistani_rupee_pkr_fixed_for")}</p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{t("dm.rs")}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3.5">
          <div>
            <p className="text-sm font-medium">{t("dm.bilingual_data_entry")}</p>
            <p className="text-xs text-muted-foreground">{t("dm.show_urdu_fields_alongside_english")}</p>
          </div>
          <Switch checked={bilingual} onCheckedChange={setBilingual} />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3.5">
          <div>
            <p className="text-sm font-medium">{t("dm.whatsapp_first_reminders")}</p>
            <p className="text-xs text-muted-foreground">{t("dm.cp.whatsapp_hint")}</p>
          </div>
          <Switch checked={whatsappFirst} onCheckedChange={setWhatsappFirst} />
        </div>
      </Card>

      <CompanyLanguageCard />

      <div className="flex justify-end">
        <Button onClick={handleSave}>{t("adm.profile.saveChanges")}</Button>
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

export default function Page() {
  const { live } = useCompany();
  return live ? <LiveCompanyProfile /> : <DemoCompanyProfilePage />;
}
