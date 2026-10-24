import { api } from "@/lib/api/client";
import type { Project, ProjectStatus, ProjectType, Unit, UnitStatus } from "@/lib/types";

/**
 * The live (real-data) side of the services in lib/services. Everything the API returns is turned into the same
 * shapes the screens already use, so a screen does not need to know whether its data is real or demo.
 * Where the database does not hold something yet (photos, project managers) the field is left empty and the
 * screen shows a neutral placeholder.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Real companies have database ids (uuids); the demo companies are "co-1", "co-2", … */
export const isLiveCompanyId = (id: string) => UUID.test(id);

/** The standard Punjab marla, used only to show a marla figure next to a stored square-foot size. */
const MARLA_SQFT = 272.25;

// ───────────────────────────────────────────── properties
interface ApiProperty {
  id: string;
  code: string;
  title: string;
  status: string;
  listPrice: string;
  installmentsAvailable: boolean;
  project: string | null;
  block: string | null;
  type: string;
  typeId: string;
  sizeValue: string | null;
  sizeUnit: string | null;
  sizeSqft: string | null;
}

function toUnitStatus(status: string): UnitStatus {
  if (status === "available" || status === "reserved" || status === "sold") return status;
  // blocked / rented / cancelled have no screen yet: treat as "not for sale right now"
  return "reserved";
}

function toUnit(p: ApiProperty): Unit {
  const sqft = p.sizeSqft ? Number(p.sizeSqft) : 0;
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    project: p.project ?? "Unassigned",
    category: p.type,
    sizeMarla: sqft ? Math.round((sqft / MARLA_SQFT) * 100) / 100 : 0,
    sqft,
    price: Number(p.listPrice),
    status: toUnitStatus(p.status),
    paymentType: p.installmentsAvailable ? "installment" : "cash",
    block: p.block ?? "",
    imageUrl: "",
  };
}

export async function fetchUnits(companyId: string): Promise<Unit[]> {
  // paging comes with the real property screens; 200 covers a scheme's worth for now
  return (await api<ApiProperty[]>("/v1/properties?limit=200", { companyId })).map(toUnit);
}

export interface NewPropertyInput {
  title: string;
  typeId: string;
  projectId?: string;
  block?: string;
  listPrice: string;
  size?: { value: number; unit: "marla" | "kanal" | "sqft" | "sqyd" | "acre" };
  installmentsAvailable: boolean;
}

export async function createProperty(companyId: string, input: NewPropertyInput): Promise<Unit> {
  return toUnit(await api<ApiProperty>("/v1/properties", { method: "POST", companyId, body: input }));
}

export interface PropertyType {
  id: string;
  code: string;
  name: string;
  group: string;
}

export const fetchPropertyTypes = (companyId: string) => api<PropertyType[]>("/v1/property-types", { companyId });

// ───────────────────────────────────────────── projects
interface ApiProject {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  city: string | null;
  address: string | null;
  description: string | null;
  createdAt: string;
  landAreaMarla: string | null;
  approvedBudget: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  propertyCount?: number;
  availableCount?: number;
}

const PROJECT_TYPE: Record<string, ProjectType> = { residential: "Residential", commercial: "Commercial", mixed_use: "Mixed-Use" };

function toProject(p: ApiProject): Project {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    type: PROJECT_TYPE[p.type] ?? "Residential",
    status: p.status as ProjectStatus,
    description: p.description ?? "",
    city: p.city ?? "",
    address: p.address ?? "",
    landAreaMarla: p.landAreaMarla ? Number(p.landAreaMarla) : 0,
    projectManagerId: "", // staff are not connected yet
    budget: Number(p.approvedBudget),
    plannedStartDate: p.plannedStart ?? "",
    plannedEndDate: p.plannedEnd ?? "",
    createdAt: p.createdAt.slice(0, 10),
  };
}

export async function fetchProjects(companyId: string): Promise<Project[]> {
  return (await api<ApiProject[]>("/v1/projects?limit=200", { companyId })).map(toProject);
}

export interface NewProjectInput {
  name: string;
  type: "residential" | "commercial" | "mixed_use";
  city?: string;
  address?: string;
  description?: string;
  landAreaMarla?: number;
  approvedBudget?: string;
  plannedStart?: string;
  plannedEnd?: string;
}

export async function createProject(companyId: string, input: NewProjectInput): Promise<Project> {
  return toProject(await api<ApiProject>("/v1/projects", { method: "POST", companyId, body: input }));
}
