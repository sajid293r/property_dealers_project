import type { Project, ProjectStatus, ProjectType } from "@/lib/types";
import { mulberry32, pick, dateOffset } from "./seed";
import { staff } from "./staff";

const rand = mulberry32(1101);

const managers = staff.filter((s) => s.role === "manager");
function manager(i: number) {
  return managers.length > 0 ? managers[i % managers.length] : staff[i % staff.length];
}

// One Project master record per scheme name already carried on `Unit.project`
// — kept as a name match (not an FK) so every existing page that already
// groups by `unit.project` (Reports, Vouchers, Quotations...) keeps working
// unchanged; this module is additive on top of that.
interface Seed {
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  landAreaMarla: number;
  budget: number;
  plannedStartOffset: number;
  plannedEndOffset: number;
  actualStartOffset?: number;
  handoverOffset?: number;
  description: string;
}

const SEEDS: Seed[] = [
  {
    name: "Green Valley Homes",
    type: "Residential",
    status: "active",
    landAreaMarla: 1600,
    budget: 850_000_000,
    plannedStartOffset: -420,
    plannedEndOffset: 260,
    actualStartOffset: -410,
    description: "A gated residential scheme of plots and houses on the city's northern ring road, phased over three blocks.",
  },
  {
    name: "Al-Noor Heights",
    type: "Mixed-Use",
    status: "active",
    landAreaMarla: 900,
    budget: 620_000_000,
    plannedStartOffset: -260,
    plannedEndOffset: 400,
    actualStartOffset: -250,
    description: "Mixed-use development combining residential plots with a retail frontage along the main boulevard.",
  },
  {
    name: "Riverside Enclave",
    type: "Residential",
    status: "planning",
    landAreaMarla: 2200,
    budget: 1_100_000_000,
    plannedStartOffset: 30,
    plannedEndOffset: 700,
    description: "Riverfront residential scheme currently in land development and approvals — construction not yet mobilized.",
  },
  {
    name: "Emerald Gardens",
    type: "Residential",
    status: "completed",
    landAreaMarla: 700,
    budget: 340_000_000,
    plannedStartOffset: -900,
    plannedEndOffset: -120,
    actualStartOffset: -890,
    handoverOffset: -100,
    description: "Fully developed and handed-over residential scheme — all infrastructure and utility work is complete.",
  },
];

export const projects: Project[] = SEEDS.map((s, i) => ({
  id: `proj-${i + 1}`,
  code: `PRJ-${String(i + 1).padStart(3, "0")}`,
  name: s.name,
  type: s.type,
  status: s.status,
  description: s.description,
  city: pick(rand, ["Lahore", "Islamabad", "Rawalpindi"]),
  address: `${s.name} Scheme, Main GT Road`,
  landAreaMarla: s.landAreaMarla,
  projectManagerId: manager(i).id,
  budget: s.budget,
  plannedStartDate: dateOffset(s.plannedStartOffset),
  plannedEndDate: dateOffset(s.plannedEndOffset),
  actualStartDate: s.actualStartOffset !== undefined ? dateOffset(s.actualStartOffset) : undefined,
  handoverDate: s.handoverOffset !== undefined ? dateOffset(s.handoverOffset) : undefined,
  createdAt: dateOffset(s.plannedStartOffset - 10),
}));
