import { Badge } from "@/components/ui/badge";
import { contractStatusMeta, projectStatusMeta } from "@/lib/projects";
import type { ConstructionContractStatus, ProjectStatus, ProjectType } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const meta = projectStatusMeta(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", meta.classes, className)}>
      {meta.label}
    </span>
  );
}

const TYPE_CLASSES: Record<ProjectType, string> = {
  Residential: "bg-chart-3/15 text-chart-3",
  Commercial: "bg-gold/15 text-gold",
  "Mixed-Use": "bg-chart-5/15 text-chart-5",
};

export function ProjectTypeBadge({ type, className }: { type: ProjectType; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", TYPE_CLASSES[type], className)}>
      {type}
    </Badge>
  );
}

export function ContractStatusBadge({ status, className }: { status: ConstructionContractStatus; className?: string }) {
  const meta = contractStatusMeta(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", meta.classes, className)}>
      {meta.label}
    </span>
  );
}
