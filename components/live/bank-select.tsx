"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { SearchSelect, type SearchOption } from "@/components/live/search-select";
import { useBankCatalog } from "@/lib/hooks/use-live";
import { useT } from "@/lib/i18n/provider";

export interface BankValue {
  /** A bank from the catalog, or null when typed in by hand. */
  bankId: string | null;
  bankName: string;
}

/**
 * Pick a bank from the full list of Pakistani banks (type to search, grouped by kind). If a bank is missing, "My bank
 * isn't listed" lets you type its name.
 */
export function BankSelect({ value, onChange, placeholder, id, disabled }: { value: BankValue; onChange: (v: BankValue) => void; placeholder?: string; id?: string; disabled?: boolean }) {
  const t = useT();
  const { data: banks } = useBankCatalog();
  const [custom, setCustom] = React.useState(false);

  const options = React.useMemo<SearchOption[]>(
    () => (banks ?? []).map((b) => ({ value: b.id, label: b.name, hint: b.shortName, group: t(`bank.kind.${b.kind}`) })),
    [banks, t],
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
          placeholder={t("bank.select.typeName")}
          maxLength={120}
        />
        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => { setCustom(false); onChange({ bankId: null, bankName: "" }); }}>
          {t("bank.select.back")}
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
      placeholder={placeholder ?? t("bank.select.placeholder")}
      searchPlaceholder={t("bank.select.search")}
      emptyText={t("bank.select.empty")}
      onChange={(bankId) => {
        const b = banks?.find((x) => x.id === bankId);
        onChange({ bankId: b?.id ?? null, bankName: b?.name ?? "" });
      }}
      onCreate={() => {
        setCustom(true);
        onChange({ bankId: null, bankName: "" });
      }}
      createLabel={t("bank.select.create")}
    />
  );
}
