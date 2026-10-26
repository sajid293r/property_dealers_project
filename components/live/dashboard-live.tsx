"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Banknote, Building2, CalendarClock, CalendarCheck, CheckCircle2, FolderPlus, HandCoins, Handshake, Landmark, Scale, ScrollText, TrendingDown, TrendingUp, Users2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/live/stat-tile";
import { useCompany } from "@/lib/providers/company-provider";
import { fetchDashboard, type DashboardData } from "@/lib/api/sales";
import { num } from "@/lib/api/finance";
import { formatAxis, formatDate, formatMoney, formatMonthShort } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const STATUS_BAR: Record<string, string> = { available: "bg-success", reserved: "bg-gold", sold: "bg-primary", blocked: "bg-muted-foreground", rented: "bg-primary/60", cancelled: "bg-destructive/60" };
const monthName = (ym: string) => formatMonthShort(ym);

function Section({ title, link, children, className }: { title: string; link?: { href: string; label: string }; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        {link && <Link href={link.href} className="text-xs font-medium text-primary hover:underline">{link.label} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span></Link>}
      </div>
      {children}
    </Card>
  );
}

function GettingStarted({ name }: { name: string }) {
  const t = useT();
  const steps = [
    { icon: FolderPlus, title: t("dashboard.start.project.title"), text: t("dashboard.start.project.text"), href: "/dashboard/projects" },
    { icon: Building2, title: t("dashboard.start.properties.title"), text: t("dashboard.start.properties.text"), href: "/dashboard/properties" },
    { icon: Landmark, title: t("dashboard.start.bank.title"), text: t("dashboard.start.bank.text"), href: "/dashboard/accounts" },
    { icon: Users2, title: t("dashboard.start.customers.title"), text: t("dashboard.start.customers.text"), href: "/dashboard/customers" },
    { icon: Handshake, title: t("dashboard.start.booking.title"), text: t("dashboard.start.booking.text"), href: "/dashboard/deals" },
    { icon: CalendarCheck, title: t("dashboard.start.payment.title"), text: t("dashboard.start.payment.text"), href: "/dashboard/deals" },
  ];
  return (
    <Card className="p-6">
      <h2 className="font-heading text-xl font-semibold">{t("dashboard.start.welcome", { name })}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.start.emptyLive")}</p>
      <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((s, i) => (
          <motion.li key={s.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Link href={s.href} className="group flex items-center gap-3 rounded-xl border border-border/70 p-4 transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-md">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:-rotate-6 group-hover:scale-110"><s.icon className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold"><span className="text-muted-foreground">{i + 1}.</span> {s.title}</span>
                <span className="block text-xs text-muted-foreground">{s.text}</span>
              </span>
              <CheckCircle2 className="size-5 shrink-0 text-border" />
            </Link>
          </motion.li>
        ))}
      </ol>
    </Card>
  );
}

export function LiveDashboard() {
  const { company } = useCompany();
  const t = useT();
  const statusLabel = (st: string) => t(`status.${st}`);
  const q = useQuery({ queryKey: ["live", "dashboard"], queryFn: () => fetchDashboard(company.id), staleTime: 20_000 });
  const d: DashboardData | undefined = q.data;

  if (q.isLoading || !d) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-5">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const totalProps = (d.inventory?.byStatus ?? []).reduce((s, r) => s + r.n, 0);
  const empty = totalProps === 0 && (d.sales?.activeBookings ?? 0) === 0 && num(d.finance?.inBanks) === 0 && num(d.finance?.cashInHand) === 0;
  const s = d.sales;
  const f = d.finance;
  const growth = s ? num(s.collections.thisMonth) - num(s.collections.lastMonth) : 0;
  const chart = (s?.collectionsByMonth ?? []).map((m) => ({ month: monthName(m.month), amount: num(m.amount) }));
  const attention: { icon: typeof AlertTriangle; text: string; href: string; tone: "warning" | "primary" }[] = [];
  if (s && num(s.overdueAmount) > 0) attention.push({ icon: AlertTriangle, text: t("dashboard.live.overdueAcross", { amount: formatMoney(num(s.overdueAmount), { compact: true }), count: s.overdueBookings }), href: "/dashboard/deals", tone: "warning" });
  if (f && f.vouchersPending > 0) attention.push({ icon: ScrollText, text: t("dashboard.live.vouchersWaiting", { count: f.vouchersPending }), href: "/dashboard/vouchers", tone: "primary" });
  if (f && f.bankAccountsToReconcile > 0) attention.push({ icon: Scale, text: t("dashboard.live.reconcile", { count: f.bankAccountsToReconcile }), href: "/dashboard/bank-reconciliation", tone: "primary" });
  if (s && s.pendingBookings > 0) attention.push({ icon: Handshake, text: t("dashboard.live.bookingsToConfirm", { count: s.pendingBookings }), href: "/dashboard/deals", tone: "primary" });

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader icon={Building2} eyebrow={t("dashboard.eyebrow")} title={company.name} description={t("dashboard.live.description")} />

      {empty ? (
        <GettingStarted name={company.name} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {s && <StatTile icon={HandCoins} label={t("dashboard.live.collectedMonth")} value={formatMoney(num(s.collections.thisMonth), { compact: true })} accent="success" />}
            {s && <StatTile icon={AlertTriangle} label={t("dashboard.live.overdueInstallments")} value={formatMoney(num(s.overdueAmount), { compact: true })} accent={num(s.overdueAmount) > 0 ? "warning" : "muted"} />}
            {s && <StatTile icon={CalendarClock} label={t("dashboard.live.dueNext30")} value={formatMoney(num(s.dueNext30), { compact: true })} accent="gold" />}
            {f && <StatTile icon={Wallet} label={t("dashboard.live.cashBank")} value={formatMoney(num(f.cashInHand) + num(f.inBanks), { compact: true })} />}
          </div>

          {attention.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("dashboard.live.attention")}</p>
              <div className="grid gap-2 md:grid-cols-2">
                {attention.map((a) => (
                  <Link key={a.text} href={a.href} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/50">
                    <a.icon className={cn("size-4 shrink-0", a.tone === "warning" ? "text-warning" : "text-primary")} />
                    <span>{a.text}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {s && (
              <Section title={t("dashboard.live.collections6")} link={{ href: "/dashboard/deals", label: t("dashboard.live.allReceipts") }}>
                <div className="mb-2 flex items-center gap-2 text-sm">
                  {growth >= 0 ? <TrendingUp className="size-4 text-success" /> : <TrendingDown className="size-4 text-destructive" />}
                  <span className="text-muted-foreground">{t(growth >= 0 ? "dashboard.live.upOnLast" : "dashboard.live.downOnLast", { amount: formatMoney(Math.abs(growth), { compact: true }) })}</span>
                </div>
                <div className="h-56">
                  {chart.length === 0 ? (
                    <p className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("dashboard.live.noReceipts")}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                        <YAxis tickLine={false} axisLine={false} fontSize={12} width={54} tickFormatter={(v: number) => formatAxis(v)} />
                        <Tooltip formatter={(v) => formatMoney(Number(v))} cursor={{ fill: "var(--secondary)" }} />
                        <Bar dataKey="amount" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Section>
            )}

            <div className="space-y-5">
              {d.inventory && (
                <Section title={t("dashboard.live.inventory")} link={{ href: "/dashboard/properties", label: t("dashboard.live.properties") }}>
                  <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
                    {d.inventory.byStatus.map((r) => (
                      <div key={r.status} className={STATUS_BAR[r.status] ?? "bg-muted"} style={{ width: `${(r.n / Math.max(totalProps, 1)) * 100}%` }} title={`${statusLabel(r.status)}: ${r.n}`} />
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {d.inventory.byStatus.map((r) => (
                      <li key={r.status} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", STATUS_BAR[r.status] ?? "bg-muted")} />{statusLabel(r.status)}</span>
                        <span className="text-muted-foreground"><span className="font-medium text-foreground">{r.n}</span> · {formatMoney(num(r.value), { compact: true })}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {f && (
                <Section title={t("dashboard.live.money")} link={{ href: "/dashboard/accounts", label: t("dashboard.live.accounts") }}>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Banknote className="size-4" /> {t("dashboard.live.cashInHand")}</span><span className="font-mono tabular-nums">{formatMoney(num(f.cashInHand))}</span></div>
                    <div className="flex justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Landmark className="size-4" /> {t("dashboard.live.inBanks")}</span><span className="font-mono tabular-nums">{formatMoney(num(f.inBanks))}</span></div>
                    <div className="flex justify-between border-t border-border/60 pt-1.5"><span className="text-muted-foreground">{t("dashboard.live.incomeMonth")}</span><span className="font-mono tabular-nums text-success">{formatMoney(num(f.monthIncome))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("dashboard.live.expensesMonth")}</span><span className="font-mono tabular-nums">{formatMoney(num(f.monthExpense))}</span></div>
                  </div>
                </Section>
              )}
            </div>
          </div>

          {s && (
            <div className="grid gap-5 lg:grid-cols-3">
              <Section title={t("dashboard.live.overdue")} link={{ href: "/dashboard/deals", label: t("dashboard.live.bookings") }}>
                {s.overdueList.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.live.nothingOverdue")}</p> : (
                  <ul className="space-y-2">
                    {s.overdueList.map((o) => (
                      <li key={o.bookingId}>
                        <Link href={`/dashboard/deals/${o.bookingId}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/50">
                          <span className="min-w-0"><span className="block truncate font-medium">{o.customerName}</span><span className="block text-xs text-warning">{t("dashboard.live.since", { date: formatDate(o.oldestDue) })}</span></span>
                          <span className="whitespace-nowrap font-mono text-sm tabular-nums">{formatMoney(num(o.amount), { compact: true })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title={t("dashboard.live.comingDue")}>
                {s.upcoming.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.live.noUpcoming")}</p> : (
                  <ul className="space-y-2">
                    {s.upcoming.map((o) => (
                      <li key={`${o.bookingId}-${o.seq}`}>
                        <Link href={`/dashboard/deals/${o.bookingId}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/50">
                          <span className="min-w-0"><span className="block truncate font-medium">{o.customerName}</span><span className="block text-xs text-muted-foreground">{formatDate(o.dueDate)}</span></span>
                          <span className="whitespace-nowrap font-mono text-sm tabular-nums">{formatMoney(num(o.amount), { compact: true })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title={t("dashboard.live.recentReceipts")}>
                {s.recentReceipts.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.live.noReceipts")}</p> : (
                  <ul className="space-y-2">
                    {s.recentReceipts.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
                        <span className="min-w-0"><span className="block truncate font-medium">{r.customerName}</span><span className="block text-xs text-muted-foreground">{r.receiptNo} · {formatDate(r.receivedOn)}</span></span>
                        <span className="whitespace-nowrap font-mono text-sm tabular-nums text-success">{formatMoney(num(r.amount), { compact: true })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
