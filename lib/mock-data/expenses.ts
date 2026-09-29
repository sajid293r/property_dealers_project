import type { Expense, Contract, ContractStatus } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";
import { customers } from "./customers";
import { staff } from "./staff";

const rand = mulberry32(7007);

const EXPENSE_TYPES = ["Utility", "Rent", "Marketing", "Maintenance", "Travel", "Office Supplies"] as const;
const PAID_VIA = ["Company Cash", "HBL Current Account", "Petty Cash"] as const;

const generalExpenses: Expense[] = range(22).map((i) => {
  const status = rand() > 0.25 ? "paid" : "unpaid";
  return {
    id: `exp-${i + 1}`,
    title: `${pick(rand, EXPENSE_TYPES)} expense #${i + 1}`,
    type: pick(rand, EXPENSE_TYPES),
    amount: Math.round((5000 + rand() * 150000) / 500) * 500,
    paidVia: pick(rand, PAID_VIA),
    status,
    date: dateOffset(-Math.floor(rand() * 60)),
  };
});

// Construction/development costs, tagged per project — feeds each project's
// "Actual spend" (Budget vs Actual) and rolls up into the P&L's
// "Contractor & Construction Cost" line via EXPENSE_TYPE_TO_ACCOUNT.
const CONSTRUCTION_SPEND: { project: string; title: string; amount: number; daysAgo: number; status: "paid" | "unpaid" }[] = [
  { project: "Green Valley Homes", title: "Civil works — running bill #6", amount: 25_200_000, daysAgo: 12, status: "paid" },
  { project: "Green Valley Homes", title: "Internal roads — final bill", amount: 65_000_000, daysAgo: 95, status: "paid" },
  { project: "Green Valley Homes", title: "Earthwork & leveling — running bill", amount: 31_500_000, daysAgo: 40, status: "paid" },
  { project: "Green Valley Homes", title: "Landscaping Phase 1 — mobilization advance", amount: 3_600_000, daysAgo: 20, status: "unpaid" },
  { project: "Al-Noor Heights", title: "Structural works — running bill #3", amount: 60_000_000, daysAgo: 30, status: "paid" },
  { project: "Al-Noor Heights", title: "Electrical infrastructure — running bill", amount: 14_000_000, daysAgo: 18, status: "paid" },
  { project: "Al-Noor Heights", title: "Water & sewerage network — running bill", amount: 15_300_000, daysAgo: 25, status: "unpaid" },
  { project: "Riverside Enclave", title: "Topographic survey & site leveling — advance", amount: 3_600_000, daysAgo: 8, status: "paid" },
  { project: "Emerald Gardens", title: "Main civil works — final settlement", amount: 95_000_000, daysAgo: 150, status: "paid" },
  { project: "Emerald Gardens", title: "Interior finishing — final bill", amount: 21_000_000, daysAgo: 110, status: "paid" },
];

const constructionExpenses: Expense[] = CONSTRUCTION_SPEND.map((c, i) => ({
  id: `exp-construction-${i + 1}`,
  title: c.title,
  type: "Construction",
  amount: c.amount,
  paidVia: "HBL Current Account",
  status: c.status,
  date: dateOffset(-c.daysAgo),
  project: c.project,
}));

export const expenses: Expense[] = [...generalExpenses, ...constructionExpenses];

const CONTRACT_TYPES = ["Sale Agreement", "Lease Agreement", "Dealer Agreement", "Vendor Contract"] as const;
const rand2 = mulberry32(8008);

export const contracts: Contract[] = range(16).map((i) => {
  const startOffset = -Math.floor(rand2() * 300);
  const durationDays = 180 + Math.floor(rand2() * 500);
  const endOffset = startOffset + durationDays;
  let status: ContractStatus = "active";
  if (endOffset < 0) status = "expired";
  else if (endOffset < 30) status = "expiring";
  const type = pick(rand2, CONTRACT_TYPES);
  const partyName =
    type === "Dealer Agreement" ? pick(rand2, staff).name : pick(rand2, customers).name;
  return {
    id: `contract-${i + 1}`,
    title: `${type} #${1000 + i}`,
    type,
    partyName,
    startDate: dateOffset(startOffset),
    endDate: dateOffset(endOffset),
    status,
    value: Math.round((200000 + rand2() * 3000000) / 1000) * 1000,
  };
});
