import {
  Building2,
  Building,
  Landmark,
  Hammer,
  Bolt,
  Wrench,
  Trees,
  Route,
  PaintRoller,
  type LucideIcon,
} from "lucide-react";
import type { ConstructionContractStatus, ContractorTrade, Expense, Project, ProjectStatus, ProjectType, Unit } from "@/lib/types";

export const PROJECT_TYPES: ProjectType[] = ["Residential", "Commercial", "Mixed-Use"];

export const PROJECT_TYPE_ICON: Record<ProjectType, LucideIcon> = {
  Residential: Building2,
  Commercial: Landmark,
  "Mixed-Use": Building,
};

export interface ProjectStatusMeta {
  status: ProjectStatus;
  label: string;
  classes: string;
}

export const PROJECT_STATUSES: ProjectStatusMeta[] = [
  { status: "planning", label: "Planning", classes: "bg-muted text-muted-foreground" },
  { status: "active", label: "Active", classes: "bg-success/12 text-success" },
  { status: "on_hold", label: "On Hold", classes: "bg-warning/12 text-warning" },
  { status: "completed", label: "Completed", classes: "bg-primary/12 text-primary" },
  { status: "cancelled", label: "Cancelled", classes: "bg-destructive/10 text-destructive" },
];

export function projectStatusMeta(status: ProjectStatus) {
  return PROJECT_STATUSES.find((s) => s.status === status)!;
}

export const CONTRACTOR_TRADES: ContractorTrade[] = [
  "General Contractor",
  "Civil Works",
  "Electrical",
  "Plumbing",
  "Landscaping",
  "Road & Infrastructure",
  "Interior Finishing",
];

export const CONTRACTOR_TRADE_ICON: Record<ContractorTrade, LucideIcon> = {
  "General Contractor": Hammer,
  "Civil Works": Building2,
  Electrical: Bolt,
  Plumbing: Wrench,
  Landscaping: Trees,
  "Road & Infrastructure": Route,
  "Interior Finishing": PaintRoller,
};

export interface ContractStatusMeta {
  status: ConstructionContractStatus;
  label: string;
  classes: string;
}

export const CONTRACT_STATUSES: ContractStatusMeta[] = [
  { status: "active", label: "Active", classes: "bg-success/12 text-success" },
  { status: "completed", label: "Completed", classes: "bg-primary/12 text-primary" },
  { status: "terminated", label: "Terminated", classes: "bg-destructive/10 text-destructive" },
];

export function contractStatusMeta(status: ConstructionContractStatus) {
  return CONTRACT_STATUSES.find((s) => s.status === status)!;
}

/** 1 Kanal = 20 Marla — the display convention for larger scheme-scale land parcels. */
export function formatLandArea(marla: number) {
  const kanal = Math.floor(marla / 20);
  const rest = marla % 20;
  if (kanal === 0) return `${marla} Marla`;
  if (rest === 0) return `${kanal} Kanal`;
  return `${kanal} Kanal ${rest} Marla`;
}

export function unitsForProject(units: Unit[], projectName: string) {
  return units.filter((u) => u.project === projectName);
}

export interface ProjectUnitStats {
  total: number;
  available: number;
  reserved: number;
  sold: number;
  inventoryValue: number;
  soldValue: number;
}

export function projectUnitStats(units: Unit[], projectName: string): ProjectUnitStats {
  const scoped = unitsForProject(units, projectName);
  return {
    total: scoped.length,
    available: scoped.filter((u) => u.status === "available").length,
    reserved: scoped.filter((u) => u.status === "reserved").length,
    sold: scoped.filter((u) => u.status === "sold").length,
    inventoryValue: scoped.reduce((s, u) => s + u.price, 0),
    soldValue: scoped.filter((u) => u.status === "sold").reduce((s, u) => s + u.price, 0),
  };
}

/** Paid construction/development costs tagged to this project — the "Actual" side of Budget vs Actual. */
export function projectActualSpend(expenses: Expense[], projectName: string) {
  return expenses
    .filter((e) => e.project === projectName && e.status === "paid")
    .reduce((s, e) => s + e.amount, 0);
}

export function nextProjectCode(existing: Project[]) {
  const maxSeq = existing.reduce((max, p) => {
    const seq = Number(p.code.split("-")[1]);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  return `PRJ-${String(maxSeq + 1).padStart(3, "0")}`;
}
