"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Banknote,
  Calendar,
  HardHat,
  MapPin,
  MoreHorizontal,
  Ruler,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { UnitStatusDonut } from "@/components/charts/unit-status-donut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectStatusBadge, ProjectTypeBadge, ContractStatusBadge } from "@/components/projects/badges";
import { AssignContractorDialog } from "@/components/dialogs/assign-contractor-dialog";
import {
  useProjects,
  useUnits,
  useStaff,
  useExpenses,
  useContractors,
  useConstructionContracts,
} from "@/lib/hooks/use-data";
import { formatLandArea, projectActualSpend, projectUnitStats } from "@/lib/projects";
import { formatDate, formatPkr } from "@/lib/format";
import type { ConstructionContract } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import { tOr } from "@/lib/i18n/runtime";
import { Ltr } from "@/components/ltr";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const queryClient = useQueryClient();

  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: units } = useUnits();
  const { data: staff } = useStaff();
  const { data: expenses } = useExpenses();
  const { data: contractors } = useContractors();
  const { data: contracts } = useConstructionContracts();

  const [assignOpen, setAssignOpen] = React.useState(false);

  const project = projects?.find((p) => p.id === id);
  const manager = staff?.find((s) => s.id === project?.projectManagerId);
  const projectUnits = React.useMemo(
    () => (units ?? []).filter((u) => u.project === project?.name),
    [units, project],
  );
  const unitStats = project ? projectUnitStats(units ?? [], project.name) : null;
  const actualSpend = project ? projectActualSpend(expenses ?? [], project.name) : 0;
  const projectContracts = (contracts ?? []).filter((c) => c.projectId === project?.id);

  function decideContract(contract: ConstructionContract, status: "completed" | "terminated") {
    queryClient.setQueryData<ConstructionContract[]>(["constructionContracts"], (old = []) =>
      old.map((c) =>
        c.id === contract.id
          ? { ...c, status, progressPercent: status === "completed" ? 100 : c.progressPercent }
          : c,
      ),
    );
    const contractor = contractors?.find((c) => c.id === contract.contractorId);
    toast.success(
      status === "completed"
        ? t("projects.detail.markedCompleted", { number: contract.number })
        : t("projects.detail.removed", { name: contractor?.companyName ?? t("projects.detail.contractor") }),
    );
  }

  if (projectsLoading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-4">
        <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
          {t("projects.detail.back")}
        </Link>
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("projects.detail.notFound")}</p>
        </Card>
      </div>
    );
  }

  const utilization = project.budget > 0 ? Math.min(100, Math.round((actualSpend / project.budget) * 100)) : 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="surface-hero sheen relative isolate overflow-hidden rounded-3xl p-6 shadow-xl shadow-primary/15 ring-1 ring-white/10 md:p-8"
      >
        <div className="pointer-events-none absolute -end-10 -top-16 -z-10 size-72 animate-aurora rounded-full bg-gold/25 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.1]"
          style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "20px 20px" }}
        />
        <Link
          href="/dashboard/projects"
          className="mb-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        >
          <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
          {t("projects.detail.all")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold text-white md:text-4xl">{project.name}</h1>
          <span className="font-mono text-sm text-white/55"><Ltr>{project.code}</Ltr></span>
          <ProjectStatusBadge status={project.status} className="bg-white/15 text-white" />
          <ProjectTypeBadge type={project.type} className="bg-white/15 text-white" />
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">{project.description}</p>
        <div className="mt-5 max-w-md">
          <div className="mb-1.5 flex items-center justify-between text-xs text-white/70">
            <span>{t("projects.card.budgetUtilized")}</span>
            <span className="font-semibold text-gold"><Ltr>{utilization}%</Ltr></span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/15">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold to-[oklch(0.9_0.12_90)]"
              initial={{ width: 0 }}
              animate={{ width: `${utilization}%` }}
              transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t("projects.detail.approvedBudget")} value={project.budget} format={(n) => formatPkr(n, { compact: true })} icon={Banknote} index={0} />
        <KpiCard label={t("projects.detail.actualSpend")} value={actualSpend} format={(n) => formatPkr(n, { compact: true })} icon={Wallet} index={1} accent="gold" />
        <KpiCard label={t("projects.detail.remaining")} value={Math.max(project.budget - actualSpend, 0)} format={(n) => formatPkr(n, { compact: true })} icon={Banknote} index={2} />
        <KpiCard label={t("projects.detail.contractorsEngaged")} value={projectContracts.filter((c) => c.status === "active").length} format={(n) => n.toString()} icon={HardHat} index={3} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="space-y-4 p-5 lg:col-span-2">
          <h3 className="font-heading text-base font-semibold">{t("projects.detail.overview")}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow icon={MapPin} label={t("projects.detail.location")} value={`${project.address}, ${project.city}`} />
            <InfoRow icon={Ruler} label={t("projects.detail.landArea")} value={formatLandArea(project.landAreaMarla)} />
            <InfoRow icon={User} label={t("projects.detail.manager")} value={manager?.name ?? t("projects.card.unassigned")} />
            <InfoRow icon={Calendar} label={t("projects.detail.timeline")} value={`${formatDate(project.plannedStartDate)} — ${formatDate(project.plannedEndDate)}`} />
            {project.actualStartDate && <InfoRow icon={Calendar} label={t("projects.detail.actualStart")} value={formatDate(project.actualStartDate)} />}
            {project.handoverDate && <InfoRow icon={Calendar} label={t("projects.detail.handedOver")} value={formatDate(project.handoverDate)} />}
          </div>

          <div className="border-t border-border/60 pt-4">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("projects.detail.utilization")}</span>
              <span className="font-medium"><Ltr>{utilization}%</Ltr></span>
            </div>
            <Progress value={utilization} className={cn(utilization >= 100 && "[&>div]:bg-destructive")} />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-heading text-base font-semibold">{t("projects.detail.properties")}</h3>
          <UnitStatusDonut units={projectUnits} />
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
            <span className="text-muted-foreground">{t("projects.detail.portfolioValue")}</span>
            <span className="font-medium tabular-nums">{formatPkr(unitStats?.inventoryValue ?? 0, { compact: true })}</span>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-base font-semibold">{t("projects.detail.contractors")}</h3>
            <p className="text-xs text-muted-foreground">{t("projects.detail.engagements", { count: projectContracts.length })}</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setAssignOpen(true)}>
            <HardHat className="size-3.5" />
            {t("projects.detail.assign")}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">{t("projects.detail.colContractor")}</th>
                <th className="pb-2.5 font-medium">{t("projects.detail.colScope")}</th>
                <th className="pb-2.5 font-medium">{t("projects.detail.colValue")}</th>
                <th className="pb-2.5 font-medium">{t("projects.detail.colProgress")}</th>
                <th className="pb-2.5 font-medium">{t("common.status")}</th>
                <th className="pb-2.5 font-medium"><span className="sr-only">{t("common.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {projectContracts.map((c) => {
                const contractor = contractors?.find((ct) => ct.id === c.contractorId);
                return (
                  <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                    <td className="py-2.5">
                      <p className="font-medium">{contractor?.companyName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{contractor?.trade ? tOr(t, `projects.trade.${contractor.trade}`, contractor.trade) : ""}</p>
                    </td>
                    <td className="max-w-[240px] py-2.5 text-muted-foreground">{c.scopeOfWork}</td>
                    <td className="py-2.5 tabular-nums font-medium">{formatPkr(c.contractValue, { compact: true })}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Progress value={c.progressPercent} className="w-20" />
                        <span className="text-xs tabular-nums text-muted-foreground">{c.progressPercent}%</span>
                      </div>
                    </td>
                    <td className="py-2.5"><ContractStatusBadge status={c.status} /></td>
                    <td className="py-2.5 text-end">
                      {c.status === "active" ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => decideContract(c, "completed")}>{t("projects.detail.markCompleted")}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => decideContract(c, "terminated")}>
                              {t("projects.detail.remove")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("projects.detail.noActions")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {projectContracts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {t("projects.detail.noContractors")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AssignContractorDialog open={assignOpen} onOpenChange={setAssignOpen} projectId={project.id} />
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
