import type {
  Account,
  Contract,
  Customer,
  Expense,
  LedgerAccountBalance,
  LedgerAccountNode,
  StaffMember,
  Transaction,
  Unit,
} from "@/lib/types";
import { formatPkr } from "@/lib/format";

/**
 * A level-wise numbered chart of accounts: Class.Group.Subgroup.Account,
 * coded 2-2-2-4 digits (e.g. "03.01.01.0001") — the same segmented-code
 * convention used by mainstream Pakistani ERPs (e.g. Numbers ERP's
 * Chart of Account screen: 1.01.01.0001-style codes) and, structurally,
 * the same idea as Dynamics 365's Main Account Type/Category split or
 * Odoo's account groups auto-rolling up by code prefix — just with the
 * grouping made explicit instead of inferred from the code.
 *
 * Class order follows the reference tool: Capital, Liabilities, Assets,
 * Income, Expenses (a "sources of funds, then application of funds" layout
 * rather than the Assets-first Western convention).
 *
 * Balances are never hand-entered — `buildChartOfAccounts` derives every
 * leaf from the same mock data the rest of the app already uses (units,
 * customers, staff, transactions, expenses, contracts), then rolls group
 * totals up from their children.
 */
export const COA_TREE: LedgerAccountNode[] = [
  // ── 01 · CAPITAL ─────────────────────────────────────────────────
  { id: "01", code: "01", name: "Capital", accountClass: "equity", category: "equity", isGroup: true },
  { id: "01.01", code: "01.01", name: "Owner's Equity", accountClass: "equity", category: "equity", parentId: "01", isGroup: true },
  { id: "01.01.01", code: "01.01.01", name: "Capital Account", accountClass: "equity", category: "equity", parentId: "01.01", isGroup: true },
  { id: "01.01.01.0001", code: "01.01.01.0001", name: "Owner's Capital", accountClass: "equity", category: "equity", parentId: "01.01.01" },
  { id: "01.01.02", code: "01.01.02", name: "Accumulated Profit & Loss", accountClass: "equity", category: "equity_unaffected", parentId: "01.01", isGroup: true },
  { id: "01.01.02.0001", code: "01.01.02.0001", name: "Retained Earnings", accountClass: "equity", category: "equity_unaffected", parentId: "01.01.02" },

  // ── 02 · LIABILITIES ─────────────────────────────────────────────
  { id: "02", code: "02", name: "Liabilities", accountClass: "liability", category: "liability", isGroup: true },
  { id: "02.01", code: "02.01", name: "Current Liabilities", accountClass: "liability", category: "liability_current", parentId: "02", isGroup: true },
  { id: "02.01.01", code: "02.01.01", name: "Accounts Payable", accountClass: "liability", category: "liability_payable", parentId: "02.01", isGroup: true },
  { id: "02.01.01.0001", code: "02.01.01.0001", name: "Dealer Commission Payable", accountClass: "liability", category: "liability_payable", parentId: "02.01.01" },
  { id: "02.01.01.0002", code: "02.01.01.0002", name: "Accrued Expenses Payable", accountClass: "liability", category: "liability_payable", parentId: "02.01.01" },
  { id: "02.02", code: "02.02", name: "Long Term Liabilities", accountClass: "liability", category: "liability_non_current", parentId: "02", isGroup: true },
  { id: "02.02.01", code: "02.02.01", name: "Long Term Loans", accountClass: "liability", category: "liability_non_current", parentId: "02.02", isGroup: true },
  { id: "02.02.01.0001", code: "02.02.01.0001", name: "Bank Loan Payable", accountClass: "liability", category: "liability_non_current", parentId: "02.02.01" },

  // ── 03 · ASSETS ──────────────────────────────────────────────────
  { id: "03", code: "03", name: "Assets", accountClass: "asset", category: "asset", isGroup: true },
  { id: "03.01", code: "03.01", name: "Current Assets", accountClass: "asset", category: "asset_current", parentId: "03", isGroup: true },
  { id: "03.01.01", code: "03.01.01", name: "Cash & Bank", accountClass: "asset", category: "asset_cash", parentId: "03.01", isGroup: true },
  { id: "03.01.02", code: "03.01.02", name: "Receivables", accountClass: "asset", category: "asset_receivable", parentId: "03.01", isGroup: true },
  { id: "03.01.02.0001", code: "03.01.02.0001", name: "Trade Receivables — Customers", accountClass: "asset", category: "asset_receivable", parentId: "03.01.02" },
  { id: "03.01.02.0002", code: "03.01.02.0002", name: "Staff Advances Receivable", accountClass: "asset", category: "asset_receivable", parentId: "03.01.02" },
  { id: "03.01.03", code: "03.01.03", name: "Stock In Hand", accountClass: "asset", category: "asset_current", parentId: "03.01", isGroup: true },
  { id: "03.01.03.0001", code: "03.01.03.0001", name: "Unsold Units Inventory", accountClass: "asset", category: "asset_current", parentId: "03.01.03" },
  { id: "03.01.04", code: "03.01.04", name: "Prepayments", accountClass: "asset", category: "asset_prepayments", parentId: "03.01", isGroup: true },
  { id: "03.01.04.0001", code: "03.01.04.0001", name: "Prepaid Rent", accountClass: "asset", category: "asset_prepayments", parentId: "03.01.04" },
  { id: "03.02", code: "03.02", name: "Fixed Assets", accountClass: "asset", category: "asset_fixed", parentId: "03", isGroup: true },
  { id: "03.02.01", code: "03.02.01", name: "Property & Equipment", accountClass: "asset", category: "asset_fixed", parentId: "03.02", isGroup: true },
  { id: "03.02.01.0001", code: "03.02.01.0001", name: "Office Equipment & Furniture", accountClass: "asset", category: "asset_fixed", parentId: "03.02.01" },
  { id: "03.02.01.0002", code: "03.02.01.0002", name: "Vehicles", accountClass: "asset", category: "asset_fixed", parentId: "03.02.01" },

  // ── 04 · INCOME ──────────────────────────────────────────────────
  { id: "04", code: "04", name: "Income", accountClass: "income", category: "income", isGroup: true },
  { id: "04.01", code: "04.01", name: "Operating Revenue", accountClass: "income", category: "income", parentId: "04", isGroup: true },
  { id: "04.01.01", code: "04.01.01", name: "Sales Revenue", accountClass: "income", category: "income", parentId: "04.01", isGroup: true },
  { id: "04.01.01.0001", code: "04.01.01.0001", name: "Sales & Booking Revenue", accountClass: "income", category: "income", parentId: "04.01.01" },
  { id: "04.01.02", code: "04.01.02", name: "Commission Revenue", accountClass: "income", category: "income", parentId: "04.01", isGroup: true },
  { id: "04.01.02.0001", code: "04.01.02.0001", name: "Commission Income", accountClass: "income", category: "income", parentId: "04.01.02" },
  { id: "04.02", code: "04.02", name: "Other Income", accountClass: "income", category: "income_other", parentId: "04", isGroup: true },
  { id: "04.02.01", code: "04.02.01", name: "Miscellaneous Income", accountClass: "income", category: "income_other", parentId: "04.02", isGroup: true },
  { id: "04.02.01.0001", code: "04.02.01.0001", name: "Other Income", accountClass: "income", category: "income_other", parentId: "04.02.01" },

  // ── 05 · EXPENSES ────────────────────────────────────────────────
  { id: "05", code: "05", name: "Expenses", accountClass: "expense", category: "expense", isGroup: true },
  { id: "05.01", code: "05.01", name: "Cost of Revenue", accountClass: "expense", category: "expense_direct_cost", parentId: "05", isGroup: true },
  { id: "05.01.01", code: "05.01.01", name: "Direct Costs", accountClass: "expense", category: "expense_direct_cost", parentId: "05.01", isGroup: true },
  { id: "05.01.01.0001", code: "05.01.01.0001", name: "Land Acquisition Cost", accountClass: "expense", category: "expense_direct_cost", parentId: "05.01.01" },
  { id: "05.02", code: "05.02", name: "Operating Expenses", accountClass: "expense", category: "expense", parentId: "05", isGroup: true },
  { id: "05.02.01", code: "05.02.01", name: "Administrative Expenses", accountClass: "expense", category: "expense", parentId: "05.02", isGroup: true },
  { id: "05.02.01.0001", code: "05.02.01.0001", name: "Utility Expense", accountClass: "expense", category: "expense", parentId: "05.02.01" },
  { id: "05.02.01.0002", code: "05.02.01.0002", name: "Office Supplies Expense", accountClass: "expense", category: "expense", parentId: "05.02.01" },
  { id: "05.02.02", code: "05.02.02", name: "Occupancy Expenses", accountClass: "expense", category: "expense", parentId: "05.02", isGroup: true },
  { id: "05.02.02.0001", code: "05.02.02.0001", name: "Rent Expense", accountClass: "expense", category: "expense", parentId: "05.02.02" },
  { id: "05.02.02.0002", code: "05.02.02.0002", name: "Maintenance Expense", accountClass: "expense", category: "expense", parentId: "05.02.02" },
  { id: "05.02.03", code: "05.02.03", name: "Selling & Marketing", accountClass: "expense", category: "expense", parentId: "05.02", isGroup: true },
  { id: "05.02.03.0001", code: "05.02.03.0001", name: "Marketing Expense", accountClass: "expense", category: "expense", parentId: "05.02.03" },
  { id: "05.02.03.0002", code: "05.02.03.0002", name: "Travel Expense", accountClass: "expense", category: "expense", parentId: "05.02.03" },
  { id: "05.02.04", code: "05.02.04", name: "Payroll Expenses", accountClass: "expense", category: "expense", parentId: "05.02", isGroup: true },
  { id: "05.02.04.0001", code: "05.02.04.0001", name: "Salaries & Wages", accountClass: "expense", category: "expense", parentId: "05.02.04" },
  { id: "05.03", code: "05.03", name: "Other Expenses", accountClass: "expense", category: "expense_other", parentId: "05", isGroup: true },
  { id: "05.03.01", code: "05.03.01", name: "Miscellaneous Expenses", accountClass: "expense", category: "expense_other", parentId: "05.03", isGroup: true },
  { id: "05.03.01.0001", code: "05.03.01.0001", name: "Other Expenses", accountClass: "expense", category: "expense_other", parentId: "05.03.01" },
];

// Static, non-derived seed balances for the handful of accounts that have no
// natural source elsewhere in the mock data (a real dealer would have fixed
// assets and a capital balance long before this app existed).
const STATIC_BALANCES: Record<string, number> = {
  "03.02.01.0001": 850000,
  "03.02.01.0002": 2400000,
  "03.01.04.0001": 300000,
  "02.02.01.0001": 4000000,
  "01.01.01.0001": 15000000,
};

export interface ChartOfAccountsInput {
  units: Unit[];
  customers: Customer[];
  staff: StaffMember[];
  accounts: Account[];
  transactions: Transaction[];
  expenses: Expense[];
  contracts: Contract[];
}

const EXPENSE_TYPE_TO_ACCOUNT: Record<string, string> = {
  Utility: "05.02.01.0001",
  "Office Supplies": "05.02.01.0002",
  Rent: "05.02.02.0001",
  Maintenance: "05.02.02.0002",
  Marketing: "05.02.03.0001",
  Travel: "05.02.03.0002",
};

function leafBalance(id: string, input: ChartOfAccountsInput): { balance: number; drillDown: LedgerAccountBalance["drillDown"] } {
  const { units, customers, staff, transactions, expenses, contracts } = input;

  switch (id) {
    case "03.01.02.0001": {
      const items = customers.filter((c) => c.balance > 0);
      return {
        balance: items.reduce((s, c) => s + c.balance, 0),
        drillDown: items.map((c) => ({ label: c.name, detail: c.city, amount: c.balance })),
      };
    }
    case "03.01.02.0002": {
      const items = staff.filter((s) => s.balance > 0);
      return {
        balance: items.reduce((s, m) => s + m.balance, 0),
        drillDown: items.map((m) => ({ label: m.name, detail: m.department, amount: m.balance })),
      };
    }
    case "03.01.03.0001": {
      const items = units.filter((u) => u.status !== "sold");
      return {
        balance: items.reduce((s, u) => s + u.price, 0),
        drillDown: items.slice(0, 12).map((u) => ({ label: u.code, detail: `${u.project} · ${u.status}`, amount: u.price })),
      };
    }
    case "02.01.01.0001": {
      const items = contracts.filter((c) => c.type === "Dealer Agreement" && c.status !== "expired");
      return {
        balance: Math.round(items.reduce((s, c) => s + c.value * 0.05, 0) / 1000) * 1000,
        drillDown: items.map((c) => ({ label: c.title, detail: c.partyName, amount: Math.round((c.value * 0.05) / 1000) * 1000 })),
      };
    }
    case "02.01.01.0002": {
      const items = expenses.filter((e) => e.status === "unpaid");
      return {
        balance: items.reduce((s, e) => s + e.amount, 0),
        drillDown: items.map((e) => ({ label: e.title, detail: e.paidVia, amount: e.amount, date: e.date })),
      };
    }
    case "04.01.01.0001": {
      const items = transactions.filter((t) => t.kind === "credit" && ["Installment", "Booking"].includes(t.category));
      return {
        balance: items.reduce((s, t) => s + t.amount, 0),
        drillDown: items.slice(0, 12).map((t) => ({ label: t.title, detail: t.category, amount: t.amount, date: t.date })),
      };
    }
    case "04.01.02.0001": {
      const items = transactions.filter((t) => t.kind === "credit" && t.category === "Commission");
      return {
        balance: items.reduce((s, t) => s + t.amount, 0),
        drillDown: items.map((t) => ({ label: t.title, detail: t.category, amount: t.amount, date: t.date })),
      };
    }
    case "04.02.01.0001": {
      const items = transactions.filter(
        (t) => t.kind === "credit" && !["Installment", "Booking", "Commission", "Transfer"].includes(t.category),
      );
      return {
        balance: items.reduce((s, t) => s + t.amount, 0),
        drillDown: items.slice(0, 12).map((t) => ({ label: t.title, detail: t.category, amount: t.amount, date: t.date })),
      };
    }
    case "05.01.01.0001": {
      const sold = units.filter((u) => u.status === "sold");
      const cost = sold.reduce((s, u) => s + u.price * 0.62, 0);
      return {
        balance: Math.round(cost / 1000) * 1000,
        drillDown: sold.slice(0, 12).map((u) => ({ label: u.code, detail: u.project, amount: Math.round((u.price * 0.62) / 1000) * 1000 })),
      };
    }
    case "05.02.04.0001": {
      const items = transactions.filter((t) => t.kind === "debit" && t.category === "Salary");
      return {
        balance: items.reduce((s, t) => s + t.amount, 0),
        drillDown: items.slice(0, 12).map((t) => ({ label: t.title, detail: t.category, amount: t.amount, date: t.date })),
      };
    }
    case "05.02.01.0001":
    case "05.02.01.0002":
    case "05.02.02.0001":
    case "05.02.02.0002":
    case "05.02.03.0001":
    case "05.02.03.0002": {
      const type = Object.entries(EXPENSE_TYPE_TO_ACCOUNT).find(([, acc]) => acc === id)?.[0];
      const items = expenses.filter((e) => e.type === type);
      return {
        balance: items.reduce((s, e) => s + e.amount, 0),
        drillDown: items.map((e) => ({ label: e.title, detail: e.paidVia, amount: e.amount, date: e.date })),
      };
    }
    case "05.03.01.0001": {
      const items = transactions.filter((t) => t.kind === "debit" && !["Salary", "Transfer"].includes(t.category));
      return {
        balance: items.reduce((s, t) => s + t.amount, 0),
        drillDown: items.slice(0, 12).map((t) => ({ label: t.title, detail: t.category, amount: t.amount, date: t.date })),
      };
    }
    default: {
      if (id in STATIC_BALANCES) {
        return { balance: STATIC_BALANCES[id], drillDown: [] };
      }
      return { balance: 0, drillDown: [] };
    }
  }
}

const CASH_BANK_PARENT = "03.01.01";

/** Cash & Bank leaves are the existing `accounts` records themselves. */
function buildCashLeaves(accounts: Account[]): LedgerAccountNode[] {
  return accounts.map((a, i) => ({
    id: `${CASH_BANK_PARENT}.${String(i + 1).padStart(4, "0")}`,
    code: `${CASH_BANK_PARENT}.${String(i + 1).padStart(4, "0")}`,
    name: a.title,
    accountClass: "asset" as const,
    category: "asset_cash",
    parentId: CASH_BANK_PARENT,
  }));
}

export function buildChartOfAccounts(input: ChartOfAccountsInput): LedgerAccountBalance[] {
  const cashLeaves = buildCashLeaves(input.accounts);
  const cashBalanceById = new Map(cashLeaves.map((leaf, i) => [leaf.id, input.accounts[i].balance]));

  const allNodes = [...COA_TREE, ...cashLeaves];
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, LedgerAccountNode[]>();
  allNodes.forEach((n) => {
    if (!n.parentId) return;
    childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n]);
  });

  const resolved = new Map<string, { balance: number; drillDown: LedgerAccountBalance["drillDown"] }>();

  function resolve(id: string): { balance: number; drillDown: LedgerAccountBalance["drillDown"] } {
    if (resolved.has(id)) return resolved.get(id)!;
    const kids = childrenOf.get(id);

    let result: { balance: number; drillDown: LedgerAccountBalance["drillDown"] };
    if (kids && kids.length > 0) {
      result = { balance: kids.reduce((s, k) => s + resolve(k.id).balance, 0), drillDown: [] };
    } else if (cashBalanceById.has(id)) {
      result = { balance: cashBalanceById.get(id) ?? 0, drillDown: [] };
    } else {
      result = leafBalance(id, input);
    }
    resolved.set(id, result);
    return result;
  }

  // Retained Earnings is the plug that makes Assets = Liabilities + Equity,
  // exactly like closing a real fiscal year's P&L into equity — it must be
  // seeded *before* anything resolves the "01 Capital" group, otherwise the
  // group's memoized total would be cached without it.
  const totalAssets = resolve("03").balance;
  const totalLiabilities = resolve("02").balance;
  const ownersCapital = resolve("01.01.01.0001").balance;
  const retainedEarnings = totalAssets - totalLiabilities - ownersCapital;
  resolved.set("01.01.02.0001", { balance: retainedEarnings, drillDown: [] });

  allNodes.forEach((n) => resolve(n.id));

  function depthOf(id: string): number {
    const node = byId.get(id);
    if (!node?.parentId) return 0;
    return 1 + depthOf(node.parentId);
  }

  // Depth-first order (a node immediately followed by its own children) so
  // dynamically-generated leaves — like the Cash & Bank accounts — render
  // nested under their parent instead of tacked on wherever they were
  // appended in `allNodes`.
  function flatten(id: string): LedgerAccountNode[] {
    const node = byId.get(id)!;
    const kids = childrenOf.get(id) ?? [];
    return [node, ...kids.flatMap((k) => flatten(k.id))];
  }
  const roots = allNodes.filter((n) => !n.parentId);
  const ordered = roots.flatMap((r) => flatten(r.id));

  return ordered.map((n) => ({
    ...n,
    depth: depthOf(n.id),
    balance: resolved.get(n.id)!.balance,
    drillDown: resolved.get(n.id)!.drillDown,
  }));
}

export function accountClassLabel(cls: LedgerAccountBalance["accountClass"]) {
  return { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" }[cls];
}

export function formatLedgerBalance(n: number) {
  return formatPkr(Math.abs(n), { compact: n >= 1000000 || n <= -1000000 });
}
