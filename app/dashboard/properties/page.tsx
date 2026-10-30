"use client";

import { isLiveCompanyId } from "@/lib/api/live";
import Link from "next/link";
import { Building2 as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Building2 as KpiBuilding2, CircleCheck as KpiCircleCheck, Hourglass as KpiHourglass, Banknote as KpiBanknote } from "lucide-react";
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
import { useT } from "@/lib/i18n/provider";
import { Ltr } from "@/components/ltr";

const STATUS_STYLES: Record<UnitStatus, string> = {
  available: "bg-success/15 text-success border-success/30",
  reserved: "bg-warning/15 text-warning border-warning/30",
  sold: "bg-muted text-muted-foreground border-border",
};

export default function PropertiesPage() {
  const t = useT();
  const { data: units, isLoading } = useUnits();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"all" | UnitStatus>("all");
  const [category, setCategory] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = React.useState(false);

  const availableCount = units?.filter((u) => u.status === "available").length ?? 0;
  const reservedCount = units?.filter((u) => u.status === "reserved").length ?? 0;
  const availableValue = units?.filter((u) => u.status === "available").reduce((s, u) => s + u.price, 0) ?? 0;

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
      <PageHeader
        icon={HeaderIcon}
        eyebrow={t("properties.eyebrow")}
        title={t("properties.title")}
        description={t("properties.description", { count: units?.length ?? 0 })}
        actions={<>
        <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
          <PlusCircle className="size-4" />
          {t("properties.add")}
        </Button>
        </>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t("properties.kpi.total")} value={units?.length ?? 0} format={(n) => n.toString()} icon={KpiBuilding2} index={0} />
        <KpiCard label={t("properties.kpi.available")} value={availableCount} format={(n) => n.toString()} icon={KpiCircleCheck} index={1} />
        <KpiCard label={t("properties.kpi.reserved")} value={reservedCount} format={(n) => n.toString()} icon={KpiHourglass} accent="gold" index={2} />
        <KpiCard label={t("properties.kpi.stockValue")} value={availableValue} format={(n) => formatPkr(n, { compact: true })} icon={KpiBanknote} accent="gold" index={3} />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder={t("properties.search")} />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger size="sm" className="w-36"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("properties.allStatuses")}</SelectItem>
              <SelectItem value="available">{t("status.available")}</SelectItem>
              <SelectItem value="reserved">{t("status.reserved")}</SelectItem>
              <SelectItem value="sold">{t("status.sold")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder={t("properties.category")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("properties.allCategories")}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selected.size > 0 && (
            <div className="ms-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("common.selected", { count: selected.size })}</span>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => toast.success(t("properties.bulkPrice", { count: selected.size }))}
              >
                <Tag className="size-3.5" />
                {t("properties.updatePrice")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  toast.success(t("properties.bulkArchived", { count: selected.size }));
                  setSelected(new Set());
                }}
              >
                <Trash2 className="size-3.5" />
                {t("properties.archive")}
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="w-9 pb-2.5">
                  <Checkbox checked={allChecked} onCheckedChange={(c) => toggleAll(!!c)} />
                </th>
                <th className="pb-2.5 font-medium">{t("properties.col.property")}</th>
                <th className="pb-2.5 font-medium">{t("properties.col.category")}</th>
                <th className="pb-2.5 font-medium">{t("properties.col.size")}</th>
                <th className="pb-2.5 font-medium">{t("properties.col.price")}</th>
                <th className="pb-2.5 font-medium">{t("properties.col.payment")}</th>
                <th className="pb-2.5 font-medium">{t("properties.col.status")}</th>
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
                    {t("properties.noMatch")}
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
  const t = useT();
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
            {unit.imageUrl ? (
              <Image src={unit.imageUrl} alt={unit.title} fill sizes="40px" className="object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-muted-foreground"><KpiBuilding2 className="size-4" /></span>
            )}
          </div>
          <div>
            {isLiveCompanyId(unit.id) ? <Link href={`/dashboard/properties/${unit.id}`} className="font-medium leading-tight hover:text-primary hover:underline">{unit.title}</Link> : <p className="font-medium leading-tight">{unit.title}</p>}
            <p className="font-mono text-[11px] text-muted-foreground">
              <Ltr>{unit.code}</Ltr> · {unit.project} · {unit.block ? t("properties.block", { block: unit.block }) : t("properties.noBlock")}
            </p>
          </div>
        </div>
      </td>
      <td className="py-2.5 text-muted-foreground">{unit.category}</td>
      <td className="py-2.5 tabular-nums text-muted-foreground">
        {t("properties.sizeLine", { marla: unit.sizeMarla })} <span className="text-xs">{t("properties.sqft", { sqft: unit.sqft.toLocaleString() })}</span>
      </td>
      <td className="py-2.5 tabular-nums font-medium"><Ltr>{formatPkr(unit.price)}</Ltr></td>
      <td className="py-2.5">
        <Badge variant="outline">{t(`status.${unit.paymentType}`)}</Badge>
      </td>
      <td className="py-2.5">
        <Badge variant="outline" className={cn(STATUS_STYLES[unit.status])}>
          {t(`status.${unit.status}`)}
        </Badge>
      </td>
    </motion.tr>
  );
}
