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
import { formatPkr } from "@/lib/format";

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
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (key: string) => MONTH_NAMES[Number(key.slice(5, 7)) - 1];
function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const inRange = (iso: string | undefined, a: string, b: string) => !!iso && iso >= a && iso <= b;

// ───────────────────────────────────────────────────────────────── period KPIs
export type Period = "30d" | "90d" | "12m";
export const PERIOD_LABEL: Record<Period, string> = { "30d": "Last 30 days", "90d": "Last 90 days", "12m": "Last 12 months" };
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
  { key: "0-30", label: "1–30 days", min: 1, max: 30 },
  { key: "31-60", label: "31–60 days", min: 31, max: 60 },
  { key: "61-90", label: "61–90 days", min: 61, max: 90 },
  { key: "90+", label: "90+ days", min: 91, max: Infinity },
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
      title: `${rec.overdueCount} overdue installment${rec.overdueCount > 1 ? "s" : ""}`,
      detail: rec.buckets[3].amount > 0 ? `${formatMoney(rec.overdueAmount)} past due — ${formatMoney(rec.buckets[3].amount)} is 90+ days late` : `${formatMoney(rec.overdueAmount)} past due — oldest is ${Math.max(...overdueDays(d, today))} days late`,
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
      title: bounced.length ? `${bounced.length} bounced cheque${bounced.length > 1 ? "s" : ""}` : `${chequesDue.length} cheque${chequesDue.length > 1 ? "s" : ""} due this week`,
      detail: [
        bounced.length ? `${formatMoney(sum(bounced.map((c) => c.amount)))} bounced — follow up with the customer` : "",
        chequesDue.length ? `${chequesDue.length} due within 7 days (${formatMoney(sum(chequesDue.map((c) => c.amount)))})` : "",
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
      title: `${pendingApprovals} waiting for your approval`,
      detail: [pendingVouchers ? `${pendingVouchers} voucher${pendingVouchers > 1 ? "s" : ""}` : "", pendingAdj ? `${pendingAdj} payroll adjustment${pendingAdj > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · "),
      count: pendingApprovals,
      severity: pendingApprovals >= 5 ? "high" : "medium",
      href: pendingVouchers ? "/dashboard/vouchers" : "/dashboard/payroll",
      icon: "approval",
    });
  }
  const pendingLeave = d.leaves.filter((l) => l.status === "pending").length;
  if (pendingLeave > 0) {
    items.push({ id: "leave", title: `${pendingLeave} leave request${pendingLeave > 1 ? "s" : ""} pending`, detail: "Staff are waiting for a decision", count: pendingLeave, severity: "low", href: "/dashboard/leave", icon: "leave" });
  }
  const expiring = d.contracts.filter((c) => c.status === "expiring");
  if (expiring.length > 0) {
    items.push({ id: "contracts", title: `${expiring.length} contract${expiring.length > 1 ? "s" : ""} expiring soon`, detail: `${formatMoney(sum(expiring.map((c) => c.value)))} in agreements to renew`, count: expiring.length, severity: "medium", href: "/dashboard/contracts", icon: "contract" });
  }
  const quotesLapsing = d.quotations.filter((q) => q.status === "sent" && q.validUntil >= today && q.validUntil <= weekAhead);
  if (quotesLapsing.length > 0) {
    items.push({ id: "quotes", title: `${quotesLapsing.length} quotation${quotesLapsing.length > 1 ? "s" : ""} lapsing this week`, detail: "Follow up before the offer expires", count: quotesLapsing.length, severity: "medium", href: "/dashboard/quotations", icon: "quote" });
  }
  const followUps = d.leads.filter((l) => l.nextFollowUp && l.nextFollowUp <= today && l.status !== "won" && l.status !== "lost");
  if (followUps.length > 0) {
    items.push({ id: "followups", title: `${followUps.length} lead follow-up${followUps.length > 1 ? "s" : ""} due`, detail: "Today or overdue — leads go cold quickly", count: followUps.length, severity: followUps.length >= 3 ? "high" : "medium", href: "/dashboard/crm", icon: "followup" });
  }
  const open = new Set(d.budgets.filter((b) => b.status !== "closed").map((b) => b.id));
  const hot = d.budgetLines.filter((l) => open.has(l.budgetId)).map(lineMetrics).filter((m) => m.health !== "ok");
  if (hot.length > 0) {
    const over = hot.filter((m) => m.health === "over").length;
    items.push({ id: "budgets", title: `${hot.length} budget line${hot.length > 1 ? "s" : ""} need attention`, detail: over ? `${over} already over budget` : "Approaching the limit", count: hot.length, severity: over ? "high" : "medium", href: "/dashboard/budgets", icon: "budget" });
  }
  const pay = payables(d);
  if (pay.count > 0) {
    items.push({ id: "bills", title: `${pay.count} unpaid bill${pay.count > 1 ? "s" : ""}`, detail: `${formatMoney(pay.amount)} payable to vendors and contractors`, count: pay.count, severity: "low", href: "/dashboard/expenses", icon: "bills" });
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
        events.push({ date: i.dueDate, kind: "installment", title: `Installment due — ${name(deal.customerId)}`, detail: deal.voucherNo, amount: i.amount, href: "/dashboard/deals" });
      }
    }
  }
  for (const c of d.cheques) {
    if ((c.status === "in_hand" || c.status === "deposited") && c.chequeDate >= today && c.chequeDate <= end) {
      events.push({ date: c.chequeDate, kind: "cheque", title: `Cheque date — ${name(c.customerId)}`, detail: `${c.bankName} · #${c.chequeNo}`, amount: c.amount, href: "/dashboard/cheques" });
    }
  }
  for (const c of d.contracts) {
    if (c.endDate >= today && c.endDate <= end) events.push({ date: c.endDate, kind: "contract", title: `Contract ends — ${c.partyName}`, detail: c.title, amount: c.value, href: "/dashboard/contracts" });
  }
  for (const l of d.leads) {
    if (l.nextFollowUp && l.nextFollowUp >= today && l.nextFollowUp <= end && l.status !== "won" && l.status !== "lost") {
      events.push({ date: l.nextFollowUp, kind: "followup", title: `Follow up — ${l.name}`, detail: `${l.assignedTo} · ${l.interestedIn}`, href: "/dashboard/crm" });
    }
  }
  for (const l of d.leaves) {
    if (l.status === "approved" && l.fromDate >= today && l.fromDate <= end) {
      const who = d.staff.find((s) => s.id === l.staffId)?.name ?? "Staff";
      events.push({ date: l.fromDate, kind: "leave", title: `${who} on leave`, detail: `${l.type} · ${l.days} day${l.days > 1 ? "s" : ""}`, href: "/dashboard/leave" });
    }
  }
  for (const q of d.quotations) {
    if (q.status === "sent" && q.validUntil >= today && q.validUntil <= end) events.push({ date: q.validUntil, kind: "quote", title: `Quotation expires — ${q.number}`, detail: name(q.customerId), href: "/dashboard/quotations" });
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
    label: "Collections",
    score: Math.round(rec.efficiency * 100),
    value: `${Math.round(rec.efficiency * 100)}% collected`,
    how: "Share of all installments that have fallen due so far that have been paid.",
  });
  if (metrics.length > 0) {
    const score = Math.round(Math.max(0, 1 - (over + watch * 0.5) / metrics.length) * 100);
    factors.push({
      key: "budget",
      label: "Budget discipline",
      score,
      value: over || watch ? `${over} over · ${watch} watch` : "All on track",
      how: "Budget lines on track out of all open lines (a line near its limit counts half).",
    });
  }
  factors.push({
    key: "sales",
    label: "Sales progress",
    score: Math.round(inv.sellThrough * 100),
    value: `${Math.round(inv.sellThrough * 100)}% sold or reserved`,
    how: "Properties sold or reserved as a share of the whole portfolio.",
  });
  const coverage = pay.amount > 0 ? cash / pay.amount : 3;
  factors.push({
    key: "liquidity",
    label: "Liquidity",
    score: Math.round(Math.min(1, coverage / 1.5) * 100),
    value: pay.amount > 0 ? `Cash covers ${Math.round(coverage * 100)}% of unpaid bills` : "No unpaid bills",
    how: "Cash and bank balance compared with bills still to be paid (150% cover scores full marks).",
  });

  const overall = factors.length ? Math.round(sum(factors.map((f) => f.score)) / factors.length) : 0;
  const grade = overall >= 80 ? "Excellent" : overall >= 60 ? "Good" : overall >= 40 ? "Needs attention" : "At risk";
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
    const name = d.customers.find((c) => c.id === top.customerId)?.name ?? "One customer";
    out.push({
      id: "overdue-conc",
      tone: share >= 35 ? "bad" : "warn",
      title: `${name} owes ${formatMoney(top.amount)}`,
      body: `That is ${share}% of everything overdue (${formatMoney(rec.overdueAmount)}); the oldest installment is ${top.oldest} days late.`,
      href: "/dashboard/customers",
      cta: "Open customers",
    });
  }
  if (rec.dueAmount > 0) {
    const eff = Math.round(rec.efficiency * 100);
    out.push({
      id: "efficiency",
      tone: eff >= 85 ? "good" : eff >= 65 ? "warn" : "bad",
      title: `Collection efficiency is ${eff}%`,
      body: `${formatMoney(rec.collectedOfDue)} of ${formatMoney(rec.dueAmount)} due so far has been collected${eff < 85 ? ` — ${formatMoney(rec.dueAmount - rec.collectedOfDue)} is still outstanding` : ""}.`,
      href: "/dashboard/deals",
      cta: "See bookings",
    });
  }
  if (stats.bookingsDelta !== undefined) {
    out.push({
      id: "momentum",
      tone: stats.bookingsDelta >= 0 ? "good" : "warn",
      title: `Bookings ${stats.bookingsDelta >= 0 ? "up" : "down"} ${Math.abs(stats.bookingsDelta)}%`,
      body: `${stats.bookings} new booking${stats.bookings === 1 ? "" : "s"} worth ${formatMoney(stats.salesValue)} in the ${PERIOD_LABEL[period].toLowerCase()}, versus ${stats.bookingsPrev} in the period before.`,
      href: "/dashboard/deals",
      cta: "View deals",
    });
  }
  const unsold = port.filter((p) => p.available > 0).sort((a, b) => b.availableValue - a.availableValue)[0];
  if (unsold) {
    out.push({
      id: "unsold",
      tone: "info",
      title: `${unsold.project.name} holds the most unsold stock`,
      body: `${unsold.available} propert${unsold.available === 1 ? "y" : "ies"} worth ${formatMoney(unsold.availableValue)} are available; ${Math.round(unsold.soldPct * 100)}% of the project is sold.`,
      href: "/dashboard/properties",
      cta: "Open properties",
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
      title: `${worst.l.category} is at ${Math.round(worst.m.utilization * 100)}% of budget`,
      body: `${b?.name.replace(" — Project Budget", "") ?? "A budget"}: ${formatMoney(worst.m.used)} used of ${formatMoney(worst.m.budget)}${worst.m.health === "over" ? " — raise a revision or stop further spend" : ""}.`,
      href: "/dashboard/budgets",
      cta: "Open budgets",
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
        title: `${hotLine.l.category} is running ${Math.round(hotLine.over * 100)}% over plan`,
        body: `Year to date: ${formatMoney(hotLine.l.actualAmount)} spent against ${formatMoney(hotLine.plan)} planned. Overall operating spend is ${actual > planToDate ? "over" : "under"} plan by ${formatMoney(Math.abs(actual - planToDate))}.`,
        href: "/dashboard/budgets",
        cta: "See variance",
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
  const name = (id: string) => d.customers.find((c) => c.id === id)?.name ?? "Customer";
  const code = (id: string) => d.units.find((u) => u.id === id)?.code ?? "";
  const money = (n: number) => formatPkr(n, { compact: true });
  const events: ActivityEvent[] = [];
  for (const deal of d.deals) {
    if (deal.createdAt <= today) events.push({ id: `b-${deal.id}`, date: deal.createdAt, kind: "booking", title: "Booking confirmed", detail: `${name(deal.customerId)} · ${code(deal.unitId)}` });
    for (const i of deal.installments) {
      if (i.paid && i.paidDate && i.paidDate <= today) events.push({ id: `p-${i.id}-${deal.id}`, date: i.paidDate, kind: "payment", title: "Installment received", detail: `${name(deal.customerId)} paid ${money(i.amount)} · ${code(deal.unitId)}` });
    }
  }
  for (const l of d.leads) if (l.createdAt <= today) events.push({ id: `l-${l.id}`, date: l.createdAt, kind: "lead", title: "New lead", detail: `${l.name} via ${l.source} · ${l.interestedIn}` });
  for (const v of d.vouchers) if (v.status === "approved" && v.approvedAt && v.approvedAt <= today) events.push({ id: `v-${v.id}`, date: v.approvedAt, kind: "voucher", title: "Voucher approved", detail: `${v.number} · ${v.description || v.type}` });
  for (const c of d.cheques) if (c.status === "cleared" && c.chequeDate <= today) events.push({ id: `c-${c.id}`, date: c.chequeDate, kind: "cheque", title: "Cheque cleared", detail: `${c.bankName} · ${money(c.amount)}` });
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
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}

/** Trailing monthly series of money collected (for KPI sparklines). */
export function collectionsByMonth(d: DashboardData, today = TODAY, months = 8) {
  const cur = monthKey(today);
  const keys = Array.from({ length: months }, (_, i) => shiftMonth(cur, i - (months - 1)));
  const paid = d.deals.flatMap((x) => x.installments.filter((i) => i.paid && i.paidDate));
  return keys.map((k) => sum(paid.filter((i) => monthKey(i.paidDate!) === k).map((i) => i.amount)));
}
