"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, stampedName, type Cell } from "@/lib/export";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

/** "Export to Excel": downloads what is on screen (already filtered) as a CSV file. */
export function ExportButton({ name, headers, rows, disabled, label }: { name: string; headers: string[]; rows: Cell[][]; disabled?: boolean; label?: string }) {
  const t = useT();
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={disabled || rows.length === 0}
      onClick={() => {
        downloadCsv(stampedName(name), headers, rows);
        toast.success(t("common.rowsExported", { count: rows.length }));
      }}
    >
      <Download className="size-3.5" /> {label ?? t("common.export")}
    </Button>
  );
}
