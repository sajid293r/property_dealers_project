import {
  units,
  customers,
  deals,
  leads,
  staff,
  accounts,
  transactions,
  expenses,
} from "@/lib/mock-data";
import { contracts } from "@/lib/mock-data/expenses";

// Simulated latency so loading/skeleton states feel real even with mock data.
// This is the seam where real fetch()/server-action calls replace the in-memory reads.
function withLatency<T>(data: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export const unitsService = {
  list: () => withLatency(units),
};

export const customersService = {
  list: () => withLatency(customers),
};

export const dealsService = {
  list: () => withLatency(deals),
};

export const leadsService = {
  list: () => withLatency(leads),
};

export const staffService = {
  list: () => withLatency(staff),
};

export const accountsService = {
  list: () => withLatency(accounts),
  transactions: () => withLatency(transactions),
};

export const expensesService = {
  list: () => withLatency(expenses),
};

export const contractsService = {
  list: () => withLatency(contracts),
};
