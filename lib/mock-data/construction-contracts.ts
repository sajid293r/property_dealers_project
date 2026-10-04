import type { ConstructionContract, ConstructionContractStatus } from "@/lib/types";
import { dateOffset } from "./seed";

interface Seed {
  projectId: string;
  contractorId: string;
  scopeOfWork: string;
  contractValue: number;
  paidRatio: number;
  retentionPercent: number;
  startOffset: number;
  endOffset: number;
  status: ConstructionContractStatus;
  progressPercent: number;
}

const SEEDS: Seed[] = [
  // Green Valley Homes (active)
  { projectId: "proj-1", contractorId: "ctr-1", scopeOfWork: "Main civil & structural works — Blocks A–C", contractValue: 180_000_000, paidRatio: 0.6, retentionPercent: 10, startOffset: -400, endOffset: 120, status: "active", progressPercent: 65 },
  { projectId: "proj-1", contractorId: "ctr-2", scopeOfWork: "Earthwork, leveling and boundary wall", contractValue: 42_000_000, paidRatio: 0.75, retentionPercent: 5, startOffset: -410, endOffset: -60, status: "active", progressPercent: 80 },
  { projectId: "proj-1", contractorId: "ctr-6", scopeOfWork: "Internal road network & storm drainage", contractValue: 65_000_000, paidRatio: 1, retentionPercent: 10, startOffset: -380, endOffset: -100, status: "completed", progressPercent: 100 },
  { projectId: "proj-1", contractorId: "ctr-5", scopeOfWork: "Park & green belt landscaping — Phase 1", contractValue: 18_000_000, paidRatio: 0.2, retentionPercent: 5, startOffset: -90, endOffset: 150, status: "active", progressPercent: 30 },

  // Al-Noor Heights (active)
  { projectId: "proj-2", contractorId: "ctr-8", scopeOfWork: "Structural works — retail frontage & residential plots", contractValue: 150_000_000, paidRatio: 0.4, retentionPercent: 10, startOffset: -240, endOffset: 260, status: "active", progressPercent: 45 },
  { projectId: "proj-2", contractorId: "ctr-3", scopeOfWork: "Electrical infrastructure & street lighting", contractValue: 28_000_000, paidRatio: 0.5, retentionPercent: 5, startOffset: -200, endOffset: 100, status: "active", progressPercent: 55 },
  { projectId: "proj-2", contractorId: "ctr-4", scopeOfWork: "Water supply & sewerage network", contractValue: 34_000_000, paidRatio: 0.45, retentionPercent: 5, startOffset: -190, endOffset: 110, status: "active", progressPercent: 50 },

  // Riverside Enclave (planning — site works only just starting)
  { projectId: "proj-3", contractorId: "ctr-2", scopeOfWork: "Topographic survey & site leveling", contractValue: 12_000_000, paidRatio: 0.3, retentionPercent: 5, startOffset: -10, endOffset: 80, status: "active", progressPercent: 8 },

  // Emerald Gardens (completed scheme)
  { projectId: "proj-4", contractorId: "ctr-9", scopeOfWork: "Main civil & structural works", contractValue: 95_000_000, paidRatio: 1, retentionPercent: 10, startOffset: -880, endOffset: -150, status: "completed", progressPercent: 100 },
  { projectId: "proj-4", contractorId: "ctr-7", scopeOfWork: "Interior finishing — show properties & clubhouse", contractValue: 21_000_000, paidRatio: 1, retentionPercent: 5, startOffset: -300, endOffset: -110, status: "completed", progressPercent: 100 },
  { projectId: "proj-4", contractorId: "ctr-6", scopeOfWork: "Internal roads & drainage (original contractor)", contractValue: 30_000_000, paidRatio: 0.4, retentionPercent: 10, startOffset: -700, endOffset: -400, status: "terminated", progressPercent: 40 },
];

export const constructionContracts: ConstructionContract[] = SEEDS.map((s, i) => ({
  id: `cc-${i + 1}`,
  number: `CC-${String(i + 1).padStart(3, "0")}`,
  projectId: s.projectId,
  contractorId: s.contractorId,
  scopeOfWork: s.scopeOfWork,
  contractValue: s.contractValue,
  paidAmount: Math.round((s.contractValue * s.paidRatio) / 1000) * 1000,
  retentionPercent: s.retentionPercent,
  startDate: dateOffset(s.startOffset),
  endDate: dateOffset(s.endOffset),
  status: s.status,
  progressPercent: s.progressPercent,
  createdAt: dateOffset(s.startOffset - 5),
}));
