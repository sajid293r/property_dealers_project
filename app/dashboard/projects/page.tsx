"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Banknote, FolderKanban, Layers, MapPin, PlusCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ProjectStatusBadge, ProjectTypeBadge } from "@/components/projects/badges";
import { NewProjectDialog } from "@/components/dialogs/new-project-dialog";
import { useProjects, useUnits, useStaff, useExpenses } from "@/lib/hooks/use-data";
import { formatLandArea, projectActualSpend, projectUnitStats } from "@/lib/projects";
import { formatDate, formatPkr } from "@/lib/format";

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const { data: units } = useUnits();
  const { data: staff } = useStaff();
  const { data: expenses } = useExpenses();
  const [open, setOpen] = React.useState(false);

  const stats = React.useMemo(() => {
    const all = projects ?? [];
    return {
      total: all.length,
      active: all.filter((p) => p.status === "active").length,
      totalBudget: all.reduce((s, p) => s + p.budget, 0),
      totalUnits: (units ?? []).length,
    };
  }, [projects, units]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">{projects?.length ?? 0} development schemes</p>
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={FolderKanban} label="Total projects" value={stats.total} />
        <StatTile icon={Layers} label="Active" value={stats.active} accent="success" />
        <StatTile icon={Banknote} label="Total budget" value={formatPkr(stats.totalBudget, { compact: true })} accent="gold" />
        <StatTile icon={Wallet} label="Units across schemes" value={stats.totalUnits} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)
          : projects?.map((p, i) => {
              const unitStats = projectUnitStats(units ?? [], p.name);
              const actual = projectActualSpend(expenses ?? [], p.name);
              const utilization = p.budget > 0 ? Math.min(100, Math.round((actual / p.budget) * 100)) : 0;
              const manager = staff?.find((s) => s.id === p.projectManagerId);
              const soldPercent = unitStats.total > 0 ? Math.round((unitStats.sold / unitStats.total) * 100) : 0;

              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.4 }}
                >
                  <Link href={`/dashboard/projects/${p.id}`} className="group block">
                    <Card className="p-5 shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-primary/[0.06]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                          <h3 className="mt-0.5 truncate font-heading text-lg font-semibold">{p.name}</h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <ProjectTypeBadge type={p.type} />
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3" />
                              {p.city}
                            </span>
                          </div>
                        </div>
                        <ProjectStatusBadge status={p.status} className="shrink-0" />
                      </div>

                      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.description}</p>

                      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-center">
                        <div>
                          <p className="font-heading text-base font-semibold text-success">{unitStats.available}</p>
                          <p className="text-[10px] text-muted-foreground">Available</p>
                        </div>
                        <div>
                          <p className="font-heading text-base font-semibold text-warning">{unitStats.reserved}</p>
                          <p className="text-[10px] text-muted-foreground">Reserved</p>
                        </div>
                        <div>
                          <p className="font-heading text-base font-semibold text-muted-foreground">{unitStats.sold}</p>
                          <p className="text-[10px] text-muted-foreground">Sold</p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Budget utilized</span>
                          <span className="font-medium">{formatPkr(actual, { compact: true })} / {formatPkr(p.budget, { compact: true })}</span>
                        </div>
                        <Progress value={utilization} />
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                        <span>{manager?.name ?? "Unassigned"} · {formatLandArea(p.landAreaMarla)}</span>
                        <span>{soldPercent}% sold · Due {formatDate(p.plannedEndDate)}</span>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
      </div>

      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  accent?: "primary" | "success" | "gold";
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    gold: "bg-gold/15 text-gold",
  }[accent];

  return (
    <Card className="flex-row items-center gap-3 p-3.5">
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${accentClasses}`}>
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0">
        <p className="font-heading text-lg font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
