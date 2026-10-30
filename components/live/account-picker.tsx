"use client";

import * as React from "react";
import { SearchSelect, type SearchOption } from "@/components/live/search-select";
import { useChartAccounts } from "@/lib/hooks/use-live";
import type { AccountClass, ChartAccount } from "@/lib/api/finance";
import { useT } from "@/lib/i18n/provider";

const CLASS_ORDER: AccountClass[] = ["asset", "liability", "equity", "income", "expense"];

/**
 * Choose a ledger account. Headings never appear (they cannot be posted to). `only` narrows the list, for example to
 * cash and bank accounts on a contra voucher.
 */
export function AccountPicker({
  value,
  onChange,
  only,
  placeholder,
  disabled,
  id,
}: {
  value: string | null | undefined;
  onChange: (accountId: string, account: ChartAccount | undefined) => void;
  only?: (a: ChartAccount) => boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const t = useT();
  const { data: accounts } = useChartAccounts();
  const options = React.useMemo<SearchOption[]>(
    () =>
      (accounts ?? [])
        .filter((a) => !a.isGroup && a.active && (!only || only(a)))
        .sort((a, b) => CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class) || a.code.localeCompare(b.code))
        .map((a) => ({ value: a.id, label: a.name, hint: a.code, group: t(`acc.class.${a.class}`) })),
    // `only` is usually an inline function; the list only changes when the accounts do
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, t],
  );
  return (
    <SearchSelect
      id={id}
      disabled={disabled}
      options={options}
      value={value}
      placeholder={placeholder ?? t("acc.picker.placeholder")}
      searchPlaceholder={t("acc.picker.search")}
      emptyText={t("acc.picker.empty")}
      onChange={(v) => onChange(v, accounts?.find((a) => a.id === v))}
    />
  );
}
