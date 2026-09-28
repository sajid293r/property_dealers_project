"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountSelect } from "@/components/vouchers/account-select";
import { COST_CENTERS, emptyLine } from "@/lib/vouchers";
import type { LedgerAccountNode, VoucherLine } from "@/lib/types";

export function VoucherLineEditor({
  lines,
  onChange,
  accounts,
  projects,
}: {
  lines: VoucherLine[];
  onChange: (lines: VoucherLine[]) => void;
  accounts: LedgerAccountNode[];
  projects: string[];
}) {
  function updateLine(id: string, patch: Partial<VoucherLine>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLine() {
    onChange([...lines, emptyLine(`line-${Date.now()}`)]);
  }

  function removeLine(id: string) {
    onChange(lines.filter((l) => l.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="w-[26%] py-2 pl-3 font-medium">Account</th>
              <th className="w-[11%] py-2 pr-2 font-medium">Debit</th>
              <th className="w-[11%] py-2 pr-2 font-medium">Credit</th>
              <th className="w-[20%] py-2 pr-2 font-medium">Remarks</th>
              <th className="w-[14%] py-2 pr-2 font-medium">Cost Center</th>
              <th className="w-[14%] py-2 pr-2 font-medium">Project</th>
              <th className="w-8 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 pl-3 pr-2">
                  <AccountSelect
                    accounts={accounts}
                    value={line.accountId}
                    onChange={(v) => updateLine(line.id, { accountId: v })}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    type="number"
                    min={0}
                    value={line.debit || ""}
                    onChange={(e) => updateLine(line.id, { debit: Number(e.target.value) || 0, credit: 0 })}
                    placeholder="0.00"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    type="number"
                    min={0}
                    value={line.credit || ""}
                    onChange={(e) => updateLine(line.id, { credit: Number(e.target.value) || 0, debit: 0 })}
                    placeholder="0.00"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    value={line.remarks ?? ""}
                    onChange={(e) => updateLine(line.id, { remarks: e.target.value })}
                    placeholder="Remarks"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Select
                    value={line.costCenter || "none"}
                    onValueChange={(v) => updateLine(line.id, { costCenter: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {COST_CENTERS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1.5 pr-2">
                  <Select
                    value={line.project || "none"}
                    onValueChange={(v) => updateLine(line.id, { project: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-1.5 pr-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeLine(line.id)}
                    disabled={lines.length <= 2}
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addLine}>
        <Plus className="size-3.5" />
        Add line
      </Button>
    </div>
  );
}
