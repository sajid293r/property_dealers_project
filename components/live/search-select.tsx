"use client";

import * as React from "react";
import { useT } from "@/lib/i18n/provider";
import { Check, ChevronDown, ChevronRight, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchOption {
  value: string;
  label: string;
  /** Small grey text after the label (a code, a short name). */
  hint?: string;
  /** Options with the same group are listed under one heading. */
  group?: string;
  /** Nested headings, outermost first. Headings start folded and open with an arrow; typing a search shows everything. */
  path?: { key: string; label: string }[];
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
  placeholder,
  searchPlaceholder,
  emptyText,
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
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const selected = options.find((o) => o.value === value);
  const searching = query.trim() !== "";
  const [openKeys, setOpenKeys] = React.useState<Set<string>>(new Set());
  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q ? options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q)) : options;
    // folded headings hide their options (not while searching)
    return searching ? found : found.filter((o) => (o.path ?? []).every((p) => openKeys.has(p.key)));
  }, [options, query, searching, openKeys]);
  const toggleKey = (key: string) => setOpenKeys((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  // the rows to draw: headings (with their depth) between the options that are visible
  const rows = React.useMemo(() => {
    type Row = { kind: "head"; key: string; label: string; depth: number; count: number } | { kind: "opt"; o: SearchOption; i: number };
    const out: Row[] = [];
    const seen = new Set<string>();
    if (!options.some((o) => o.path?.length)) return null;
    const all = searching ? results : options;
    const counts = new Map<string, number>();
    for (const o of all) for (const p of o.path ?? []) counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
    let i = 0;
    for (const o of all) {
      const path = o.path ?? [];
      let shown = true;
      path.forEach((p, d) => {
        if (!shown) return;
        if (!seen.has(p.key)) { seen.add(p.key); out.push({ kind: "head", key: p.key, label: p.label, depth: d, count: counts.get(p.key) ?? 0 }); }
        if (!searching && !openKeys.has(p.key)) shown = false;
      });
      if (shown) out.push({ kind: "opt", o, i: i++ });
    }
    return out;
  }, [options, results, searching, openKeys]);

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (!o) setQuery("");
    setActive(0);
    if (o && selected?.path) setOpenKeys((s) => new Set([...s, ...selected.path!.map((p) => p.key)]));
  }

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
      onOpenChange={onOpenChange}
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
              (placeholder ?? t("common.select"))
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
            placeholder={searchPlaceholder ?? t("common.typeToSearch")}
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1">
          {clearable && value && (
            <button type="button" className="w-full rounded-md px-2 py-1.5 text-start text-xs text-muted-foreground hover:bg-secondary" onClick={() => { onChange(""); setOpen(false); }}>
              Clear selection
            </button>
          )}
          {results.length === 0 && (searching || !rows || options.length === 0) && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText ?? t("common.nothingFound")}</p>}
          {rows && rows.map((r) => {
            if (r.kind === "head") {
              const isOpen = searching || openKeys.has(r.key);
              return (
                <button
                  key={"h" + r.key}
                  type="button"
                  onClick={() => !searching && toggleKey(r.key)}
                  style={{ paddingInlineStart: 8 + r.depth * 14 }}
                  className="flex w-full items-center gap-1.5 rounded-md py-1.5 pe-2 text-start text-sm font-semibold hover:bg-secondary"
                >
                  {isOpen ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground rtl:-scale-x-100" />}
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">{r.count}</span>
                </button>
              );
            }
            const o = r.o, i = r.i;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                data-index={i}
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                style={{ paddingInlineStart: 8 + (o.path?.length ?? 0) * 14 }}
                className={cn("flex w-full items-center gap-2 rounded-md py-1.5 pe-2 text-start text-sm", i === active && "bg-secondary")}
              >
                <Check className={cn("size-3.5 shrink-0 text-primary", o.value === value ? "opacity-100" : "opacity-0")} />
                {o.hint && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{o.hint}</span>}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </button>
            );
          })}
          {!rows && results.map((o, i) => {
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
            {createLabel ?? t("common.addNew")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
