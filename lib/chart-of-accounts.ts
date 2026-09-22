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
 * A standard 5-class / numbered chart of accounts, modeled after how
 * Microsoft Dynamics 365 (Main Account Type + Main Account Category) and
 * Odoo (account "type": asset_cash, liability_payable, income_other, ...)
 * both structure a COA: five top-level classes, each broken into
 * categories, each holding the individual GL accounts.
 *
 * Balances are never hand-entered here — `buildChartOfAccounts` derives
 * every leaf from the same mock data the rest of the app already uses
 * (units, customers, staff, transactions, expenses, contracts), then rolls
 * group totals up from their children, the same way Odoo's account groups
 * auto-total from their child accounts' codes.
 */
export const COA_TREE: LedgerAccountNode[] = [
  // ── Assets (1000s) ───────────────────────────────────────────────
  { id: "1000", code: "1000", name: "Assets", accountClass: "asset", category: "asset", isGroup: true },
  { id: "1010", code: "1010", name: "Cash & Bank", accountClass: "asset", category: "asset_cash", parentId: "1000", isGroup: true },
  { id: "1200", code: "1200", name: "Accounts Receivable", accountClass: "asset", category: "asset_receivable", parentId: "1000", isGroup: true },
  { id: "1210", code: "1210", name: "Trade Receivables — Customers", accountClass: "asset", category: "asset_receivable", parentId: "1200" },
  { id: "1250", code: "1250", name: "Staff Advances Receivable", accountClass: "asset", category: "asset_receivable", parentId: "1200" },
  { id: "1300", code: "1300", name: "Inventory — Unsold Units", accountClass: "asset", category: "asset_current", parentId: "1000" },
  { id: "1500", code: "1500", name: "Fixed Assets", accountClass: "asset", category: "asset_fixed", parentId: "1000", isGroup: true },
  { id: "1510", code: "1510", name: "Office Equipment & Furniture", accountClass: "asset", category: "asset_fixed", parentId: "1500" },
  { id: "1520", code: "1520", name: "Vehicles", accountClass: "asset", category: "asset_fixed", parentId: "1500" },
  { id: "1600", code: "1600", name: "Prepayments", accountClass: "asset", category: "asset_prepayments", parentId: "1000", isGroup: true },
  { id: "1610", code: "1610", name: "Prepaid Rent", accountClass: "asset", category: "asset_prepayments", parentId: "1600" },

  // ── Liabilities (2000s) ──────────────────────────────────────────
  { id: "2000", code: "2000", name: "Liabilities", accountClass: "liability", category: "liability", isGroup: true },
  { id: "2100", code: "2100", name: "Accounts Payable", accountClass: "liability", category: "liability_payable", parentId: "2000", isGroup: true },
  { id: "2110", code: "2110", name: "Dealer Commission Payable", accountClass: "liability", category: "liability_payable", parentId: "2100" },
  { id: "2120", code: "2120", name: "Accrued Expenses Payable", accountClass: "liability", category: "liability_payable", parentId: "2100" },
  { id: "2300", code: "2300", name: "Non-current Liabilities", accountClass: "liability", category: "liability_non_current", parentId: "2000", isGroup: true },
  { id: "2310", code: "2310", name: "Bank Loan Payable", accountClass: "liability", category: "liability_non_current", parentId: "2300" },

  // ── Equity (3000s) ───────────────────────────────────────────────
  { id: "3000", code: "3000", name: "Equity", accountClass: "equity", category: "equity", isGroup: true },
  { id: "3100", code: "3100", name: "Owner's Capital", accountClass: "equity", category: "equity", parentId: "3000" },
  { id: "3200", code: "3200", name: "Retained Earnings", accountClass: "equity", category: "equity_unaffected", parentId: "3000" },

  // ── Income (4000s) ───────────────────────────────────────────────
  { id: "4000", code: "4000", name: "Income", accountClass: "income", category: "income", isGroup: true },
  { id: "4100", code: "4100", name: "Sales & Booking Revenue", accountClass: "income", category: "income", parentId: "4000" },
  { id: "4200", code: "4200", name: "Commission Income", accountClass: "income", category: "income", parentId: "4000" },
  { id: "4900", code: "4900", name: "Other Income", accountClass: "income", category: "income_other", parentId: "4000" },

  // ── Expenses (5000s) ─────────────────────────────────────────────
  { id: "5000", code: "5000", name: "Expenses", accountClass: "expense", category: "expense", isGroup: true },
  { id: "5100", code: "5100", name: "Cost of Revenue — Land Acquisition", accountClass: "expense", category: "expense_direct_cost", parentId: "5000" },
  { id: "5200", code: "5200", name: "Operating Expenses", accountClass: "expense", category: "expense", parentId: "5000", isGroup: true },
  { id: "5210", code: "5210", name: "Utility Expense", accountClass: "expense", category: "expense", parentId: "5200" },
  { id: "5220", code: "5220", name: "Rent Expense", accountClass: "expense", category: "expense", parentId: "5200" },
  { id: "5230", code: "5230", name: "Marketing Expense", accountClass: "expense", category: "expense", parentId: "5200" },
  { id: "5240", code: "5240", name: "Maintenance Expense", accountClass: "expense", category: "expense", parentId: "5200" },
  { id: "5250", code: "5250", name: "Travel Expense", accountClass: "expense", category: "expense", parentId: "5200" },
  { id: "5260", code: "5260", name: "Office Supplies Expense", accountClass: "expense", category: "expense", parentId: "5200" },
  { id: "5270", code: "5270", name: "Salaries & Wages", accountClass: "expense", category: "expense", parentId: "5200" },
  { id: "5900", code: "5900", name: "Other Expenses", accountClass: "expense", category: "expense_other", parentId: "5000" },
];

// Static, non-derived seed balances for the handful of accounts that have no
// natural source elsewhere in the mock data (a real dealer would have fixed
// assets and a capital balance long before this app existed).
const STATIC_BALANCES: Record<string, number> = {
  "1510": 850000,
  "1520": 2400000,
  "1610": 300000,
  "2310": 4000000,
  "3100": 15000000,
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
  Utility: "5210",
  Rent: "5220",
  Marketing: "5230",
  Maintenance: "5240",
  Travel: "5250",
  "Office Supplies": "5260",
};

function leafBalance(id: string, input: ChartOfAccountsInput): { balance: number; drillDown: LedgerAccountBalance["drillDown"] } {
  const { units, customers, staff, transactions, expenses, contracts } = input;

  switch (id) {
    case "1210": {
      const items = customers.filter((c) => c.balance > 0);
      return {
        balance: items.reduce((s, c) => s + c.balance, 0),
        drillDown: items.map((c) => ({ label: c.name, detail: c.city, amount: c.balance })),
      };
    }
    case "1250": {
      const items = staff.filter((s) => s.balance > 0);
      return {
        balance: items.reduce((s, m) => s + m.balance, 0),
        drillDown: items.map((m) => ({ label: m.name, detail: m.department, amount: m.balance })),
      };
    }
    case "1300": {
      const items = units.filter((u) => u.status !== "sold");
      return {
        balance: items.reduce((s, u) => s + u.price, 0),
        drillDown: items.slice(0, 12).map((u) => ({ label: u.code, detail: `${u.project} · ${u.status}`, amount: u.price })),
      };
    }
    case "2110": {
      const items = contracts.filter((c) => c.type === "Dealer Agreement" && c.status !== "expired");
      return {
        balance: Math.round(items.reduce((s, c) => s + c.value * 0.05, 0) / 1000) * 1000,
        drillDown: items.map((c) => ({ label: c.title, detail: c.partyName, amount: Math.round((c.value * 0.05) / 1000) * 1000 })),
      };
    }
    case "2120": {
      const items = expenses.filter((e) => e.status === "unpaid");
      return {
        balance: items.reduce((s, e) => s + e.amount, 0),
        drillDown: items.map((e) => ({ label: e.title, detail: e.paidVia, amount: e.amount, date: e.date })),
      };
    }
    case "4100": {
      const items = transactions.filter((t) => t.kind === "credit" && ["Installment", "Booking"].includes(t.category));
      return {
        balance: items.reduce((s, t) => s + t.amount, 0),
        drillDown: items.slice(0, 12).map((t) => ({ label: t.title, detail: t.category, amount: t.amount, date: t.date })),
      };
    }
    case "4200": {
      const items = transactions.filter((t) => t.kind === "credit" && t.category === "Commission");
      return {
        balance: items.reduce((s, t) => s + t.amount, 0),
        drillDown: items.map((t) => ({ label: t.title, detail: t.category, amount: t.amount, date: t.date })),
      };
    }
    case "4900": {
      const items = transactions.filter(
        (t) => t.kind === "credit" && !["Installment", "Booking", "Commission", "Transfer"].includes(t.category),
      );
      return {
        balance: items.reduce((s, t) => s + t.amount, 0),
        drillDown: items.slice(0, 12).map((t) => ({ label: t.title, detail: t.category, amount: t.amount, date: t.date })),
      };
    }
    case "5100": {
      const sold = units.filter((u) => u.status === "sold");
      const cost = sold.reduce((s, u) => s + u.price * 0.62, 0);
      return {
        balance: Math.round(cost / 1000) * 1000,
        drillDown: sold.slice(0, 12).map((u) => ({ label: u.code, detail: u.project, amount: Math.round((u.price * 0.62) / 1000) * 1000 })),
      };
    }
    case "5270": {
      const items = transactions.filter((t) => t.kind === "debit" && t.category === "Salary");
      return {
        balance: items.reduce((s, t) => s + t.amount, 0),
        drillDown: items.slice(0, 12).map((t) => ({ label: t.title, detail: t.category, amount: t.amount, date: t.date })),
      };
    }
    case "5210":
    case "5220":
    case "5230":
    case "5240":
    case "5250":
    case "5260": {
      const type = Object.entries(EXPENSE_TYPE_TO_ACCOUNT).find(([, acc]) => acc === id)?.[0];
      const items = expenses.filter((e) => e.type === type);
      return {
        balance: items.reduce((s, e) => s + e.amount, 0),
        drillDown: items.map((e) => ({ label: e.title, detail: e.paidVia, amount: e.amount, date: e.date })),
      };
    }
    case "5900": {
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

/** Cash & Bank leaves are the existing `accounts` records themselves. */
function buildCashLeaves(accounts: Account[]): LedgerAccountNode[] {
  return accounts.map((a, i) => ({
    id: `1010-${a.id}`,
    code: `101${i + 1}`,
    name: a.title,
    accountClass: "asset" as const,
    category: "asset_cash",
    parentId: "1010",
  }));
}

export function buildChartOfAccounts(input: ChartOfAccountsInput): LedgerAccountBalance[] {
  const cashLeaves = buildCashLeaves(input.accounts);
  const cashBalanceById = new Map(input.accounts.map((a) => [a.id, a.balance]));

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
    } else if (id.startsWith("1010-")) {
      const accountId = id.replace("1010-", "");
      result = { balance: cashBalanceById.get(accountId) ?? 0, drillDown: [] };
    } else {
      result = leafBalance(id, input);
    }
    resolved.set(id, result);
    return result;
  }

  // Retained Earnings is the plug that makes Assets = Liabilities + Equity,
  // exactly like closing a real fiscal year's P&L into equity — it must be
  // seeded *before* anything resolves the "3000 Equity" group, otherwise the
  // group's memoized total would be cached without it.
  const totalAssets = resolve("1000").balance;
  const totalLiabilities = resolve("2000").balance;
  const ownersCapital = resolve("3100").balance;
  const retainedEarnings = totalAssets - totalLiabilities - ownersCapital;
  resolved.set("3200", { balance: retainedEarnings, drillDown: [] });

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
