"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CornerDownLeft, Lock, Search, Sparkles, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NAV_ITEMS, tierMeets } from "@/lib/plan";
import { usePlanTier } from "@/lib/providers/plan-provider";
import { cn } from "@/lib/utils";

interface Entry {
  href: string;
  label: string;
  section: string;
  icon: LucideIcon;
  locked: boolean;
}

/** Ctrl/⌘ + K quick-jump palette across every module. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { tier } = usePlanTier();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const entries = React.useMemo<Entry[]>(
    () =>
      NAV_ITEMS.flatMap((item) => {
        const locked = !tierMeets(tier, item.minTier);
        if (item.children?.length) {
          return item.children.map((c) => ({
            href: c.href,
            label: c.label,
            section: item.section,
            icon: item.icon,
            locked,
          }));
        }
        return [{ href: item.href, label: item.label, section: item.section, icon: item.icon, locked }];
      }),
    [tier],
  );

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => `${e.label} ${e.section}`.toLowerCase().includes(q));
  }, [entries, query]);

  function handleOpenChange(o: boolean) {
    if (!o) setQuery("");
    setActive(0);
    onOpenChange(o);
  }

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(entry: Entry) {
    handleOpenChange(false);
    router.push(entry.locked ? "/dashboard/settings/billing" : entry.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl shadow-primary/20 sm:max-w-xl"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search and jump to any module</DialogDescription>
        <div className="relative flex items-center gap-3 border-b px-4">
          <Search className="size-4.5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Jump to a module…  try “vouchers”, “plot map”, “payroll”"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
          />
          <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
          <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Sparkles className="size-6 text-gold" />
              Nothing matches “{query}”
            </div>
          )}
          {results.map((e, i) => {
            const header = i === 0 || results[i - 1].section !== e.section;
            const Icon = e.icon;
            return (
              <React.Fragment key={e.href}>
                {header && (
                  <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 first:pt-1">
                    {e.section}
                  </p>
                )}
                <button
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(e)}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    i === active ? "bg-primary/10 text-foreground" : "text-foreground/80",
                  )}
                >
                  {i === active && (
                    <motion.span
                      layoutId="cmdk-active"
                      className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gold"
                      transition={{ type: "spring", stiffness: 500, damping: 36 }}
                    />
                  )}
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg transition-colors",
                      i === active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 font-medium">{e.label}</span>
                  {e.locked ? (
                    <Lock className="size-3.5 text-muted-foreground" />
                  ) : (
                    i === active && <CornerDownLeft className="size-3.5 text-muted-foreground" />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="rounded border bg-background px-1 font-mono">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="rounded border bg-background px-1 font-mono">↵</kbd> open</span>
          <span className="ml-auto">{results.length} results</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
