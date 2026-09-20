"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { PlusCircle, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { NewUnitDialog } from "@/components/dialogs/new-unit-dialog";
import { useUnits } from "@/lib/hooks/use-data";
import { formatPkr } from "@/lib/format";
import type { Unit, UnitStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_STYLES: Record<UnitStatus, string> = {
  available: "bg-success/15 text-success border-success/30",
  reserved: "bg-warning/15 text-warning border-warning/30",
  sold: "bg-muted text-muted-foreground border-border",
};

export default function InventoryPage() {
  const { data: units, isLoading } = useUnits();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"all" | UnitStatus>("all");
  const [category, setCategory] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = React.useState(false);

  const categories = React.useMemo(
    () => Array.from(new Set((units ?? []).map((u) => u.category))),
    [units],
  );

  const filtered = React.useMemo(() => {
    return (units ?? []).filter((u) => {
      if (status !== "all" && u.status !== status) return false;
      if (category !== "all" && u.category !== category) return false;
      if (search && !`${u.code} ${u.title} ${u.project}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [units, search, status, category]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((u) => u.id)) : new Set());
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const allChecked = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Inventory / Units</h1>
          <p className="text-sm text-muted-foreground">
            {units?.length ?? 0} units across all active projects
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
          <PlusCircle className="size-4" />
          Add Unit
        </Button>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search code, title, project..." />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger size="sm" className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => toast.success(`Bulk price update queued for ${selected.size} units`)}
              >
                <Tag className="size-3.5" />
                Update Price
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  toast.success(`${selected.size} units archived`);
                  setSelected(new Set());
                }}
              >
                <Trash2 className="size-3.5" />
                Archive
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="w-9 pb-2.5">
                  <Checkbox checked={allChecked} onCheckedChange={(c) => toggleAll(!!c)} />
                </th>
                <th className="pb-2.5 font-medium">Unit</th>
                <th className="pb-2.5 font-medium">Category</th>
                <th className="pb-2.5 font-medium">Size</th>
                <th className="pb-2.5 font-medium">Price</th>
                <th className="pb-2.5 font-medium">Payment</th>
                <th className="pb-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={7} className="py-2.5"><Skeleton className="h-12 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((unit, i) => (
                    <UnitRow
                      key={unit.id}
                      unit={unit}
                      index={i}
                      checked={selected.has(unit.id)}
                      onToggle={(c) => toggleOne(unit.id, c)}
                    />
                  ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No units match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <NewUnitDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function UnitRow({
  unit,
  index,
  checked,
  onToggle,
}: {
  unit: Unit;
  index: number;
  checked: boolean;
  onToggle: (c: boolean) => void;
}) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index, 10) * 0.03 }}
      className={cn(
        "border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40",
        checked && "bg-accent/40",
      )}
    >
      <td className="py-2.5">
        <Checkbox checked={checked} onCheckedChange={(c) => onToggle(!!c)} />
      </td>
      <td className="py-2.5">
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
            <Image src={unit.imageUrl} alt={unit.title} fill sizes="40px" className="object-cover" />
          </div>
          <div>
            <p className="font-medium leading-tight">{unit.title}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {unit.code} · {unit.project} · Block {unit.block}
            </p>
          </div>
        </div>
      </td>
      <td className="py-2.5 text-muted-foreground">{unit.category}</td>
      <td className="py-2.5 tabular-nums text-muted-foreground">
        {unit.sizeMarla} Marla <span className="text-xs">({unit.sqft.toLocaleString()} sqft)</span>
      </td>
      <td className="py-2.5 tabular-nums font-medium">{formatPkr(unit.price)}</td>
      <td className="py-2.5">
        <Badge variant="outline" className="capitalize">{unit.paymentType}</Badge>
      </td>
      <td className="py-2.5">
        <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[unit.status])}>
          {unit.status}
        </Badge>
      </td>
    </motion.tr>
  );
}
