"use client";

import { useCompany } from "@/lib/providers/company-provider";
import { LiveBudgets } from "@/components/live/budgets-live";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  BellRing,
  CalendarRange,
  CircleCheck,
  FolderKanban,
  Gauge,
  HandCoins,
  PiggyBank,
  PlusCircle,
  ScrollText,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SpotlightCard } from "@/components/spotlight-card";
import { Sparkline } from "@/components/sparkline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UtilizationBar } from "@/components/budgets/utilization-bar";
import { BudgetStatusBadge, ControlModeChip, HealthChip } from "@/components/budgets/budget-badges";
import { BudgetDetailSheet } from "@/components/budgets/budget-detail-sheet";
import { NewBudgetDialog } from "@/components/dialogs/new-budget-dialog";
import { useBudgetLines, useBudgets, useProjects } from "@/lib/hooks/use-data";
import {
  BUDGET_ELAPSED_MONTHS,
  BUDGET_FY,
  FY_MONTHS,
  HEALTH_META,
  lineMetrics,
  linesOf,
  sumLines,
  type BudgetHealth,
} from "@/lib/budgets";
import { formatPkr, formatAxis } from "@/lib/format";
import type { Budget, BudgetLine } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { tx } from "@/lib/i18n/runtime";

function DemoBudgetsPage() {
  const t = useT();
  const { data: budgets, isLoading } = useBudgets();
  const { data: lines } = useBudgetLines();
  const { data: projects } = useProjects();
  const [newOpen, setNewOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("projects");

  // Deep links: /dashboard/budgets#operating, #variance, or #bud-1 to open one budget.
  React.useEffect(() => {
    const h = window.location.hash.slice(1);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (h === "operating" || h === "variance") setTab(h);
    else if (h.startsWith("bud-")) setSelectedId(h);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const allLines = React.useMemo(() => lines ?? [], [lines]);
  const projectBudgets = React.useMemo(() => (budgets ?? []).filter((b) => b.kind === "project"), [budgets]);
  const operating = (budgets ?? []).find((b) => b.kind === "operating") ?? null;
  const projectName = (b: Budget) => projects?.find((p) => p.id === b.projectId)?.name;

  const live = projectBudgets.filter((b) => b.status === "approved" || b.status === "locked");
  const liveTotals = sumLines(live.flatMap((b) => linesOf(allLines, b.id)));
  const pendingApproval = (budgets ?? []).filter((b) => b.status === "submitted").length;

  const attention = React.useMemo(() => {
    const open = new Set((budgets ?? []).filter((b) => b.status !== "closed").map((b) => b.id));
    return allLines
      .filter((l) => open.has(l.budgetId))
      .map((l) => ({ line: l, m: lineMetrics(l) }))
      .filter((x) => x.m.health !== "ok")
      .sort((a, b) => b.m.utilization - a.m.utilization);
  }, [allLines, budgets]);

  const selected = (budgets ?? []).find((b) => b.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        icon={PiggyBank}
        eyebrow={t("nav.section.finance")}
        title={t("perm.module.budgets")}
        description={t("dm.bud.description", { count: budgets?.length ?? 0 })}
        actions={
          <Button className="gap-1.5" onClick={() => setNewOpen(true)}>
            <PlusCircle className="size-4" />
            {t("dm.new_budget")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t("dm.project_budgets_approved")} value={liveTotals.budget} format={(n) => formatPkr(n, { compact: true })} icon={PiggyBank} index={0} />
        <KpiCard label={t("dm.paid_to_date")} value={liveTotals.actual} format={(n) => formatPkr(n, { compact: true })} icon={Wallet} accent="gold" index={1} />
        <KpiCard label={t("dm.committed_not_yet_paid")} value={liveTotals.committed} format={(n) => formatPkr(n, { compact: true })} icon={HandCoins} index={2} />
        <KpiCard
          label={t("dm.still_available")}
          value={Math.max(liveTotals.available, 0)}
          format={(n) => formatPkr(n, { compact: true })}
          icon={Gauge}
          accent="gold"
          index={3}
        />
      </div>

      {/* attention panel */}
      <SpotlightCard className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className={cn("flex size-9 items-center justify-center rounded-xl", attention.length ? "bg-warning/15 text-warning" : "bg-success/12 text-success")}>
              {attention.length ? <BellRing className="size-4.5" /> : <CircleCheck className="size-4.5" />}
            </span>
            <div>
              <h3 className="font-heading text-base font-semibold">
                {attention.length ? t("dm.bud.attention", { count: attention.length }) : t("dm.bud.on_track")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("dm.alerts_fire_at_85_of")}
                {pendingApproval > 0 && ` ${t("dm.bud.waiting", { count: pendingApproval })}`}
              </p>
            </div>
          </div>
        </div>
        {attention.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {attention.slice(0, 6).map(({ line, m }, i) => {
              const b = (budgets ?? []).find((x) => x.id === line.budgetId)!;
              return (
                <motion.button
                  key={line.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  onClick={() => setSelectedId(b.id)}
                  className="group flex items-center gap-3 rounded-xl border border-border/70 p-3 text-start transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-md"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums" style={{ background: `color-mix(in oklch, ${HEALTH_META[m.health].color} 16%, transparent)`, color: HEALTH_META[m.health].color }}>
                    {Math.round(m.utilization * 100)}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{line.category}</span>
                    <span className="block truncate text-xs text-muted-foreground">{b.name.replace(" — Project Budget", "")}</span>
                  </span>
                  <HealthChip health={m.health} />
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
                </motion.button>
              );
            })}
          </div>
        )}
      </SpotlightCard>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="projects" className="gap-1.5"><FolderKanban /> {t("dm.project_budgets")}</TabsTrigger>
          <TabsTrigger value="operating" className="gap-1.5"><CalendarRange /> {t("dm.bud.operating", { year: BUDGET_FY })}</TabsTrigger>
          <TabsTrigger value="variance" className="gap-1.5"><ScrollText /> {t("dm.variance_report")}</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-5">
          {isLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
            </div>
          ) : projectBudgets.length === 0 ? (
            <EmptyState onNew={() => setNewOpen(true)} />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {projectBudgets.map((b, i) => (
                <ProjectBudgetCard
                  key={b.id}
                  budget={b}
                  lines={linesOf(allLines, b.id)}
                  projectName={projectName(b) ?? b.name}
                  index={i}
                  onOpen={() => setSelectedId(b.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="operating" className="mt-5">
          {operating ? (
            <OperatingView budget={operating} lines={linesOf(allLines, operating.id)} onOpen={() => setSelectedId(operating.id)} />
          ) : (
            <EmptyState onNew={() => setNewOpen(true)} operating />
          )}
        </TabsContent>

        <TabsContent value="variance" className="mt-5">
          <VarianceReport budgets={budgets ?? []} lines={allLines} onOpen={(id) => setSelectedId(id)} />
        </TabsContent>
      </Tabs>

      <BudgetDetailSheet
        budget={selected}
        lines={selected ? linesOf(allLines, selected.id) : []}
        subtitle={selected ? (selected.kind === "project" ? t("dm.bud.project_budget", { name: projectName(selected) ?? "" }) : t("dm.bud.annual_budget", { year: selected.fiscalYear })) : undefined}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
      <NewBudgetDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        existingProjectIds={projectBudgets.map((b) => b.projectId).filter((x): x is string => Boolean(x))}
      />
    </div>
  );
}

function EmptyState({ onNew, operating }: { onNew: () => void; operating?: boolean }) {
  const t = useT();
  return (
    <SpotlightCard className="flex flex-col items-center gap-3 border-dashed p-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <PiggyBank className="size-6" />
      </span>
      <p className="font-heading text-lg font-semibold">{operating ? "No operating budget yet" : "No project budgets yet"}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("dm.set_a_limit_first_then")}
      </p>
      <Button className="gap-1.5" onClick={onNew}><PlusCircle className="size-4" /> {t("dm.create_a_budget")}</Button>
    </SpotlightCard>
  );
}

function Ring({ value, health, size = 76 }: { value: number; health: BudgetHealth; size?: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const pct = Math.min(value, 1);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--secondary)" strokeWidth="4" />
        <motion.circle
          cx="18" cy="18" r={r} fill="none" stroke={HEALTH_META[health].color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}

function ProjectBudgetCard({
  budget,
  lines,
  projectName,
  index,
  onOpen,
}: {
  budget: Budget;
  lines: BudgetLine[];
  projectName: string;
  index: number;
  onOpen: () => void;
}) {
  const t = useT();
  const tot = sumLines(lines);
  const hot = lines.map((l) => ({ l, m: lineMetrics(l) })).filter((x) => x.m.health !== "ok").sort((a, b) => b.m.utilization - a.m.utilization);
  const forecast = lines.reduce((s, l) => s + l.forecastAmount, 0);
  const pendingRev = budget.revisions.filter((r) => r.status === "pending").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <SpotlightCard className="group h-full cursor-pointer p-5" onClick={onOpen} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
        <div className="flex items-start gap-4">
          <Ring value={tot.utilization} health={tot.health} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <BudgetStatusBadge status={budget.status} />
              <ControlModeChip mode={budget.controlMode} />
              {pendingRev > 0 && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">{t("dm.bud.revpending", { count: pendingRev })}</span>}
            </div>
            <h3 className="mt-1.5 truncate font-heading text-lg font-semibold">{projectName}</h3>
            <p className="text-xs text-muted-foreground">{t("dm.bud.vlines", { version: budget.version, count: lines.length })}</p>
          </div>
          <HealthChip health={tot.health} />
        </div>

        <div className="mt-4">
          <UtilizationBar budget={tot.budget} actual={tot.actual} committed={tot.committed} delay={index * 0.07} />
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <Figure label={t("audit.entity.budgets")} value={tot.budget} />
            <Figure label={t("deals.col.paid")} value={tot.actual} />
            <Figure label={t("bud.sheet.committed")} value={tot.committed} />
            <Figure label={tot.available >= 0 ? t("dm.bud.available") : t("dm.bud.over_by")} value={Math.abs(tot.available)} tone={tot.available < 0 ? "over" : undefined} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
          {hot.length > 0 ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: HEALTH_META[hot[0].m.health].color }} />
              <span className="truncate text-muted-foreground">
                {hot[0].l.category} {t("dm.bud.at")} <span className={cn("font-semibold", HEALTH_META[hot[0].m.health].text)}>{Math.round(hot[0].m.utilization * 100)}%</span>
                {hot.length > 1 && ` · ${t("dm.bud.more", { count: hot.length - 1 })}`}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t("dm.all_lines_on_track")}</span>
          )}
          <span className="flex shrink-0 items-center gap-1 font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            {t("dm.bud.forecast", { amount: formatPkr(forecast, { compact: true }) })}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
          </span>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: "over" }) {
  return (
    <div>
      <p className={cn("font-heading text-base font-semibold tabular-nums", tone === "over" && "text-destructive")}>{formatPkr(value, { compact: true })}</p>
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
    </div>
  );
}

function OperatingView({ budget, lines, onOpen }: { budget: Budget; lines: BudgetLine[]; onOpen: () => void }) {
  const t = useT();
  const monthly = FY_MONTHS.map((m, i) => ({
    month: m,
    Budget: lines.reduce((s, l) => s + (l.monthlyBudgetAmounts?.[i] ?? 0), 0),
    Actual: i < BUDGET_ELAPSED_MONTHS ? lines.reduce((s, l) => s + (l.monthlyActualAmounts?.[i] ?? 0), 0) : null,
  }));
  const annual = monthly.reduce((s, m) => s + m.Budget, 0);
  const ytdBudget = monthly.slice(0, BUDGET_ELAPSED_MONTHS).reduce((s, m) => s + m.Budget, 0);
  const ytdActual = monthly.slice(0, BUDGET_ELAPSED_MONTHS).reduce((s, m) => s + (m.Actual ?? 0), 0);
  const variance = ytdBudget - ytdActual;
  const forecast = lines.reduce((s, l) => s + l.forecastAmount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("dm.annual_budget")} value={annual} format={(n) => formatPkr(n, { compact: true })} icon={CalendarRange} index={0} />
        <KpiCard label={t("dm.bud.spent_range", { from: FY_MONTHS[0]!, to: FY_MONTHS[BUDGET_ELAPSED_MONTHS - 1]! })} value={ytdActual} format={(n) => formatPkr(n, { compact: true })} icon={Wallet} accent="gold" index={1} />
        <KpiCard label={variance >= 0 ? t("dm.bud.under_plan") : t("dm.bud.over_plan")} value={Math.abs(variance)} format={(n) => formatPkr(n, { compact: true })} icon={Gauge} index={2} />
        <KpiCard label={t("dm.full_year_outlook")} value={forecast} format={(n) => formatPkr(n, { compact: true })} icon={ScrollText} accent="gold" index={3} />
      </div>

      <SpotlightCard className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-base font-semibold">{t("dm.month_by_month_plan_vs")}</h3>
            <p className="text-xs text-muted-foreground">{budget.name} · fiscal year runs July to June</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpen}>{t("dm.details")} <ArrowRight className="size-3.5 rtl:-scale-x-100" /></Button>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="opBudgetFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.35} />
              </linearGradient>
              <linearGradient id="opActualFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 8" />
            <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={formatAxis} />
            <Tooltip
              cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="mb-1 font-medium">{label}</p>
                    {payload.filter((p) => p.value != null).map((p) => (
                      <p key={String(p.dataKey)} className="text-muted-foreground">{p.name}: <span className="font-medium text-popover-foreground">{formatPkr(Number(p.value))}</span></p>
                    ))}
                  </div>
                ) : null
              }
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Budget" name={tx("dm.x.budget")} fill="url(#opBudgetFill)" radius={[6, 6, 0, 0]} maxBarSize={36} />
            <Area dataKey="Actual" name={tx("dm.x.actual")} legendType="none" type="monotone" stroke="none" fill="url(#opActualFill)" connectNulls={false} />
            <Line dataKey="Actual" name={tx("Actual")} type="monotone" stroke="var(--chart-1)" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </SpotlightCard>

      <SpotlightCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start">
                <th className="p-3 ps-5">{t("bud.line.categoryAria")}</th>
                <th className="p-3 text-end">{t("landing.pricing.annual")}</th>
                <th className="p-3 text-end">{t("dm.plan_to_date")}</th>
                <th className="p-3 text-end">{t("dm.actual")}</th>
                <th className="p-3 text-end">{t("dm.variance")}</th>
                <th className="hidden p-3 md:table-cell">{t("dm.phasing")}</th>
                <th className="p-3 pe-5 text-end">{t("dm.outlook")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const planToDate = (l.monthlyBudgetAmounts ?? []).slice(0, BUDGET_ELAPSED_MONTHS).reduce((s, x) => s + x, 0);
                const v = planToDate - l.actualAmount;
                const pct = planToDate > 0 ? v / planToDate : 0;
                const h: BudgetHealth = pct < -0.1 ? "over" : pct < 0 ? "watch" : "ok";
                return (
                  <motion.tr key={l.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="border-b border-border/40 last:border-0">
                    <td className="p-3 ps-5">
                      <p className="font-medium">{l.category}</p>
                      <p className="text-xs text-muted-foreground">{l.description}</p>
                    </td>
                    <td className="p-3 text-end tabular-nums">{formatPkr(l.budgetAmount, { compact: true })}</td>
                    <td className="p-3 text-end tabular-nums text-muted-foreground">{formatPkr(planToDate, { compact: true })}</td>
                    <td className="p-3 text-end font-medium tabular-nums">{formatPkr(l.actualAmount, { compact: true })}</td>
                    <td className="p-3 text-end">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", HEALTH_META[h].chip)}>
                        {v >= 0 ? "−" : "+"}{formatPkr(Math.abs(v), { compact: true })} ({Math.abs(Math.round(pct * 100))}%)
                      </span>
                    </td>
                    <td className="hidden w-32 p-3 md:table-cell">
                      <Sparkline data={l.monthlyBudgetAmounts ?? [0, 0]} height={26} stroke="var(--gold)" />
                    </td>
                    <td className="p-3 pe-5 text-end tabular-nums text-muted-foreground">{formatPkr(l.forecastAmount, { compact: true })}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SpotlightCard>
    </div>
  );
}

function VarianceReport({ budgets, lines, onOpen }: { budgets: Budget[]; lines: BudgetLine[]; onOpen: (id: string) => void }) {
  const t = useT();
  const [budgetFilter, setBudgetFilter] = React.useState("all");
  const [healthFilter, setHealthFilter] = React.useState<"all" | BudgetHealth>("all");
  const nameOf = (id: string) => budgets.find((b) => b.id === id)?.name.replace(" — Project Budget", "") ?? "—";

  const rows = lines
    .filter((l) => budgetFilter === "all" || l.budgetId === budgetFilter)
    .map((l) => ({ l, m: lineMetrics(l) }))
    .filter((x) => healthFilter === "all" || x.m.health === healthFilter)
    .sort((a, b) => b.m.utilization - a.m.utilization);

  return (
    <SpotlightCard className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Select value={budgetFilter} onValueChange={setBudgetFilter}>
          <SelectTrigger size="sm" className="w-64"><SelectValue placeholder={t("dm.all_budgets")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("dm.all_budgets")}</SelectItem>
            {budgets.map((b) => <SelectItem key={b.id} value={b.id}>{nameOf(b.id)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={healthFilter} onValueChange={(v) => setHealthFilter(v as typeof healthFilter)}>
          <SelectTrigger size="sm" className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("dm.any_status")}</SelectItem>
            <SelectItem value="over">{t("dm.over_budget")}</SelectItem>
            <SelectItem value="watch">{t("dm.watch")}</SelectItem>
            <SelectItem value="ok">{t("dm.on_track")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="ms-auto text-xs text-muted-foreground">{rows.length} lines · sorted by utilization</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-start">
              <th className="pb-2.5">{t("audit.entity.budgets")}</th>
              <th className="pb-2.5">{t("bud.line.categoryAria")}</th>
              <th className="pb-2.5 text-end">{t("audit.entity.budgets")}</th>
              <th className="pb-2.5 text-end">{t("dm.used")}</th>
              <th className="pb-2.5 text-end">{t("status.available")}</th>
              <th className="w-40 pb-2.5">{t("dm.utilization")}</th>
              <th className="pb-2.5">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ l, m }, i) => (
              <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.02 }}
                className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-secondary/40" onClick={() => onOpen(l.budgetId)}>
                <td className="py-2.5 text-muted-foreground">{nameOf(l.budgetId)}</td>
                <td className="py-2.5 font-medium">{l.category}</td>
                <td className="py-2.5 text-end tabular-nums">{formatPkr(m.budget, { compact: true })}</td>
                <td className="py-2.5 text-end tabular-nums">{formatPkr(m.used, { compact: true })}</td>
                <td className={cn("py-2.5 text-end font-medium tabular-nums", m.available < 0 && "text-destructive")}>{formatPkr(m.available, { compact: true })}</td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <UtilizationBar budget={m.budget} actual={m.actual} committed={m.committed} height="h-1.5" className="flex-1" />
                    <span className="w-9 text-end text-xs tabular-nums text-muted-foreground">{Math.round(m.utilization * 100)}%</span>
                  </div>
                </td>
                <td className="py-2.5"><HealthChip health={m.health} /></td>
              </motion.tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">{t("dm.no_lines_match_these_filters")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </SpotlightCard>
  );
}

export default function Page() {
  const { live } = useCompany();
  return live ? <LiveBudgets /> : <DemoBudgetsPage />;
}
