import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

/** Opens the printable version of a document in a new tab (it prints, or saves as PDF, from there). */
export function PrintLink({ kind, id, query, label, size = "sm", variant = "outline", iconOnly }: { kind: string; id: string; query?: string; label?: string; size?: "sm" | "default"; variant?: "outline" | "ghost" | "default"; iconOnly?: boolean }) {
  const t = useT();
  const text = label ?? t("common.print");
  return (
    <Button size={iconOnly ? "icon-sm" : size} variant={variant} className="gap-1.5" asChild aria-label={iconOnly ? text : undefined}>
      <a href={`/print/${kind}/${id}${query ? `?${query}` : ""}`} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
        <Printer className="size-3.5" /> {!iconOnly && text}
      </a>
    </Button>
  );
}
