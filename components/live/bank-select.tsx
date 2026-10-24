"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { SearchSelect, type SearchOption } from "@/components/live/search-select";
import { useBankCatalog } from "@/lib/hooks/use-live";
import type { BankKind } from "@/lib/api/finance";

const KIND_LABEL: Record<BankKind, string> = {
  public: "Public sector banks",
  private: "Private commercial banks",
  islamic: "Islamic banks",
  foreign: "Foreign banks",
  microfinance: "Microfinance banks",
  digital: "Digital wallets & e-money",
};

export interface BankValue {
  /** A bank from the catalog, or null when typed in by hand. */
  bankId: string | null;
  bankName: string;
}

/**
 * Pick a bank from the full list of Pakistani banks (type to search, grouped by kind). If a bank is missing, "My bank
 * isn't listed" lets you type its name.
 */
export function BankSelect({ value, onChange, placeholder = "Choose the bank", id, disabled }: { value: BankValue; onChange: (v: BankValue) => void; placeholder?: string; id?: string; disabled?: boolean }) {
  const { data: banks } = useBankCatalog();
  const [custom, setCustom] = React.useState(false);

  const options = React.useMemo<SearchOption[]>(
    () => (banks ?? []).map((b) => ({ value: b.id, label: b.name, hint: b.shortName, group: KIND_LABEL[b.kind] })),
    [banks],
  );

  if (custom || (!value.bankId && value.bankName)) {
    return (
      <div className="space-y-1.5">
        <Input
          id={id}
          autoFocus={custom}
          disabled={disabled}
          value={value.bankName}
          onChange={(e) => onChange({ bankId: null, bankName: e.target.value })}
          placeholder="Type the bank's name"
          maxLength={120}
        />
        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => { setCustom(false); onChange({ bankId: null, bankName: "" }); }}>
          ← Choose from the list of banks
        </button>
      </div>
    );
  }

  return (
    <SearchSelect
      id={id}
      disabled={disabled}
      options={options}
      value={value.bankId}
      placeholder={placeholder}
      searchPlaceholder="Search banks (HBL, Meezan, …)"
      emptyText="No bank matches. Use “My bank isn’t listed”."
      onChange={(bankId) => {
        const b = banks?.find((x) => x.id === bankId);
        onChange({ bankId: b?.id ?? null, bankName: b?.name ?? "" });
      }}
      onCreate={() => {
        setCustom(true);
        onChange({ bankId: null, bankName: "" });
      }}
      createLabel="My bank isn’t listed"
    />
  );
}
