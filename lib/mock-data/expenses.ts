import type { Expense, Contract, ContractStatus } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";
import { customers } from "./customers";
import { staff } from "./staff";

const rand = mulberry32(7007);

const EXPENSE_TYPES = ["Utility", "Rent", "Marketing", "Maintenance", "Travel", "Office Supplies"] as const;
const PAID_VIA = ["Company Cash", "HBL Current Account", "Petty Cash"] as const;

export const expenses: Expense[] = range(22).map((i) => {
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
