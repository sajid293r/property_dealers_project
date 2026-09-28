"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountClassLabel } from "@/lib/chart-of-accounts";
import type { AccountClass, LedgerAccountNode } from "@/lib/types";

const CLASS_ORDER: AccountClass[] = ["asset", "liability", "equity", "income", "expense"];

export function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder = "Select account",
}: {
  accounts: LedgerAccountNode[];
  value: string;
  onChange: (accountId: string) => void;
  placeholder?: string;
}) {
  const selected = accounts.find((a) => a.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder}>
          {selected && (
            <span className="flex items-center gap-1.5 truncate">
              <span className="font-mono text-[10px] text-muted-foreground">{selected.code}</span>
              <span className="truncate">{selected.name}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CLASS_ORDER.map((cls, i) => {
          const items = accounts.filter((a) => a.accountClass === cls);
          if (items.length === 0) return null;
          return (
            <SelectGroup key={cls}>
              {i > 0 && <SelectSeparator />}
              <SelectLabel>{accountClassLabel(cls)}</SelectLabel>
              {items.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">{a.code}</span>
                    {a.name}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
