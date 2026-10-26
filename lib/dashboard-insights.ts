import type {
  Account,
  Budget,
  BudgetLine,
  Contract,
  Customer,
  Deal,
  Expense,
  Lead,
  LeaveRequest,
  PayrollAdjustment,
  PostDatedCheque,
  Project,
  Quotation,
  StaffMember,
  Transaction,
  Unit,
  Voucher,
} from "@/lib/types";
import { MOCK_TODAY_ISO } from "@/lib/mock-data/seed";
import { lineMetrics } from "@/lib/budgets";
import { formatMonthShort, formatPkr } from "@/lib/format";
import { translate as tr } from "@/lib/i18n/runtime";

/**
 * Everything the dashboard shows is derived here from the same records the rest of the app
 * uses — nothing on the dashboard is typed in. "Today" is the demo data's reference date so
 * overdue / upcoming figures stay stable.
 */
export interface DashboardData {
  deals: Deal[];
  units: Unit[];
  customers: Customer[];
  leads: Lead[];
  accounts: Account[];
  transactions: Transaction[];
  expenses: Expense[];
  vouchers: Voucher[];
  cheques: PostDatedCheque[];
  contracts: Contract[];
  leaves: LeaveRequest[];
  quotations: Quotation[];
  adjustments: PayrollAdjustment[];
  projects: Project[];
  budgets: Budget[];
  budgetLines: BudgetLine[];
  staff: StaffMember[];
}

export const TODAY = MOCK_TODAY_ISO;

// ───────────────────────────────────────────────────────────────── dates
const DAY = 86_400_000;
const toMs = (iso: string) => Date.parse(iso + "T00:00:00Z");
export const addDays = (iso: string, n: number) => new Date(toMs(iso) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);
const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => formatMonthShort(key);
function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const inRange = (iso: string | undefined, a: string, b: string) => !!iso && iso >= a && iso <= b;

// ───────────────────────────────────────────────────────────────── period KPIs
export type Period = "30d" | "90d" | "12m";
/** "Last 30 days" (long) or "last 30 days" (inline, for use inside a sentence), in the language on screen. */
export const periodLabel = (p: Period, form: "long" | "inline" = "long") => tr(`dashboard.period.${p}.${form}`);
const PERIOD_DAYS: Record<Period, number> = { "30d": 30, "90d": 90, "12m": 365 };

export interface PeriodStats {
  collected: number;
  collectedPrev: number;
  collectedDelta: number | undefined;
  bookings: number;
  bookingsPrev: number;
  bookingsDelta: number | undefined;
  salesValue: number;
  salesValuePrev: number;
}

const pctChange = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 1000) / 10 : undefined);

export function periodStats(d: DashboardData, period: Period, today = TODAY): PeriodStats {
  const days = PERIOD_DAYS[period];
  const from = addDays(today, -(days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  const paid = d.deals.flatMap((x) => x.installments.filter((i) => i.paid && i.paidDate));
  const collected = sum(paid.filter((i) => inRange(i.paidDate, from, today)).map((i) => i.amount));
  const collectedPrev = sum(paid.filter((i) => inRange(i.paidDate, prevFrom, prevTo)).map((i) => i.amount));
  const live = d.deals.filter((x) => x.status !== "cancelled");
  const cur = live.filter((x) => inRange(x.createdAt, from, today));
  const prev = live.filter((x) => inRange(x.createdAt, prevFrom, prevTo));
  return {
    collected,
    collectedPrev,
    collectedDelta: pctChange(collected, collectedPrev),
    bookings: cur.length,
    bookingsPrev: prev.length,
    bookingsDelta: pctChange(cur.length, prev.length),
    salesValue: sum(cur.map((x) => x.totalAmount)),
    salesValuePrev: sum(prev.map((x) => x.totalAmount)),
  };
}

// ───────────────────────────────────────────────────────────────── receivables
export interface DueInstallment {
  dealId: string;
  customerId: string;
  unitId: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
}

export const AGING_BUCKETS = [
  { key: "0-30", min: 1, max: 30 },
  { key: "31-60", min: 31, max: 60 },
  { key: "61-90", min: 61, max: 90 },
  { key: "90+", min: 91, max: Infinity },
] as const;

export function receivables(d: DashboardData, today = TODAY) {
  const unpaid: DueInstallment[] = d.deals
    .filter((x) => x.status !== "cancelled")
    .flatMap((x) =>
      x.installments
        .filter((i) => !i.paid)
        .map((i) => ({ dealId: x.id, customerId: x.customerId, unitId: x.unitId, amount: i.amount, dueDate: i.dueDate, daysOverdue: daysBetween(i.dueDate, today) })),
    );
  const overdue = unpaid.filter((i) => i.daysOverdue > 0);
  const buckets = AGING_BUCKETS.map((b) => {
    const items = overdue.filter((i) => i.daysOverdue >= b.min && i.daysOverdue <= b.max);
    return { ...b, amount: sum(items.map((i) => i.amount)), count: items.length };
  });
  const byCustomer = new Map<string, { amount: number; count: number; oldest: number }>();
  for (const i of overdue) {
    const cur = byCustomer.get(i.customerId) ?? { amount: 0, count: 0, oldest: 0 };
    cur.amount += i.amount;
    cur.count += 1;
    cur.oldest = Math.max(cur.oldest, i.daysOverdue);
    byCustomer.set(i.customerId, cur);
  }
  const topOverdue = [...byCustomer.entries()]
    .map(([customerId, v]) => ({ customerId, ...v }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const dueSoFar = d.deals
    .filter((x) => x.status !== "cancelled")
    .flatMap((x) => x.installments.filter((i) => i.dueDate <= today));
  const dueAmount = sum(dueSoFar.map((i) => i.amount));
  const collectedOfDue = sum(dueSoFar.filter((i) => i.paid).map((i) => i.amount));

  return {
    totalOutstanding: sum(unpaid.map((i) => i.amount)),
    overdueAmount: sum(overdue.map((i) => i.amount)),
    overdueCount: overdue.length,
    buckets,
    topOverdue,
    /** share of everything that has fallen due so far that has actually been collected */
    efficiency: dueAmount > 0 ? collectedOfDue / dueAmount : 1,
    dueAmount,
    collectedOfDue,
  };
}

/** Installments by due month: how much was collected vs is still outstanding (past + next months). */
export function collectionSchedule(d: DashboardData, today = TODAY, before = 3, after = 5) {
  const cur = monthKey(today);
  const keys = Array.from({ length: before + after + 1 }, (_, i) => shiftMonth(cur, i - before));
  const all = d.deals.filter((x) => x.status !== "cancelled").flatMap((x) => x.installments);
  return keys.map((k) => {
    const items = all.filter((i) => monthKey(i.dueDate) === k);
    const collected = sum(items.filter((i) => i.paid).map((i) => i.amount));
    const outstanding = sum(items.filter((i) => !i.paid).map((i) => i.amount));
    return { key: k, label: monthLabel(k), collected, outstanding, isCurrent: k === cur, isFuture: k > cur };
  });
}

// ───────────────────────────────────────────────────────────────── cash & payables
export function cashPosition(d: DashboardData) {
  const accounts = d.accounts.map((a) => ({ id: a.id, title: a.title, type: a.type, balance: a.balance }));
  return { total: sum(accounts.map((a) => a.balance)), accounts };
}

/** Money in vs out per week for the last `weeks` weeks, from the cash & bank transactions. */
export function cashFlowWeekly(d: DashboardData, today = TODAY, weeks = 8) {
  return Array.from({ length: weeks }, (_, w) => {
    const to = addDays(today, -(weeks - 1 - w) * 7);
    const from = addDays(to, -6);
    const items = d.transactions.filter((t) => inRange(t.date, from, to));
    const inflow = sum(items.filter((t) => t.kind === "credit").map((t) => t.amount));
    const outflow = sum(items.filter((t) => t.kind === "debit").map((t) => t.amount));
    return { label: from.slice(5).replace("-", "/"), inflow, outflow, net: inflow - outflow };
  });
}

export function payables(d: DashboardData) {
  const unpaid = d.expenses.filter((e) => e.status === "unpaid");
  return { amount: sum(unpaid.map((e) => e.amount)), count: unpaid.length };
}

/** Operating (non-construction) spend by category over the last 90 days. */
export function expenseBreakdown(d: DashboardData, today = TODAY) {
  const from = addDays(today, -89);
  const recent = d.expenses.filter((e) => e.type !== "Construction" && inRange(e.date, from, today));
  const byType = new Map<string, number>();
  for (const e of recent) byType.set(e.type, (byType.get(e.type) ?? 0) + e.amount);
  const rows = [...byType.entries()].map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount - a.amount);
  const construction = sum(d.expenses.filter((e) => e.type === "Construction" && e.status === "paid").map((e) => e.amount));
  return { rows, total: sum(rows.map((r) => r.amount)), construction };
}

// ───────────────────────────────────────────────────────────────── sales & portfolio
export function portfolio(d: DashboardData) {
  return d.projects
    .map((p) => {
      const units = d.units.filter((u) => u.project === p.name);
      const sold = units.filter((u) => u.status === "sold");
      const reserved = units.filter((u) => u.status === "reserved");
      const available = units.filter((u) => u.status === "available");
      const unitIds = new Set(units.map((u) => u.id));
      const projectDeals = d.deals.filter((x) => unitIds.has(x.unitId) && x.status !== "cancelled");
      const budget = d.budgets.find((b) => b.kind === "project" && b.projectId === p.id);
      const lines = budget ? d.budgetLines.filter((l) => l.budgetId === budget.id) : [];
      const budgetTotal = sum(lines.map((l) => l.budgetAmount));
      const budgetUsed = sum(lines.map((l) => l.actualAmount + l.committedAmount));
      return {
        project: p,
        total: units.length,
        sold: sold.length,
        reserved: reserved.length,
        available: available.length,
        soldPct: units.length ? sold.length / units.length : 0,
        availableValue: sum(available.map((u) => u.price)),
        dealValue: sum(projectDeals.map((x) => x.totalAmount)),
        collected: sum(projectDeals.map((x) => x.paidAmount)),
        budgetTotal,
        budgetUsed,
        budgetUtilization: budgetTotal > 0 ? budgetUsed / budgetTotal : undefined,
      };
    })
    .sort((a, b) => b.dealValue - a.dealValue);
}

export function agentLeaderboard(d: DashboardData) {
  const by = new Map<string, { leads: number; won: number; open: number }>();
  for (const l of d.leads) {
    const cur = by.get(l.assignedTo) ?? { leads: 0, won: 0, open: 0 };
    cur.leads += 1;
    if (l.status === "won") cur.won += 1;
    if (l.status === "new" || l.status === "contacted" || l.status === "negotiation") cur.open += 1;
    by.set(l.assignedTo, cur);
  }
  return [...by.entries()]
    .map(([name, v]) => ({ name, ...v, conversion: v.leads ? v.won / v.leads : 0 }))
    .sort((a, b) => b.won - a.won || b.conversion - a.conversion);
}

export function inventory(d: DashboardData) {
  const total = d.units.length;
  const sold = d.units.filter((u) => u.status === "sold").length;
  const reserved = d.units.filter((u) => u.status === "reserved").length;
  const available = d.units.filter((u) => u.status === "available");
  return {
    total,
    sold,
    reserved,
    available: available.length,
    availableValue: sum(available.map((u) => u.price)),
    sellThrough: total ? (sold + reserved) / total : 0,
  };
}

// ───────────────────────────────────────────────────────────────── attention center
export type Severity = "high" | "medium" | "low";
export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  count: number;
  severity: Severity;
  href: string;
  /** icon key resolved by the component */
  icon: "overdue" | "cheque" | "approval" | "contract" | "quote" | "followup" | "budget" | "bills" | "leave";
}

export function attentionItems(d: DashboardData, formatMoney: (n: number) => string, today = TODAY): AttentionItem[] {
  const items: AttentionItem[] = [];
  const rec = receivables(d, today);
  if (rec.overdueCount > 0) {
    items.push({
      id: "overdue",
      title: tr("dashboard.attn.overdue.title", { count: rec.overdueCount }),
      detail: rec.buckets[3].amount > 0 ? tr("dashboard.attn.overdue.detail90", { amount: formatMoney(rec.overdueAmount), late: formatMoney(rec.buckets[3].amount) }) : tr("dashboard.attn.overdue.detail", { amount: formatMoney(rec.overdueAmount), days: Math.max(...overdueDays(d, today)) }),
      count: rec.overdueCount,
      severity: rec.buckets[3].amount > 0 || rec.buckets[2].amount > 0 ? "high" : "medium",
      href: "/dashboard/deals",
      icon: "overdue",
    });
  }
  const weekAhead = addDays(today, 7);
  const bounced = d.cheques.filter((c) => c.status === "bounced");
  const chequesDue = d.cheques.filter((c) => (c.status === "in_hand" || c.status === "deposited") && c.chequeDate >= today && c.chequeDate <= weekAhead);
  if (bounced.length > 0 || chequesDue.length > 0) {
    items.push({
      id: "cheques",
      title: bounced.length ? tr("dashboard.attn.bounced.title", { count: bounced.length }) : tr("dashboard.attn.chequesDue.title", { count: chequesDue.length }),
      detail: [
        bounced.length ? tr("dashboard.attn.bounced.detail", { amount: formatMoney(sum(bounced.map((c) => c.amount))) }) : "",
        chequesDue.length ? tr("dashboard.attn.chequesDue.detail", { count: chequesDue.length, amount: formatMoney(sum(chequesDue.map((c) => c.amount))) }) : "",
      ].filter(Boolean).join(" · "),
      count: bounced.length + chequesDue.length,
      severity: bounced.length ? "high" : "medium",
      href: "/dashboard/cheques",
      icon: "cheque",
    });
  }
  const pendingVouchers = d.vouchers.filter((v) => v.status === "pending").length;
  const pendingAdj = d.adjustments.filter((a) => a.status === "pending").length;
  const pendingApprovals = pendingVouchers + pendingAdj;
  if (pendingApprovals > 0) {
    items.push({
      id: "approvals",
      title: tr("dashboard.attn.approvals.title", { count: pendingApprovals }),
      detail: [pendingVouchers ? tr("dashboard.attn.approvals.vouchers", { count: pendingVouchers }) : "", pendingAdj ? tr("dashboard.attn.approvals.payroll", { count: pendingAdj }) : ""].filter(Boolean).join(" · "),
      count: pendingApprovals,
      severity: pendingApprovals >= 5 ? "high" : "medium",
      href: pendingVouchers ? "/dashboard/vouchers" : "/dashboard/payroll",
      icon: "approval",
    });
  }
  const pendingLeave = d.leaves.filter((l) => l.status === "pending").length;
  if (pendingLeave > 0) {
    items.push({ id: "leave", title: tr("dashboard.attn.leave.title", { count: pendingLeave }), detail: tr("dashboard.attn.leave.detail"), count: pendingLeave, severity: "low", href: "/dashboard/leave", icon: "leave" });
  }
  const expiring = d.contracts.filter((c) => c.status === "expiring");
  if (expiring.length > 0) {
    items.push({ id: "contracts", title: tr("dashboard.attn.contracts.title", { count: expiring.length }), detail: tr("dashboard.attn.contracts.detail", { amount: formatMoney(sum(expiring.map((c) => c.value))) }), count: expiring.length, severity: "medium", href: "/dashboard/contracts", icon: "contract" });
  }
  const quotesLapsing = d.quotations.filter((q) => q.status === "sent" && q.validUntil >= today && q.validUntil <= weekAhead);
  if (quotesLapsing.length > 0) {
    items.push({ id: "quotes", title: tr("dashboard.attn.quotes.title", { count: quotesLapsing.length }), detail: tr("dashboard.attn.quotes.detail"), count: quotesLapsing.length, severity: "medium", href: "/dashboard/quotations", icon: "quote" });
  }
  const followUps = d.leads.filter((l) => l.nextFollowUp && l.nextFollowUp <= today && l.status !== "won" && l.status !== "lost");
  if (followUps.length > 0) {
    items.push({ id: "followups", title: tr("dashboard.attn.followups.title", { count: followUps.length }), detail: tr("dashboard.attn.followups.detail"), count: followUps.length, severity: followUps.length >= 3 ? "high" : "medium", href: "/dashboard/crm", icon: "followup" });
  }
  const open = new Set(d.budgets.filter((b) => b.status !== "closed").map((b) => b.id));
  const hot = d.budgetLines.filter((l) => open.has(l.budgetId)).map(lineMetrics).filter((m) => m.health !== "ok");
  if (hot.length > 0) {
    const over = hot.filter((m) => m.health === "over").length;
    items.push({ id: "budgets", title: tr("dashboard.attn.budgets.title", { count: hot.length }), detail: over ? tr("dashboard.attn.budgets.over", { count: over }) : tr("dashboard.attn.budgets.near"), count: hot.length, severity: over ? "high" : "medium", href: "/dashboard/budgets", icon: "budget" });
  }
  const pay = payables(d);
  if (pay.count > 0) {
    items.push({ id: "bills", title: tr("dashboard.attn.bills.title", { count: pay.count }), detail: tr("dashboard.attn.bills.detail", { amount: formatMoney(pay.amount) }), count: pay.count, severity: "low", href: "/dashboard/expenses", icon: "bills" });
  }
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
}

function overdueDays(d: DashboardData, today: string) {
  const days = d.deals.flatMap((x) => x.installments.filter((i) => !i.paid && i.dueDate < today).map((i) => daysBetween(i.dueDate, today)));
  return days.length ? days : [0];
}

// ───────────────────────────────────────────────────────────────── upcoming
export interface UpcomingEvent {
  date: string;
  kind: "installment" | "cheque" | "contract" | "followup" | "leave" | "quote";
  title: string;
  detail: string;
  amount?: number;
  href: string;
}

export function upcoming(d: DashboardData, today = TODAY, days = 10): UpcomingEvent[] {
  const end = addDays(today, days);
  const name = (id: string) => d.customers.find((c) => c.id === id)?.name ?? "Customer";
  const events: UpcomingEvent[] = [];
  for (const deal of d.deals) {
    if (deal.status === "cancelled") continue;
    for (const i of deal.installments) {
      if (!i.paid && i.dueDate >= today && i.dueDate <= end) {
        events.push({ date: i.dueDate, kind: "installment", title: tr("dashboard.event.installment", { name: name(deal.customerId) }), detail: deal.voucherNo, amount: i.amount, href: "/dashboard/deals" });
      }
    }
  }
  for (const c of d.cheques) {
    if ((c.status === "in_hand" || c.status === "deposited") && c.chequeDate >= today && c.chequeDate <= end) {
      events.push({ date: c.chequeDate, kind: "cheque", title: tr("dashboard.event.cheque", { name: name(c.customerId) }), detail: `${c.bankName} · #${c.chequeNo}`, amount: c.amount, href: "/dashboard/cheques" });
    }
  }
  for (const c of d.contracts) {
    if (c.endDate >= today && c.endDate <= end) events.push({ date: c.endDate, kind: "contract", title: tr("dashboard.event.contract", { name: c.partyName }), detail: c.title, amount: c.value, href: "/dashboard/contracts" });
  }
  for (const l of d.leads) {
    if (l.nextFollowUp && l.nextFollowUp >= today && l.nextFollowUp <= end && l.status !== "won" && l.status !== "lost") {
      events.push({ date: l.nextFollowUp, kind: "followup", title: tr("dashboard.event.followup", { name: l.name }), detail: `${l.assignedTo} · ${l.interestedIn}`, href: "/dashboard/crm" });
    }
  }
  for (const l of d.leaves) {
    if (l.status === "approved" && l.fromDate >= today && l.fromDate <= end) {
      const who = d.staff.find((s) => s.id === l.staffId)?.name ?? "Staff";
      events.push({ date: l.fromDate, kind: "leave", title: tr("dashboard.event.leave", { name: who }), detail: tr("dashboard.event.leaveDetail", { type: l.type, days: l.days }), href: "/dashboard/leave" });
    }
  }
  for (const q of d.quotations) {
    if (q.status === "sent" && q.validUntil >= today && q.validUntil <= end) events.push({ date: q.validUntil, kind: "quote", title: tr("dashboard.event.quote", { number: q.number }), detail: name(q.customerId), href: "/dashboard/quotations" });
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ───────────────────────────────────────────────────────────────── people
export function people(d: DashboardData, today = TODAY) {
  const onLeave = d.leaves.filter((l) => l.status === "approved" && l.fromDate <= today && l.toDate >= today);
  const payroll = sum(d.staff.map((s) => s.salary));
  const byDept = new Map<string, number>();
  for (const s of d.staff) byDept.set(s.department, (byDept.get(s.department) ?? 0) + 1);
  return {
    headcount: d.staff.length,
    onLeave: onLeave.length,
    onLeaveNames: onLeave.map((l) => d.staff.find((s) => s.id === l.staffId)?.name ?? "Staff").slice(0, 3),
    pendingLeave: d.leaves.filter((l) => l.status === "pending").length,
    payroll,
    departments: [...byDept.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

// ───────────────────────────────────────────────────────────────── business health score
export interface HealthFactor {
  key: "collections" | "budget" | "sales" | "liquidity";
  label: string;
  score: number;
  value: string;
  how: string;
}

export function healthScore(d: DashboardData, today = TODAY) {
  const rec = receivables(d, today);
  const inv = inventory(d);
  const cash = cashPosition(d).total;
  const pay = payables(d);

  const open = new Set(d.budgets.filter((b) => b.status !== "closed").map((b) => b.id));
  const metrics = d.budgetLines.filter((l) => open.has(l.budgetId)).map(lineMetrics);
  const over = metrics.filter((m) => m.health === "over").length;
  const watch = metrics.filter((m) => m.health === "watch").length;

  const factors: HealthFactor[] = [];
  factors.push({
    key: "collections",
    label: tr("dashboard.health.collections"),
    score: Math.round(rec.efficiency * 100),
    value: tr("dashboard.health.collections.value", { pct: Math.round(rec.efficiency * 100) }),
    how: tr("dashboard.health.collections.how"),
  });
  if (metrics.length > 0) {
    const score = Math.round(Math.max(0, 1 - (over + watch * 0.5) / metrics.length) * 100);
    factors.push({
      key: "budget",
      label: tr("dashboard.health.budget"),
      score,
      value: over || watch ? tr("dashboard.health.budget.value", { over, watch }) : tr("dashboard.health.budget.ok"),
      how: tr("dashboard.health.budget.how"),
    });
  }
  factors.push({
    key: "sales",
    label: tr("dashboard.health.sales"),
    score: Math.round(inv.sellThrough * 100),
    value: tr("dashboard.health.sales.value", { pct: Math.round(inv.sellThrough * 100) }),
    how: tr("dashboard.health.sales.how"),
  });
  const coverage = pay.amount > 0 ? cash / pay.amount : 3;
  factors.push({
    key: "liquidity",
    label: tr("dashboard.health.liquidity"),
    score: Math.round(Math.min(1, coverage / 1.5) * 100),
    value: pay.amount > 0 ? tr("dashboard.health.liquidity.value", { pct: Math.round(coverage * 100) }) : tr("dashboard.health.liquidity.none"),
    how: tr("dashboard.health.liquidity.how"),
  });

  const overall = factors.length ? Math.round(sum(factors.map((f) => f.score)) / factors.length) : 0;
  const grade = tr(overall >= 80 ? "dashboard.health.grade.excellent" : overall >= 60 ? "dashboard.health.grade.good" : overall >= 40 ? "dashboard.health.grade.attention" : "dashboard.health.grade.risk");
  return { overall, grade, factors };
}

// ───────────────────────────────────────────────────────────────── smart insights
export interface SmartInsight {
  id: string;
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  body: string;
  href?: string;
  cta?: string;
}

export function smartInsights(d: DashboardData, formatMoney: (n: number) => string, period: Period, today = TODAY): SmartInsight[] {
  const out: SmartInsight[] = [];
  const rec = receivables(d, today);
  const stats = periodStats(d, period, today);
  const port = portfolio(d);

  if (rec.topOverdue.length > 0 && rec.overdueAmount > 0) {
    const top = rec.topOverdue[0];
    const share = Math.round((top.amount / rec.overdueAmount) * 100);
    const name = d.customers.find((c) => c.id === top.customerId)?.name ?? tr("dashboard.insight.oneCustomer");
    out.push({
      id: "overdue-conc",
      tone: share >= 35 ? "bad" : "warn",
      title: tr("dashboard.insight.concentration.title", { name, amount: formatMoney(top.amount) }),
      body: tr("dashboard.insight.concentration.body", { share, total: formatMoney(rec.overdueAmount), days: top.oldest }),
      href: "/dashboard/customers",
      cta: tr("dashboard.insight.concentration.cta"),
    });
  }
  if (rec.dueAmount > 0) {
    const eff = Math.round(rec.efficiency * 100);
    out.push({
      id: "efficiency",
      tone: eff >= 85 ? "good" : eff >= 65 ? "warn" : "bad",
      title: tr("dashboard.insight.efficiency.title", { pct: eff }),
      body: eff < 85
        ? tr("dashboard.insight.efficiency.bodyOutstanding", { collected: formatMoney(rec.collectedOfDue), due: formatMoney(rec.dueAmount), outstanding: formatMoney(rec.dueAmount - rec.collectedOfDue) })
        : tr("dashboard.insight.efficiency.body", { collected: formatMoney(rec.collectedOfDue), due: formatMoney(rec.dueAmount) }),
      href: "/dashboard/deals",
      cta: tr("dashboard.insight.efficiency.cta"),
    });
  }
  if (stats.bookingsDelta !== undefined) {
    out.push({
      id: "momentum",
      tone: stats.bookingsDelta >= 0 ? "good" : "warn",
      title: tr(stats.bookingsDelta >= 0 ? "dashboard.insight.momentum.up" : "dashboard.insight.momentum.down", { pct: Math.abs(stats.bookingsDelta) }),
      body: tr("dashboard.insight.momentum.body", { count: stats.bookings, value: formatMoney(stats.salesValue), period: periodLabel(period, "inline"), prev: stats.bookingsPrev }),
      href: "/dashboard/deals",
      cta: tr("dashboard.insight.momentum.cta"),
    });
  }
  const unsold = port.filter((p) => p.available > 0).sort((a, b) => b.availableValue - a.availableValue)[0];
  if (unsold) {
    out.push({
      id: "unsold",
      tone: "info",
      title: tr("dashboard.insight.unsold.title", { project: unsold.project.name }),
      body: tr("dashboard.insight.unsold.body", { count: unsold.available, value: formatMoney(unsold.availableValue), sold: Math.round(unsold.soldPct * 100) }),
      href: "/dashboard/properties",
      cta: tr("dashboard.insight.unsold.cta"),
    });
  }
  const open = new Set(d.budgets.filter((b) => b.status !== "closed").map((b) => b.id));
  const worst = d.budgetLines
    .filter((l) => open.has(l.budgetId))
    .map((l) => ({ l, m: lineMetrics(l) }))
    .sort((a, b) => b.m.utilization - a.m.utilization)[0];
  if (worst && worst.m.health !== "ok") {
    const b = d.budgets.find((x) => x.id === worst.l.budgetId);
    out.push({
      id: "budget",
      tone: worst.m.health === "over" ? "bad" : "warn",
      title: tr("dashboard.insight.budget.title", { category: worst.l.category, pct: Math.round(worst.m.utilization * 100) }),
      body: tr(worst.m.health === "over" ? "dashboard.insight.budget.bodyOver" : "dashboard.insight.budget.body", { budget: b?.name.replace(" — Project Budget", "") ?? tr("dashboard.insight.budget.aBudget"), used: formatMoney(worst.m.used), total: formatMoney(worst.m.budget) }),
      href: "/dashboard/budgets",
      cta: tr("dashboard.insight.budget.cta"),
    });
  }
  const op = d.budgets.find((b) => b.kind === "operating");
  if (op) {
    const lines = d.budgetLines.filter((l) => l.budgetId === op.id);
    const planToDate = sum(lines.map((l) => sum((l.monthlyBudgetAmounts ?? []).slice(0, 3))));
    const actual = sum(lines.map((l) => l.actualAmount));
    const hotLine = lines
      .map((l) => ({ l, plan: sum((l.monthlyBudgetAmounts ?? []).slice(0, 3)) }))
      .filter((x) => x.plan > 0)
      .map((x) => ({ ...x, over: x.l.actualAmount / x.plan - 1 }))
      .sort((a, b) => b.over - a.over)[0];
    if (hotLine && hotLine.over > 0.08) {
      out.push({
        id: "opex",
        tone: "warn",
        title: tr("dashboard.insight.opex.title", { category: hotLine.l.category, pct: Math.round(hotLine.over * 100) }),
        body: tr(actual > planToDate ? "dashboard.insight.opex.bodyOver" : "dashboard.insight.opex.bodyUnder", { spent: formatMoney(hotLine.l.actualAmount), planned: formatMoney(hotLine.plan), diff: formatMoney(Math.abs(actual - planToDate)) }),
        href: "/dashboard/budgets",
        cta: tr("dashboard.insight.opex.cta"),
      });
    }
  }
  const order = { bad: 0, warn: 1, info: 2, good: 3 } as const;
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 6);
}

// ───────────────────────────────────────────────────────────────── live activity (real events)
export interface ActivityEvent {
  id: string;
  date: string;
  kind: "payment" | "booking" | "lead" | "voucher" | "cheque";
  title: string;
  detail: string;
}

export function recentActivity(d: DashboardData, today = TODAY, limit = 7): ActivityEvent[] {
  const name = (id: string) => d.customers.find((c) => c.id === id)?.name ?? tr("common.customer");
  const code = (id: string) => d.units.find((u) => u.id === id)?.code ?? "";
  const money = (n: number) => formatPkr(n, { compact: true });
  const events: ActivityEvent[] = [];
  for (const deal of d.deals) {
    if (deal.createdAt <= today) events.push({ id: `b-${deal.id}`, date: deal.createdAt, kind: "booking", title: tr("dashboard.feed.booking"), detail: `${name(deal.customerId)} · ${code(deal.unitId)}` });
    for (const i of deal.installments) {
      if (i.paid && i.paidDate && i.paidDate <= today) events.push({ id: `p-${i.id}-${deal.id}`, date: i.paidDate, kind: "payment", title: tr("dashboard.feed.payment"), detail: tr("dashboard.feed.paymentDetail", { name: name(deal.customerId), amount: money(i.amount), code: code(deal.unitId) }) });
    }
  }
  for (const l of d.leads) if (l.createdAt <= today) events.push({ id: `l-${l.id}`, date: l.createdAt, kind: "lead", title: tr("dashboard.feed.lead"), detail: tr("dashboard.feed.leadDetail", { name: l.name, source: l.source, interest: l.interestedIn }) });
  for (const v of d.vouchers) if (v.status === "approved" && v.approvedAt && v.approvedAt <= today) events.push({ id: `v-${v.id}`, date: v.approvedAt, kind: "voucher", title: tr("dashboard.feed.voucher"), detail: `${v.number} · ${v.description || v.type}` });
  for (const c of d.cheques) if (c.status === "cleared" && c.chequeDate <= today) events.push({ id: `c-${c.id}`, date: c.chequeDate, kind: "cheque", title: tr("dashboard.feed.cheque"), detail: `${c.bankName} · ${money(c.amount)}` });
  // newest first, but never let one kind (usually installment receipts) crowd out the rest
  const sorted = events.sort((a, b) => (a.date < b.date ? 1 : -1));
  const taken: Record<string, number> = {};
  const out: ActivityEvent[] = [];
  for (const e of sorted) {
    taken[e.kind] = (taken[e.kind] ?? 0) + 1;
    if (taken[e.kind] <= 2) out.push(e);
    if (out.length === limit) break;
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function relativeDay(iso: string, today = TODAY) {
  const n = daysBetween(iso, today);
  if (n <= 0) return tr("common.today");
  if (n === 1) return tr("common.yesterday");
  if (n < 14) return tr("dashboard.when.daysAgo", { count: n });
  if (n < 60) return tr("dashboard.when.weeksAgo", { count: Math.round(n / 7) });
  return tr("dashboard.when.monthsAgo", { count: Math.round(n / 30) });
}

/** Trailing monthly series of money collected (for KPI sparklines). */
export function collectionsByMonth(d: DashboardData, today = TODAY, months = 8) {
  const cur = monthKey(today);
  const keys = Array.from({ length: months }, (_, i) => shiftMonth(cur, i - (months - 1)));
  const paid = d.deals.flatMap((x) => x.installments.filter((i) => i.paid && i.paidDate));
  return keys.map((k) => sum(paid.filter((i) => monthKey(i.paidDate!) === k).map((i) => i.amount)));
}
