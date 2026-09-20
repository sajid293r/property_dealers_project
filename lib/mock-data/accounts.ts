import type { Account, Transaction } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";

const rand = mulberry32(6006);

export const accounts: Account[] = [
  { id: "acc-1", code: "AC-001", title: "Company Cash", type: "cash", balance: 1850000 },
  { id: "acc-2", code: "AC-002", title: "HBL Current Account", bankName: "HBL", type: "bank", balance: 6420000 },
  { id: "acc-3", code: "AC-003", title: "Meezan Bank", bankName: "Meezan Bank", type: "bank", balance: 3120000 },
  { id: "acc-4", code: "AC-004", title: "Petty Cash", type: "petty", balance: 85000 },
];

const CATEGORIES = ["Installment", "Booking", "Salary", "Marketing", "Utility", "Commission", "Transfer"] as const;
const TITLES = [
  "Installment received", "Booking advance", "Staff salary", "Facebook ads", "Office electricity bill",
  "Dealer commission", "Bank transfer",
] as const;

export const transactions: Transaction[] = range(60).map((i) => {
  const kind = rand() > 0.45 ? "credit" : "debit";
  const idx = Math.floor(rand() * CATEGORIES.length);
  return {
    id: `txn-${i + 1}`,
    accountId: pick(rand, accounts).id,
    kind,
    amount: Math.round((10000 + rand() * 500000) / 1000) * 1000,
    title: TITLES[idx],
    category: CATEGORIES[idx],
    date: dateOffset(-Math.floor(rand() * 90)),
    confirmed: rand() > 0.15,
  };
});
