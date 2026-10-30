"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HardHat } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTRACTOR_TRADES } from "@/lib/projects";
import type { Contractor, ContractorTrade } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

export function NewContractorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [trade, setTrade] = React.useState<ContractorTrade>(CONTRACTOR_TRADES[0]);
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [cnicOrNtn, setCnicOrNtn] = React.useState("");
  const [address, setAddress] = React.useState("");

  function resetForm() {
    setName("");
    setCompanyName("");
    setTrade(CONTRACTOR_TRADES[0]);
    setPhone("");
    setEmail("");
    setCnicOrNtn("");
    setAddress("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const newContractor: Contractor = {
      id: `ctr-${Date.now()}`,
      name,
      companyName: companyName || name,
      trade,
      phone,
      email,
      cnicOrNtn,
      address,
      rating: 4,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    queryClient.setQueryData<Contractor[]>(["contractors"], (old = []) => [newContractor, ...old]);
    toast.success(t("dm.contractor.added", { name: newContractor.companyName }));
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={HardHat}
      title={t("dm.add_contractor")}
      description={t("dm.bring_a_construction_vendor_into")}
      submitLabel={t("dm.add_contractor")}
      submitDisabled={!name || !phone || !cnicOrNtn}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label={t("dm.contact_name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("dm.imran_sheikh")} />
        </Field>
        <Field label={t("adm.profile.name")}>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t("dm.sheikh_builders")} />
        </Field>
      </FieldRow>

      <Field label={t("dm.trade")}>
        <Select value={trade} onValueChange={(v) => setTrade(v as ContractorTrade)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CONTRACTOR_TRADES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <FieldRow>
        <Field label={t("common.phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03001234567" />
        </Field>
        <Field label={t("auth.field.email")}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@company.pk" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={t("dm.cnic_ntn")}>
          <Input value={cnicOrNtn} onChange={(e) => setCnicOrNtn(e.target.value)} placeholder="35201-1234567-1" />
        </Field>
        <Field label={t("dm.city_address")}>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("dm.lahore")} />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
