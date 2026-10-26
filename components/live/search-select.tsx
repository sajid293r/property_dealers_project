"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchOption {
  value: string;
  label: string;
  /** Small grey text after the label (a code, a short name). */
  hint?: string;
  /** Options with the same group are listed under one heading. */
  group?: string;
  disabled?: boolean;
}

/**
 * A select you can type into: for long lists (banks, accounts, customers) where scrolling is slow.
 * Click or Enter picks; arrows move; the optional footer action ("New customer") is always reachable.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "Nothing found",
  onCreate,
  createLabel,
  disabled,
  className,
  clearable,
  id,
}: {
  options: SearchOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  onCreate?: () => void;
  createLabel?: string;
  disabled?: boolean;
  className?: string;
  clearable?: boolean;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const selected = options.find((o) => o.value === value);
  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(o: SearchOption) {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
        setActive(0);
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-start text-sm shadow-xs outline-none transition-[color,box-shadow]",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
            className,
          )}
        >
          <span className={cn("flex min-w-0 items-center gap-1.5", !selected && "text-muted-foreground")}>
            {selected ? (
              <>
                {selected.hint && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{selected.hint}</span>}
                <span className="truncate">{selected.label}</span>
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] p-0">
        <div className="flex items-center gap-2 border-b border-border/70 px-3">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const o = results[active];
                if (o) choose(o);
              }
            }}
            placeholder={searchPlaceholder}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1">
          {clearable && value && (
            <button type="button" className="w-full rounded-md px-2 py-1.5 text-start text-xs text-muted-foreground hover:bg-secondary" onClick={() => { onChange(""); setOpen(false); }}>
              Clear selection
            </button>
          )}
          {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>}
          {results.map((o, i) => {
            const heading = o.group && o.group !== results[i - 1]?.group ? o.group : null;
            return (
              <React.Fragment key={o.value}>
                {heading && <p className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{heading}</p>}
                <button
                  type="button"
                  role="option"
                  data-index={i}
                  aria-selected={o.value === value}
                  disabled={o.disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm disabled:opacity-40",
                    i === active && "bg-secondary",
                  )}
                >
                  <Check className={cn("size-3.5 shrink-0 text-primary", o.value === value ? "opacity-100" : "opacity-0")} />
                  {o.hint && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{o.hint}</span>}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        {onCreate && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCreate();
            }}
            className="flex w-full items-center gap-2 border-t border-border/70 px-3 py-2.5 text-start text-sm font-medium text-primary hover:bg-secondary"
          >
            <Plus className="size-3.5" />
            {createLabel ?? "Add new"}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
