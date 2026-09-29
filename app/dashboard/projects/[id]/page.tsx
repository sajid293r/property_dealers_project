"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
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
        ? `${contract.number} marked completed`
        : `${contractor?.companyName ?? "Contractor"} removed from this project`,
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
          <ArrowLeft className="size-3.5" />
          Back to projects
        </Link>
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">This project doesn&apos;t exist, or was removed.</p>
        </Card>
      </div>
    );
  }

  const utilization = project.budget > 0 ? Math.min(100, Math.round((actualSpend / project.budget) * 100)) : 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div>
        <Link
          href="/dashboard/projects"
          className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Projects
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-heading text-2xl font-semibold">{project.name}</h1>
          <span className="font-mono text-sm text-muted-foreground">{project.code}</span>
          <ProjectStatusBadge status={project.status} />
          <ProjectTypeBadge type={project.type} />
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Approved Budget" value={project.budget} format={(n) => formatPkr(n, { compact: true })} icon={Banknote} index={0} />
        <KpiCard label="Actual Spend" value={actualSpend} format={(n) => formatPkr(n, { compact: true })} icon={Wallet} index={1} accent="gold" />
        <KpiCard label="Remaining Budget" value={Math.max(project.budget - actualSpend, 0)} format={(n) => formatPkr(n, { compact: true })} icon={Banknote} index={2} />
        <KpiCard label="Contractors Engaged" value={projectContracts.filter((c) => c.status === "active").length} format={(n) => n.toString()} icon={HardHat} index={3} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="space-y-4 p-5 lg:col-span-2">
          <h3 className="font-heading text-base font-semibold">Overview</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow icon={MapPin} label="Location" value={`${project.address}, ${project.city}`} />
            <InfoRow icon={Ruler} label="Land area" value={formatLandArea(project.landAreaMarla)} />
            <InfoRow icon={User} label="Project manager" value={manager?.name ?? "Unassigned"} />
            <InfoRow icon={Calendar} label="Planned timeline" value={`${formatDate(project.plannedStartDate)} — ${formatDate(project.plannedEndDate)}`} />
            {project.actualStartDate && <InfoRow icon={Calendar} label="Actual start" value={formatDate(project.actualStartDate)} />}
            {project.handoverDate && <InfoRow icon={Calendar} label="Handed over" value={formatDate(project.handoverDate)} />}
          </div>

          <div className="border-t border-border/60 pt-4">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Budget utilization</span>
              <span className="font-medium">{utilization}%</span>
            </div>
            <Progress value={utilization} className={cn(utilization >= 100 && "[&>div]:bg-destructive")} />
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-heading text-base font-semibold">Inventory</h3>
          <UnitStatusDonut units={projectUnits} />
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
            <span className="text-muted-foreground">Inventory value</span>
            <span className="font-medium tabular-nums">{formatPkr(unitStats?.inventoryValue ?? 0, { compact: true })}</span>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-base font-semibold">Contractors</h3>
            <p className="text-xs text-muted-foreground">{projectContracts.length} engagements on this project</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setAssignOpen(true)}>
            <HardHat className="size-3.5" />
            Assign Contractor
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Contractor</th>
                <th className="pb-2.5 font-medium">Scope</th>
                <th className="pb-2.5 font-medium">Value</th>
                <th className="pb-2.5 font-medium">Progress</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {projectContracts.map((c) => {
                const contractor = contractors?.find((ct) => ct.id === c.contractorId);
                return (
                  <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                    <td className="py-2.5">
                      <p className="font-medium">{contractor?.companyName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{contractor?.trade}</p>
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
                    <td className="py-2.5 text-right">
                      {c.status === "active" ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => decideContract(c, "completed")}>Mark completed</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => decideContract(c, "terminated")}>
                              Remove from project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs text-muted-foreground">No further actions</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {projectContracts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No contractors assigned yet.
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
