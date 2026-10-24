"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, stampedName, type Cell } from "@/lib/export";
import { toast } from "sonner";

/** "Export to Excel": downloads what is on screen (already filtered) as a CSV file. */
export function ExportButton({ name, headers, rows, disabled, label = "Export" }: { name: string; headers: string[]; rows: Cell[][]; disabled?: boolean; label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={disabled || rows.length === 0}
      onClick={() => {
        downloadCsv(stampedName(name), headers, rows);
        toast.success(`${rows.length} row${rows.length === 1 ? "" : "s"} exported`);
      }}
    >
      <Download className="size-3.5" /> {label}
    </Button>
  );
}
