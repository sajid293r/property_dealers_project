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
import { formatAxis, formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = { available: "Available", reserved: "Reserved", sold: "Sold", blocked: "Blocked", rented: "Rented", cancelled: "Cancelled" };
const STATUS_BAR: Record<string, string> = { available: "bg-success", reserved: "bg-gold", sold: "bg-primary", blocked: "bg-muted-foreground", rented: "bg-primary/60", cancelled: "bg-destructive/60" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

function Section({ title, link, children, className }: { title: string; link?: { href: string; label: string }; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        {link && <Link href={link.href} className="text-xs font-medium text-primary hover:underline">{link.label} →</Link>}
      </div>
      {children}
    </Card>
  );
}

function GettingStarted({ name }: { name: string }) {
  const steps = [
    { icon: FolderPlus, title: "Create your first project", text: "A housing scheme, tower or plot development.", href: "/dashboard/projects" },
    { icon: Building2, title: "Add properties", text: "Plots, houses, apartments or shops with size and price.", href: "/dashboard/properties" },
    { icon: Landmark, title: "Add your bank account", text: "So payments and receipts go to the right place.", href: "/dashboard/accounts" },
    { icon: Users2, title: "Add customers", text: "Buyers, investors and dealers in one address book.", href: "/dashboard/customers" },
    { icon: Handshake, title: "Record a booking", text: "Reserve a property and set its installment plan.", href: "/dashboard/deals" },
    { icon: CalendarCheck, title: "Receive the first payment", text: "It lands in your books and on the customer's plan.", href: "/dashboard/deals" },
  ];
  return (
    <Card className="p-6">
      <h2 className="font-heading text-xl font-semibold">Welcome to {name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">This workspace is empty. Follow these steps and this page fills with your collections, dues and cash position.</p>
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
  if (s && num(s.overdueAmount) > 0) attention.push({ icon: AlertTriangle, text: `${formatMoney(num(s.overdueAmount), { compact: true })} overdue across ${s.overdueBookings} booking${s.overdueBookings === 1 ? "" : "s"}`, href: "/dashboard/deals", tone: "warning" });
  if (f && f.vouchersPending > 0) attention.push({ icon: ScrollText, text: `${f.vouchersPending} voucher${f.vouchersPending === 1 ? "" : "s"} waiting for approval`, href: "/dashboard/vouchers", tone: "primary" });
  if (f && f.bankAccountsToReconcile > 0) attention.push({ icon: Scale, text: `${f.bankAccountsToReconcile} bank account${f.bankAccountsToReconcile === 1 ? " has" : "s have"} entries not yet reconciled`, href: "/dashboard/bank-reconciliation", tone: "primary" });
  if (s && s.pendingBookings > 0) attention.push({ icon: Handshake, text: `${s.pendingBookings} booking${s.pendingBookings === 1 ? "" : "s"} still to be confirmed`, href: "/dashboard/deals", tone: "primary" });

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader icon={Building2} eyebrow="Overview" title={company.name} description="Your sales, collections and cash — straight from your records" />

      {empty ? (
        <GettingStarted name={company.name} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {s && <StatTile icon={HandCoins} label="Collected this month" value={formatMoney(num(s.collections.thisMonth), { compact: true })} accent="success" />}
            {s && <StatTile icon={AlertTriangle} label="Overdue installments" value={formatMoney(num(s.overdueAmount), { compact: true })} accent={num(s.overdueAmount) > 0 ? "warning" : "muted"} />}
            {s && <StatTile icon={CalendarClock} label="Due in the next 30 days" value={formatMoney(num(s.dueNext30), { compact: true })} accent="gold" />}
            {f && <StatTile icon={Wallet} label="Cash & bank" value={formatMoney(num(f.cashInHand) + num(f.inBanks), { compact: true })} />}
          </div>

          {attention.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Needs your attention</p>
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
              <Section title="Collections, last 6 months" link={{ href: "/dashboard/deals", label: "All receipts" }}>
                <div className="mb-2 flex items-center gap-2 text-sm">
                  {growth >= 0 ? <TrendingUp className="size-4 text-success" /> : <TrendingDown className="size-4 text-destructive" />}
                  <span className="text-muted-foreground">{growth >= 0 ? "Up" : "Down"} {formatMoney(Math.abs(growth), { compact: true })} on last month</span>
                </div>
                <div className="h-56">
                  {chart.length === 0 ? (
                    <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No receipts yet.</p>
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
                <Section title="Inventory" link={{ href: "/dashboard/properties", label: "Properties" }}>
                  <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
                    {d.inventory.byStatus.map((r) => (
                      <div key={r.status} className={STATUS_BAR[r.status] ?? "bg-muted"} style={{ width: `${(r.n / Math.max(totalProps, 1)) * 100}%` }} title={`${STATUS_LABEL[r.status] ?? r.status}: ${r.n}`} />
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {d.inventory.byStatus.map((r) => (
                      <li key={r.status} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", STATUS_BAR[r.status] ?? "bg-muted")} />{STATUS_LABEL[r.status] ?? r.status}</span>
                        <span className="text-muted-foreground"><span className="font-medium text-foreground">{r.n}</span> · {formatMoney(num(r.value), { compact: true })}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {f && (
                <Section title="Money position" link={{ href: "/dashboard/accounts", label: "Accounts" }}>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Banknote className="size-4" /> Cash in hand</span><span className="font-mono tabular-nums">{formatMoney(num(f.cashInHand))}</span></div>
                    <div className="flex justify-between"><span className="flex items-center gap-2 text-muted-foreground"><Landmark className="size-4" /> In banks</span><span className="font-mono tabular-nums">{formatMoney(num(f.inBanks))}</span></div>
                    <div className="flex justify-between border-t border-border/60 pt-1.5"><span className="text-muted-foreground">Income this month</span><span className="font-mono tabular-nums text-success">{formatMoney(num(f.monthIncome))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Expenses this month</span><span className="font-mono tabular-nums">{formatMoney(num(f.monthExpense))}</span></div>
                  </div>
                </Section>
              )}
            </div>
          </div>

          {s && (
            <div className="grid gap-5 lg:grid-cols-3">
              <Section title="Overdue" link={{ href: "/dashboard/deals", label: "Bookings" }}>
                {s.overdueList.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nothing overdue. 🎉</p> : (
                  <ul className="space-y-2">
                    {s.overdueList.map((o) => (
                      <li key={o.bookingId}>
                        <Link href={`/dashboard/deals/${o.bookingId}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/50">
                          <span className="min-w-0"><span className="block truncate font-medium">{o.customerName}</span><span className="block text-xs text-warning">since {formatDate(o.oldestDue)}</span></span>
                          <span className="whitespace-nowrap font-mono text-sm tabular-nums">{formatMoney(num(o.amount), { compact: true })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title="Coming due">
                {s.upcoming.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No installments coming up.</p> : (
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
              <Section title="Recent receipts">
                {s.recentReceipts.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No receipts yet.</p> : (
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
