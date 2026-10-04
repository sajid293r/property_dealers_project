"use client";

import { FolderKanban as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader
        icon={HeaderIcon}
        eyebrow="Projects"
        title="Projects"
        description={<>{projects?.length ?? 0} development schemes</>}
        actions={<>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          New Project
        </Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={FolderKanban} label="Total projects" value={stats.total} />
        <StatTile icon={Layers} label="Active" value={stats.active} accent="success" />
        <StatTile icon={Banknote} label="Total budget" value={formatPkr(stats.totalBudget, { compact: true })} accent="gold" />
        <StatTile icon={Wallet} label="Properties across schemes" value={stats.totalUnits} />
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
                    <Card className="spotlight gap-0 p-0 shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/[0.1] group-hover:ring-gold/40">
                      <div className="surface-hero relative overflow-hidden px-5 pb-4 pt-5">
                        <div className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-gold/25 blur-3xl transition-transform duration-500 group-hover:scale-125" />
                        <div
                          className="pointer-events-none absolute inset-0 opacity-[0.1]"
                          style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "18px 18px" }}
                        />
                        <div className="relative flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] tracking-wider text-white/55">{p.code}</p>
                            <h3 className="mt-0.5 truncate font-heading text-xl font-semibold text-white">{p.name}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <ProjectTypeBadge type={p.type} className="bg-white/15 text-white" />
                              <span className="flex items-center gap-1 text-xs text-white/65">
                                <MapPin className="size-3" />
                                {p.city}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <ProjectStatusBadge status={p.status} className="bg-white/15 text-white" />
                            <SoldRing percent={soldPercent} />
                          </div>
                        </div>
                      </div>
                      <div className="p-5 pt-4">
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

function SoldRing({ percent }: { percent: number }) {
  const c = 2 * Math.PI * 15;
  return (
    <div className="relative size-11">
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" stroke="white" strokeOpacity="0.15" strokeWidth="3.5" />
        <motion.circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke="oklch(0.82 0.13 85)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - percent / 100) }}
          transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white">
        {percent}%
      </span>
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
    <Card className="group/stat flex-row items-center gap-3 p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:ring-gold/40">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover/stat:scale-110 group-hover/stat:-rotate-6 ${accentClasses}`}>
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0">
        <p className="font-heading text-lg font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
