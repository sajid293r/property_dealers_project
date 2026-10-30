"use client";

import * as React from "react";
import { SearchSelect, type SearchOption } from "@/components/live/search-select";
import { NewPartyDialog } from "@/components/live/party-dialog";
import { useParties } from "@/lib/hooks/use-live";
import type { PartyRole, PartyRow } from "@/lib/api/finance";
import { useT } from "@/lib/i18n/provider";

/** Choose a customer or supplier, or add a new one on the spot. */
export function PartySelect({
  value,
  onChange,
  role,
  placeholder,
  disabled,
  id,
  createLabel,
}: {
  value: string | null | undefined;
  onChange: (partyId: string, party?: PartyRow) => void;
  /** Only people with this role; omit to list everyone. */
  role?: PartyRole;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  createLabel?: string;
}) {
  const t = useT();
  const { data: parties } = useParties(role);
  const [adding, setAdding] = React.useState(false);
  const options = React.useMemo<SearchOption[]>(
    () => (parties ?? []).map((p) => ({ value: p.id, label: p.name, hint: p.cnicLast4 ? `•••• ${p.cnicLast4}` : p.phone ?? undefined })),
    [parties],
  );
  return (
    <>
      <SearchSelect
        id={id}
        disabled={disabled}
        options={options}
        value={value}
        placeholder={placeholder ?? t("customers.select.choose")}
        searchPlaceholder={t("customers.select.search")}
        emptyText={role === "vendor" ? t("customers.select.noSuppliers") : t("customers.select.nobody")}
        onChange={(v) => onChange(v, parties?.find((p) => p.id === v))}
        onCreate={() => setAdding(true)}
        createLabel={createLabel ?? (role === "vendor" ? t("customers.select.addSupplier") : role === "customer" ? t("customers.select.addCustomer") : t("customers.select.addSomeone"))}
      />
      <NewPartyDialog
        open={adding}
        onOpenChange={setAdding}
        defaultRoles={role ? [role] : ["customer"]}
        onCreated={(p) => onChange(p.id, p)}
      />
    </>
  );
}
