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
  const options = React.useMemo<SearchOption[]>(() => {
    const byId = new Map((accounts ?? []).map((a) => [a.id, a]));
    // headings above an account, outermost first; a chart with no headings falls back to its class
    const pathOf = (a: ChartAccount) => {
      const chain: { key: string; label: string }[] = [];
      for (let p = a.parentId ? byId.get(a.parentId) : undefined, n = 0; p && n < 8; p = p.parentId ? byId.get(p.parentId) : undefined, n++) chain.unshift({ key: p.id, label: p.name });
      return chain.length ? chain : [{ key: "class-" + a.class, label: t(`acc.class.${a.class}`) }];
    };
    return (accounts ?? [])
      .filter((a) => !a.isGroup && a.active && (!only || only(a)))
      .sort((a, b) => CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class) || a.code.localeCompare(b.code))
      .map((a) => ({ value: a.id, label: a.name, hint: a.code, group: t(`acc.class.${a.class}`), path: pathOf(a) }));
    // `only` is usually an inline function; the list only changes when the accounts do
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, t]);
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
