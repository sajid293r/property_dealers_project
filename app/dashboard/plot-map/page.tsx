"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPinned,
  Map as MapIcon,
  Satellite,
  ZoomIn,
  ZoomOut,
  X,
  Building2,
  Ruler,
  Tag,
  Layers,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { UnitStatusDonut } from "@/components/charts/unit-status-donut";
import { useUnits } from "@/lib/hooks/use-data";
import { formatPkr } from "@/lib/format";
import type { Unit, UnitStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_CELL: Record<UnitStatus, string> = {
  available: "bg-[var(--chart-1)]/85 hover:bg-[var(--chart-1)] text-white",
  reserved: "bg-[var(--gold)]/85 hover:bg-[var(--gold)] text-[var(--gold-foreground)]",
  sold: "bg-[var(--chart-4)]/70 hover:bg-[var(--chart-4)] text-white",
};

const STATUS_BADGE: Record<UnitStatus, string> = {
  available: "bg-success/15 text-success border-success/30",
  reserved: "bg-warning/15 text-warning border-warning/30",
  sold: "bg-muted text-muted-foreground border-border",
};

const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.15;

export default function PlotMapPage() {
  const { data: units, isLoading } = useUnits();

  const projects = React.useMemo(
    () => Array.from(new Set((units ?? []).map((u) => u.project))),
    [units],
  );

  const [projectOverride, setProjectOverride] = React.useState<string | null>(null);
  const [block, setBlock] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [viewMode, setViewMode] = React.useState<"scheme" | "satellite">("scheme");

  // Defaults to the first project once units load — derived instead of effect-driven,
  // so there's no render-triggering setState to synchronize.
  const project = projectOverride ?? projects[0] ?? null;

  const projectUnits = React.useMemo(
    () => (units ?? []).filter((u) => u.project === project),
    [units, project],
  );

  const blocks = React.useMemo(
    () => Array.from(new Set(projectUnits.map((u) => u.block))).sort(),
    [projectUnits],
  );

  const visibleUnits = React.useMemo(() => {
    const filtered = block === "all" ? projectUnits : projectUnits.filter((u) => u.block === block);
    return [...filtered].sort((a, b) => (a.block + a.code).localeCompare(b.block + b.code));
  }, [projectUnits, block]);

  const selectedUnit = React.useMemo(
    () => projectUnits.find((u) => u.id === selectedId) ?? null,
    [projectUnits, selectedId],
  );

  function matchesQuery(u: Unit) {
    if (!query) return true;
    return `${u.code} ${u.title}`.toLowerCase().includes(query.toLowerCase());
  }

  function selectProject(next: string) {
    setProjectOverride(next);
    setBlock("all");
    setSelectedId(null);
    setQuery("");
  }

  const counts = {
    available: visibleUnits.filter((u) => u.status === "available").length,
    reserved: visibleUnits.filter((u) => u.status === "reserved").length,
    sold: visibleUnits.filter((u) => u.status === "sold").length,
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading text-2xl font-semibold">Plot Map</h1>
            <Badge variant="outline" className="border-gold/40 bg-gold/10 text-gold gap-1">
              <Sparkles className="size-3" />
              Premium
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Pick a plot visually — click any unit to see pricing and booking status.
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {isLoading || !project ? (
            <Skeleton className="h-8 w-48" />
          ) : (
            <Select value={project} onValueChange={selectProject}>
              <SelectTrigger size="sm" className="w-52">
                <MapPinned className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={block} onValueChange={setBlock}>
            <SelectTrigger size="sm" className="w-32">
              <Layers className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder="Block" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All blocks</SelectItem>
              {blocks.map((b) => (
                <SelectItem key={b} value={b}>Block {b}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DataTableSearch value={query} onChange={setQuery} placeholder="Highlight a plot code..." />
          {query && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setQuery("")}>
              <X className="size-3.5" />
              Remove highlight
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center overflow-hidden rounded-md border border-border">
              <Button
                variant={viewMode === "scheme" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5 rounded-none"
                onClick={() => setViewMode("scheme")}
              >
                <MapIcon className="size-3.5" />
                Scheme
              </Button>
              <Button
                variant={viewMode === "satellite" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5 rounded-none"
                onClick={() => setViewMode("satellite")}
              >
                <Satellite className="size-3.5" />
                Satellite
              </Button>
            </div>
            <div className="flex items-center overflow-hidden rounded-md border border-border">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-none"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <span className="w-11 text-center font-mono text-xs text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-none"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
              >
                <ZoomIn className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border/60 pt-3">
          {(["available", "reserved", "sold"] as const).map((s) => (
            <div key={s} className="flex items-center gap-1.5 text-xs">
              <span className={cn("size-2.5 rounded-[3px]", STATUS_CELL[s].split(" ")[0])} />
              <span className="capitalize text-muted-foreground">{s}</span>
              <span className="font-medium tabular-nums">{counts[s]}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card
          className={cn(
            "relative overflow-auto p-5 transition-colors duration-300",
            viewMode === "satellite" ? "bg-[#1c2620]" : "bg-secondary/25",
          )}
          style={{ minHeight: 440 }}
        >
          {isLoading ? (
            <div className="grid grid-cols-8 gap-2">
              {Array.from({ length: 24 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : (
            <div
              className="transition-transform duration-200"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                width: zoom > 1 ? `${100 / zoom}%` : "100%",
              }}
            >
              <div
                className="grid gap-2.5"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}
              >
                {visibleUnits.map((unit) => {
                  const match = matchesQuery(unit);
                  const isSelected = unit.id === selectedId;
                  return (
                    <Tooltip key={unit.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setSelectedId(isSelected ? null : unit.id)}
                          className={cn(
                            "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-semibold transition-all duration-200",
                            STATUS_CELL[unit.status],
                            viewMode === "satellite" && "ring-1 ring-white/15",
                            query && !match && "opacity-25",
                            query && match && "ring-2 ring-white ring-offset-1 ring-offset-transparent",
                            isSelected && "z-10 scale-110 shadow-lg ring-2 ring-primary ring-offset-2 ring-offset-background",
                          )}
                        >
                          <span className="leading-none">{unit.code.replace("UNT-", "")}</span>
                          <span className="text-[8px] font-normal opacity-80">{unit.block}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{unit.code} · Block {unit.block}</p>
                        <p className="text-muted-foreground">{formatPkr(unit.price)} · {unit.status}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <AnimatePresence mode="wait">
          {selectedUnit ? (
            <motion.div
              key={selectedUnit.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{selectedUnit.code}</p>
                    <h3 className="font-heading text-lg font-semibold">{selectedUnit.title}</h3>
                  </div>
                  <Button variant="ghost" size="icon-xs" onClick={() => setSelectedId(null)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
                <Badge variant="outline" className={cn("mt-2 capitalize", STATUS_BADGE[selectedUnit.status])}>
                  {selectedUnit.status}
                </Badge>

                <div className="mt-4 space-y-3 border-t border-border/60 pt-4 text-sm">
                  <DetailRow icon={Building2} label="Category" value={selectedUnit.category} />
                  <DetailRow icon={Layers} label="Block" value={`Block ${selectedUnit.block}`} />
                  <DetailRow
                    icon={Ruler}
                    label="Size"
                    value={`${selectedUnit.sizeMarla} Marla (${selectedUnit.sqft.toLocaleString()} sqft)`}
                  />
                  <DetailRow icon={Tag} label="Price" value={formatPkr(selectedUnit.price)} />
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  <Button
                    disabled={selectedUnit.status !== "available"}
                    onClick={() => toast.success(`Booking started for ${selectedUnit.code}`)}
                  >
                    {selectedUnit.status === "available" ? "Book this unit" : "Not available"}
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/inventory">
                      View in inventory
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="summary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="p-5">
                <h3 className="font-heading text-base font-semibold">Project overview</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{project}</p>
                {isLoading ? (
                  <>
                    <Skeleton className="mt-4 h-48 w-full" />
                    <Skeleton className="mt-4 h-16 w-full" />
                  </>
                ) : (
                  <>
                    <div className="mt-4">
                      <UnitStatusDonut units={projectUnits} />
                    </div>
                    <div className="mt-4 space-y-2 border-t border-border/60 pt-4 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Total inventory value</span>
                        <span className="tabular-nums font-medium">
                          {formatPkr(projectUnits.reduce((s, u) => s + u.price, 0), { compact: true })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Blocks</span>
                        <span className="tabular-nums font-medium">{blocks.length}</span>
                      </div>
                    </div>
                  </>
                )}
                <p className="mt-4 text-xs text-muted-foreground">Click any plot on the map to see its details here.</p>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
