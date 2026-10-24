"use client";

import * as React from "react";
import { SearchSelect, type SearchOption } from "@/components/live/search-select";
import { NewPartyDialog } from "@/components/live/party-dialog";
import { useParties } from "@/lib/hooks/use-live";
import type { PartyRole, PartyRow } from "@/lib/api/finance";

/** Choose a customer or supplier, or add a new one on the spot. */
export function PartySelect({
  value,
  onChange,
  role,
  placeholder = "Choose…",
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
        placeholder={placeholder}
        searchPlaceholder="Search by name, phone or last 4 digits of CNIC"
        emptyText={role === "vendor" ? "No suppliers yet" : "Nobody matches"}
        onChange={(v) => onChange(v, parties?.find((p) => p.id === v))}
        onCreate={() => setAdding(true)}
        createLabel={createLabel ?? (role === "vendor" ? "Add a new supplier" : role === "customer" ? "Add a new customer" : "Add someone new")}
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
