import type { Budget, BudgetLine, Expense } from "@/lib/types";
import { mulberry32 } from "./seed";
import { projects } from "./projects";
import { expenses } from "./expenses";
import { staff } from "./staff";
import { BUDGET_ELAPSED_MONTHS, BUDGET_FY, PROJECT_BUDGET_TEMPLATE } from "@/lib/budgets";
import { dateOffset } from "./seed";

const rand = mulberry32(1313);

/** Maps a construction expense to the budget category it burns. */
function categoryOf(title: string): string | null {
  if (/road|drain/i.test(title)) return "Roads & infrastructure";
  if (/electric|lighting/i.test(title)) return "Electrical";
  if (/water|sewer/i.test(title)) return "Water & sewerage";
  if (/landscap|park/i.test(title)) return "Landscaping & amenities";
  if (/earthwork|level|survey|topograph/i.test(title)) return "Land development";
  if (/civil|structural|interior|finish/i.test(title)) return "Civil & structural";
  return null;
}

// Tighter-than-template lines on purpose, so the demo shows on-track, watch and over-budget lines.
const SHARE_OVERRIDES: Record<string, Record<string, number>> = {
  "Al-Noor Heights": { Electrical: 0.022 },
  "Green Valley Homes": { "Landscaping & amenities": 0.0045 },
  "Emerald Gardens": { "Civil & structural": 0.33 },
};

const PROJECT_BUDGET_STATUS = {
  active: "approved",
  planning: "submitted",
  on_hold: "locked",
  completed: "closed",
  cancelled: "closed",
} as const;

const budgets: Budget[] = [];
const budgetLines: BudgetLine[] = [];

projects.forEach((project, pi) => {
  const id = `bud-${pi + 1}`;
  const status = PROJECT_BUDGET_STATUS[project.status];
  budgets.push({
    id,
    name: `${project.name} — Project Budget`,
    kind: "project",
    projectId: project.id,
    fiscalYear: "Lifetime",
    status,
    controlMode: pi === 0 ? "block" : "warn",
    version: pi === 0 ? 3 : 1,
    createdBy: "Accounts Officer",
    approvedBy: status === "submitted" ? undefined : "CFO",
    approvedAt: status === "submitted" ? undefined : dateOffset(-380 + pi * 40),
    createdAt: dateOffset(-400 + pi * 40),
    revisions:
      pi === 0
        ? [
            { no: 2, date: dateOffset(-150), type: "supplementary", deltaAmount: 50_000_000, reason: "Scope addition — Block D internal roads", status: "approved", approvedBy: "CFO" },
            { no: 3, date: dateOffset(-45), type: "reallocation", deltaAmount: 0, reason: "Moved 12M from contingency to landscaping Phase 2", status: "approved", approvedBy: "CFO" },
            { no: 4, date: dateOffset(-6), type: "supplementary", deltaAmount: 18_000_000, reason: "Utility relocation found during excavation", status: "pending" },
          ]
        : pi === 1
          ? [{ no: 2, date: dateOffset(-70), type: "reforecast", deltaAmount: 0, reason: "Re-forecast after contractor repricing", status: "approved", approvedBy: "CFO" }]
          : [],
  });

  const overrides = SHARE_OVERRIDES[project.name] ?? {};
  const fixedShare = PROJECT_BUDGET_TEMPLATE.filter((t) => t.category !== "Contingency").reduce((s, t) => s + (overrides[t.category] ?? t.share), 0);
  const paid: Expense[] = expenses.filter((e) => e.project === project.name && e.status === "paid");
  const unpaid: Expense[] = expenses.filter((e) => e.project === project.name && e.status === "unpaid");

  PROJECT_BUDGET_TEMPLATE.forEach((t, li) => {
    const share = t.category === "Contingency" ? 1 - fixedShare : (overrides[t.category] ?? t.share);
    const budgetAmount = Math.round((project.budget * share) / 1000) * 1000;
    const actualAmount = paid.filter((e) => categoryOf(e.title) === t.category).reduce((s, e) => s + e.amount, 0);
    const unpaidHere = unpaid.filter((e) => categoryOf(e.title) === t.category).reduce((s, e) => s + e.amount, 0);
    // Open purchase orders / contract balances not yet billed
    const openOrders = project.status === "active" && actualAmount > 0 ? Math.round((budgetAmount * (0.02 + rand() * 0.06)) / 1000) * 1000 : 0;
    const committedAmount = unpaidHere + openOrders;
    const burn = actualAmount + committedAmount;
    budgetLines.push({
      id: `${id}-line-${li + 1}`,
      budgetId: id,
      costCode: t.costCode,
      category: t.category,
      description: t.description,
      budgetAmount,
      committedAmount,
      actualAmount,
      // Forecast at completion: spend so far scaled by how much work remains, never below what's spoken for
      forecastAmount:
        project.status === "completed" ? burn : Math.max(burn, Math.round((burn > 0 ? Math.max(budgetAmount * 0.92, burn * 1.06) : budgetAmount) / 1000) * 1000),
    });
  });
});

// ── Annual operating budget (fiscal year, phased by month) ─────────────────────────────────────
const annualSalaries = staff.reduce((s, m) => s + m.salary, 0) * 12;
const OPERATING: { category: string; costCode: string; annual: number; description: string; season: number[] }[] = [
  { category: "Salaries & benefits", costCode: "O-100", annual: Math.round((annualSalaries * 1.06) / 1000) * 1000, description: "Payroll, allowances, EOBI", season: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { category: "Marketing & advertising", costCode: "O-200", annual: 18_000_000, description: "Digital, events, collateral", season: [0.8, 0.9, 1.3, 1.4, 1.2, 1, 0.8, 0.8, 0.9, 1, 1.1, 0.8] },
  { category: "Dealer commission", costCode: "O-300", annual: 24_000_000, description: "Brokerage paid to dealers", season: [0.9, 1, 1.1, 1.2, 1.1, 1, 0.9, 0.9, 1, 1, 1, 0.9] },
  { category: "Rent & utilities", costCode: "O-400", annual: 9_600_000, description: "Offices, sales centres, utilities", season: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { category: "Office & admin", costCode: "O-500", annual: 6_000_000, description: "Supplies, software, courier", season: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { category: "Travel & site visits", costCode: "O-600", annual: 4_200_000, description: "Client site visits, field travel", season: [0.8, 0.9, 1.2, 1.2, 1.1, 1, 0.8, 0.8, 1, 1, 1.1, 1.1] },
  { category: "Maintenance & repairs", costCode: "O-700", annual: 5_400_000, description: "Sales-centre and site upkeep", season: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { category: "Professional fees", costCode: "O-800", annual: 3_600_000, description: "Audit, legal, consultants", season: [1, 0.5, 1, 1, 0.5, 1, 1, 0.5, 1, 1, 1.5, 1.5] },
];

const opId = "bud-op";
budgets.push({
  id: opId,
  name: `Operating Budget ${BUDGET_FY}`,
  kind: "operating",
  fiscalYear: BUDGET_FY,
  status: "approved",
  controlMode: "warn",
  version: 1,
  createdBy: "Accounts Officer",
  approvedBy: "CEO / Director",
  approvedAt: dateOffset(-90),
  createdAt: dateOffset(-110),
  revisions: [],
});

OPERATING.forEach((o, i) => {
  const seasonTotal = o.season.reduce((s, x) => s + x, 0);
  const monthlyBudgetAmounts = o.season.map((w) => Math.round((o.annual * w) / seasonTotal / 100) * 100);
  // A few categories run hot (marketing, commission) so the variance views have something to say
  const hot = o.category === "Marketing & advertising" ? 1.22 : o.category === "Dealer commission" ? 1.09 : o.category === "Travel & site visits" ? 0.8 : 0.97 + rand() * 0.06;
  const monthlyActualAmounts = monthlyBudgetAmounts.map((b, m) =>
    m < BUDGET_ELAPSED_MONTHS ? Math.round((b * hot * (0.94 + rand() * 0.12)) / 100) * 100 : 0,
  );
  const actualAmount = monthlyActualAmounts.reduce((s, x) => s + x, 0);
  const committedAmount = Math.round((o.annual * (0.005 + rand() * 0.02)) / 1000) * 1000;
  const elapsedBudget = monthlyBudgetAmounts.slice(0, BUDGET_ELAPSED_MONTHS).reduce((s, x) => s + x, 0);
  budgetLines.push({
    id: `${opId}-line-${i + 1}`,
    budgetId: opId,
    costCode: o.costCode,
    category: o.category,
    description: o.description,
    budgetAmount: monthlyBudgetAmounts.reduce((s, x) => s + x, 0),
    committedAmount,
    actualAmount,
    // run-rate outlook: actual pace over the elapsed months, projected for the whole year
    forecastAmount: Math.round((actualAmount / Math.max(elapsedBudget, 1)) * monthlyBudgetAmounts.reduce((s, x) => s + x, 0) / 1000) * 1000,
    monthlyBudgetAmounts,
    monthlyActualAmounts,
  });
});

export { budgets, budgetLines };
