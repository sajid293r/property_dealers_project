"use client";

import * as React from "react";
import { UserPlus } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompany } from "@/lib/providers/company-provider";
import { createParty, type PartyRole, type PartyRow } from "@/lib/api/finance";
import { useInvalidateFinance } from "@/lib/hooks/use-live";
import { toast } from "sonner";

const ROLE_CHOICES: { role: PartyRole; label: string }[] = [
  { role: "customer", label: "Customer" },
  { role: "vendor", label: "Supplier" },
  { role: "dealer", label: "Dealer" },
  { role: "contractor", label: "Contractor" },
];

/** Add a customer, supplier, dealer or contractor to the address book (one person can be several). */
export function NewPartyDialog({
  open,
  onOpenChange,
  defaultRoles = ["customer"],
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRoles?: PartyRole[];
  onCreated?: (party: PartyRow) => void;
}) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [name, setName] = React.useState("");
  const [roles, setRoles] = React.useState<PartyRole[]>(defaultRoles);
  const [organization, setOrganization] = React.useState(false);
  const [cnic, setCnic] = React.useState("");
  const [ntn, setNtn] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [city, setCity] = React.useState("");

  function reset() {
    setName("");
    setCnic("");
    setNtn("");
    setPhone("");
    setCity("");
    setOrganization(false);
    setRoles(defaultRoles);
  }

  async function submit() {
    const party = await createParty(company.id, {
      name: name.trim(),
      roles,
      kind: organization ? "organization" : "person",
      cnic: cnic.trim() || undefined,
      ntn: ntn.trim() || undefined,
      phone: phone.trim() || undefined,
      city: city.trim() || undefined,
    });
    await invalidate();
    toast.success(`${party.name} added`, { description: roles.map((r) => ROLE_CHOICES.find((c) => c.role === r)?.label).join(", ") });
    reset();
    onCreated?.(party);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      icon={UserPlus}
      title="Add a customer or supplier"
      description="One address book for everyone you deal with. Add them once, use them everywhere."
      submitLabel="Add"
      submitDisabled={!name.trim() || roles.length === 0}
      onSubmit={submit}
    >
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={organization ? "Lahore Steel Traders" : "Ahmed Khan"} />
      </Field>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {ROLE_CHOICES.map((c) => (
          <label key={c.role} className="flex items-center gap-2 text-sm">
            <Checkbox checked={roles.includes(c.role)} onCheckedChange={(v) => setRoles((r) => (v === true ? [...r, c.role] : r.filter((x) => x !== c.role)))} />
            {c.label}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={organization} onCheckedChange={(v) => setOrganization(v === true)} />
          It is a company
        </label>
      </div>
      <FieldRow>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300-1234567" inputMode="tel" />
        </Field>
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label={organization ? "NTN" : "CNIC (optional)"}>
          {organization ? (
            <Input value={ntn} onChange={(e) => setNtn(e.target.value)} placeholder="1234567-8" />
          ) : (
            <Input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="35201-1234567-1" inputMode="numeric" />
          )}
        </Field>
        <Field label={organization ? "CNIC of owner (optional)" : "NTN (optional)"}>
          {organization ? (
            <Input value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="35201-1234567-1" inputMode="numeric" />
          ) : (
            <Input value={ntn} onChange={(e) => setNtn(e.target.value)} placeholder="1234567-8" />
          )}
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
