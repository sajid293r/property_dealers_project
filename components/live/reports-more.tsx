"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "@/components/live/export-button";
import { useCompany } from "@/lib/providers/company-provider";
import { agingReport, cashFlowReport, collectionsReport, listExpenses, num, payablesReport, salesSummaryReport } from "@/lib/api/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { tOr } from "@/lib/i18n/runtime";
import { useLanguage, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const Loading = () => <Skeleton className="h-72 w-full rounded-xl" />;
const money = (v: string | number | null | undefined) => formatMoney(num(v));

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 whitespace-nowrap font-heading text-xl font-semibold tabular-nums", tone)}>{value}</p>
    </Card>
  );
}

function Bar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className="h-1.5 w-full min-w-16 rounded-full bg-secondary">
      <div className={cn("h-full rounded-full bg-primary", className)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

const Th = ({ children, end }: { children?: React.ReactNode; end?: boolean }) => <th className={cn("pb-2 font-medium", end ? "pe-3 text-end" : "pe-3")}>{children}</th>;
const Td = ({ children, end, className }: { children?: React.ReactNode; end?: boolean; className?: string }) => (
  <td className={cn("py-2 pe-3", end && "whitespace-nowrap text-end font-mono tabular-nums", className)}>{children}</td>
);
function Table({ head, children, minWidth = 560 }: { head: React.ReactNode; children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead><tr className="border-b border-border/70 text-start text-xs text-muted-foreground">{head}</tr></thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border/40">{children}</tbody>
      </table>
    </div>
  );
}
const Empty = ({ text }: { text: string }) => <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;

/** "2026-10" → "Oct 2026", in the language on screen with Western digits. */
function useMonthLabel() {
  const { lang } = useLanguage();
  return React.useCallback(
    (m: string) => {
      try {
        return new Intl.DateTimeFormat(`${lang}-u-nu-latn`, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
      } catch {
        return m;
      }
    },
    [lang],
  );
}

// ───────────────────────────────────────────── expenses
export function ExpenseTab({ from, to }: { from: string; to: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "rep-expenses", from, to], queryFn: () => listExpenses(company.id, { from, to }), enabled: !!from && !!to });
  if (q.isLoading || !q.data) return <Loading />;
  const d = q.data;
  const total = num(d.total);
  const top = d.byAccount[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("rep.totalExpenses")} value={money(total)} />
        <Stat label={t("rep.exp.accounts")} value={String(d.byAccount.length)} />
        <Stat label={t("rep.exp.largest")} value={top ? top.accountName : "—"} />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-heading text-sm font-semibold">{t("rep.exp.byAccount")}</h3>
          <ExportButton name="expenses" headers={[t("common.date"), t("acc.ledger.colEntry"), t("vch.d.colAccount"), t("rep.exp.paidTo"), t("common.description"), t("common.amount")]} rows={d.rows.map((r) => [r.date, r.number, r.accountName, r.partyName ?? "", r.description ?? "", num(r.amount)])} />
        </div>
        {d.byAccount.length === 0 ? <Empty text={t("rep.empty")} /> : (
          <Table minWidth={520} head={<><Th>{t("vch.d.colAccount")}</Th><Th end>{t("common.amount")}</Th><Th>{t("rep.share")}</Th></>}>
            {d.byAccount.map((a) => (
              <tr key={a.accountId}>
                <Td><span className="me-2 font-mono text-xs text-muted-foreground">{a.accountCode}</span>{a.accountName}</Td>
                <Td end>{money(a.amount)}</Td>
                <Td className="w-[32%]"><div className="flex items-center gap-2"><Bar pct={total ? (num(a.amount) / total) * 100 : 0} /><span className="w-10 text-end text-xs text-muted-foreground tabular-nums">{total ? Math.round((num(a.amount) / total) * 100) : 0}%</span></div></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {d.rows.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 font-heading text-sm font-semibold">{t("rep.exp.latest")}</h3>
          <Table minWidth={640} head={<><Th>{t("common.date")}</Th><Th>{t("acc.ledger.colEntry")}</Th><Th>{t("vch.d.colAccount")}</Th><Th>{t("rep.exp.paidTo")}</Th><Th end>{t("common.amount")}</Th></>}>
            {d.rows.slice(0, 15).map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{formatDate(r.date)}</Td>
                <Td className="font-mono text-xs">{r.number}</Td>
                <Td>{r.accountName}</Td>
                <Td className="text-muted-foreground">{r.partyName ?? "—"}</Td>
                <Td end>{money(r.amount)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── cash flow
export function CashFlowTab({ from, to }: { from: string; to: string }) {
  const t = useT();
  const monthLabel = useMonthLabel();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "rep-cash", from, to], queryFn: () => cashFlowReport(company.id, from, to), enabled: !!from && !!to });
  if (q.isLoading || !q.data) return <Loading />;
  const d = q.data;
  const inflow = d.months.reduce((s, m) => s + num(m.inflow), 0);
  const outflow = d.months.reduce((s, m) => s + num(m.outflow), 0);
  const opening = num(d.opening);
  const biggest = Math.max(1, ...d.months.flatMap((m) => [num(m.inflow), num(m.outflow)]));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("rep.cash.opening")} value={money(opening)} />
        <Stat label={t("rep.cash.in")} value={money(inflow)} tone="text-success" />
        <Stat label={t("rep.cash.out")} value={money(outflow)} tone="text-destructive" />
        <Stat label={t("rep.cash.closing")} value={money(opening + inflow - outflow)} />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-heading text-sm font-semibold">{t("rep.byMonth")}</h3>
          <ExportButton name="cash-flow" headers={[t("rep.month"), t("rep.cash.in"), t("rep.cash.out"), t("rep.cash.net")]} rows={d.months.map((m) => [m.month, num(m.inflow), num(m.outflow), num(m.inflow) - num(m.outflow)])} />
        </div>
        {d.months.length === 0 ? <Empty text={t("rep.empty")} /> : (
          <Table minWidth={620} head={<><Th>{t("rep.month")}</Th><Th end>{t("rep.cash.in")}</Th><Th end>{t("rep.cash.out")}</Th><Th end>{t("rep.cash.net")}</Th><Th /></>}>
            {d.months.map((m) => {
              const net = num(m.inflow) - num(m.outflow);
              return (
                <tr key={m.month}>
                  <Td>{monthLabel(m.month)}</Td>
                  <Td end>{money(m.inflow)}</Td>
                  <Td end>{money(m.outflow)}</Td>
                  <Td end className={cn("font-medium", net < 0 ? "text-destructive" : "text-success")}>{money(net)}</Td>
                  <Td className="w-[22%]"><div className="space-y-1"><Bar pct={(num(m.inflow) / biggest) * 100} className="bg-success" /><Bar pct={(num(m.outflow) / biggest) * 100} className="bg-destructive" /></div></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      {d.sources.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 font-heading text-sm font-semibold">{t("rep.cash.bySource")}</h3>
          <Table minWidth={480} head={<><Th>{t("rep.cash.source")}</Th><Th end>{t("rep.cash.in")}</Th><Th end>{t("rep.cash.out")}</Th></>}>
            {d.sources.map((s) => (
              <tr key={s.source}>
                <Td>{tOr(t, `rep.src.${s.source}`, s.source)}</Td>
                <Td end>{num(s.inflow) ? money(s.inflow) : ""}</Td>
                <Td end>{num(s.outflow) ? money(s.outflow) : ""}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── receivables aging
export function AgingTab() {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "rep-aging"], queryFn: () => agingReport(company.id) });
  if (q.isLoading || !q.data) return <Loading />;
  const rows = q.data.rows;
  const sum = (k: "notDue" | "d30" | "d60" | "d90" | "d90plus" | "total") => rows.reduce((s, r) => s + num(r[k]), 0);
  const overdue = sum("d30") + sum("d60") + sum("d90") + sum("d90plus");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("rep.age.totalOwed")} value={money(sum("total"))} />
        <Stat label={t("rep.age.overdue")} value={money(overdue)} tone={overdue > 0 ? "text-warning" : undefined} />
        <Stat label={t("rep.age.over90")} value={money(sum("d90plus"))} tone={sum("d90plus") > 0 ? "text-destructive" : undefined} />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("rep.age.hint")}</p>
          <ExportButton name="receivables-aging" headers={[t("rep.age.customer"), t("rep.age.notDue"), t("rep.age.d30"), t("rep.age.d60"), t("rep.age.d90"), t("rep.age.d90plus"), t("rep.age.total")]} rows={rows.map((r) => [r.customerName, num(r.notDue), num(r.d30), num(r.d60), num(r.d90), num(r.d90plus), num(r.total)])} />
        </div>
        {rows.length === 0 ? <Empty text={t("rep.age.empty")} /> : (
          <Table minWidth={820} head={<><Th>{t("rep.age.customer")}</Th><Th end>{t("rep.age.notDue")}</Th><Th end>{t("rep.age.d30")}</Th><Th end>{t("rep.age.d60")}</Th><Th end>{t("rep.age.d90")}</Th><Th end>{t("rep.age.d90plus")}</Th><Th end>{t("rep.age.total")}</Th></>}>
            {rows.map((r) => (
              <tr key={r.partyId}>
                <Td>{r.customerName}</Td>
                <Td end>{num(r.notDue) ? money(r.notDue) : ""}</Td>
                <Td end>{num(r.d30) ? money(r.d30) : ""}</Td>
                <Td end className="text-warning">{num(r.d60) ? money(r.d60) : ""}</Td>
                <Td end className="text-warning">{num(r.d90) ? money(r.d90) : ""}</Td>
                <Td end className="text-destructive">{num(r.d90plus) ? money(r.d90plus) : ""}</Td>
                <Td end className="font-medium">{money(r.total)}</Td>
              </tr>
            ))}
            <tr className="font-semibold">
              <Td>{t("rep.totals")}</Td>
              <Td end>{money(sum("notDue"))}</Td><Td end>{money(sum("d30"))}</Td><Td end>{money(sum("d60"))}</Td><Td end>{money(sum("d90"))}</Td><Td end>{money(sum("d90plus"))}</Td><Td end>{money(sum("total"))}</Td>
            </tr>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────── sales by project
export function SalesTab() {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "rep-sales"], queryFn: () => salesSummaryReport(company.id) });
  if (q.isLoading || !q.data) return <Loading />;
  const rows = q.data.rows;
  const sum = (k: "bookedValue" | "received" | "outstanding" | "availableValue") => rows.reduce((s, r) => s + num(r[k]), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("rep.sales.bookedValue")} value={money(sum("bookedValue"))} />
        <Stat label={t("rep.sales.received")} value={money(sum("received"))} tone="text-success" />
        <Stat label={t("rep.sales.outstanding")} value={money(sum("outstanding"))} tone="text-warning" />
        <Stat label={t("rep.sales.availableValue")} value={money(sum("availableValue"))} />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex justify-end">
          <ExportButton name="sales-by-project" headers={[t("rep.sales.project"), t("rep.sales.properties"), t("rep.sales.booked"), t("rep.sales.available"), t("rep.sales.bookedValue"), t("rep.sales.received"), t("rep.sales.outstanding"), t("rep.sales.availableValue")]} rows={rows.map((r) => [r.name, r.properties, r.booked, r.available, num(r.bookedValue), num(r.received), num(r.outstanding), num(r.availableValue)])} />
        </div>
        {rows.length === 0 ? <Empty text={t("rep.empty")} /> : (
          <Table minWidth={900} head={<><Th>{t("rep.sales.project")}</Th><Th end>{t("rep.sales.properties")}</Th><Th end>{t("rep.sales.booked")}</Th><Th end>{t("rep.sales.available")}</Th><Th end>{t("rep.sales.bookedValue")}</Th><Th end>{t("rep.sales.received")}</Th><Th end>{t("rep.sales.outstanding")}</Th><Th>{t("rep.sales.collected")}</Th></>}>
            {rows.map((r) => {
              const pct = num(r.received) + num(r.outstanding) > 0 ? (num(r.received) / (num(r.received) + num(r.outstanding))) * 100 : 0;
              return (
                <tr key={r.projectId}>
                  <Td><span className="me-2 font-mono text-xs text-muted-foreground">{r.code}</span>{r.name}</Td>
                  <Td end>{r.properties}</Td>
                  <Td end>{r.booked}</Td>
                  <Td end>{r.available}</Td>
                  <Td end>{money(r.bookedValue)}</Td>
                  <Td end>{money(r.received)}</Td>
                  <Td end>{money(r.outstanding)}</Td>
                  <Td className="w-[14%]"><div className="flex items-center gap-2"><Bar pct={pct} className="bg-success" /><span className="w-9 text-end text-xs text-muted-foreground tabular-nums">{Math.round(pct)}%</span></div></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────── collections
export function CollectionsTab({ from, to }: { from: string; to: string }) {
  const t = useT();
  const monthLabel = useMonthLabel();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "rep-collections", from, to], queryFn: () => collectionsReport(company.id, from, to), enabled: !!from && !!to });
  if (q.isLoading || !q.data) return <Loading />;
  const d = q.data;
  const total = d.months.reduce((s, m) => s + num(m.amount), 0);
  const count = d.months.reduce((s, m) => s + m.count, 0);
  const biggest = Math.max(1, ...d.months.map((m) => num(m.amount)));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("rep.coll.total")} value={money(total)} tone="text-success" />
        <Stat label={t("rep.coll.receipts")} value={String(count)} />
        <Stat label={t("rep.coll.average")} value={money(count ? total / count : 0)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-heading text-sm font-semibold">{t("rep.byMonth")}</h3>
            <ExportButton name="collections" headers={[t("rep.month"), t("rep.coll.receipts"), t("common.amount")]} rows={d.months.map((m) => [m.month, m.count, num(m.amount)])} />
          </div>
          {d.months.length === 0 ? <Empty text={t("rep.empty")} /> : (
            <Table minWidth={380} head={<><Th>{t("rep.month")}</Th><Th end>{t("rep.coll.receipts")}</Th><Th end>{t("common.amount")}</Th><Th /></>}>
              {d.months.map((m) => (
                <tr key={m.month}>
                  <Td>{monthLabel(m.month)}</Td>
                  <Td end>{m.count}</Td>
                  <Td end>{money(m.amount)}</Td>
                  <Td className="w-[20%]"><Bar pct={(num(m.amount) / biggest) * 100} className="bg-success" /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 font-heading text-sm font-semibold">{t("rep.coll.byMethod")}</h3>
          {d.methods.length === 0 ? <Empty text={t("rep.empty")} /> : (
            <Table minWidth={340} head={<><Th>{t("rep.coll.method")}</Th><Th end>{t("rep.coll.receipts")}</Th><Th end>{t("common.amount")}</Th><Th>{t("rep.share")}</Th></>}>
              {d.methods.map((m) => (
                <tr key={m.method}>
                  <Td>{tOr(t, `deals.method.${m.method}`, m.method)}</Td>
                  <Td end>{m.count}</Td>
                  <Td end>{money(m.amount)}</Td>
                  <Td className="w-[22%]"><Bar pct={total ? (num(m.amount) / total) * 100 : 0} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      {d.topCustomers.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 font-heading text-sm font-semibold">{t("rep.coll.top")}</h3>
          <Table minWidth={420} head={<><Th>{t("rep.age.customer")}</Th><Th end>{t("rep.coll.receipts")}</Th><Th end>{t("common.amount")}</Th></>}>
            {d.topCustomers.map((c) => (
              <tr key={c.partyId}><Td>{c.customerName}</Td><Td end>{c.count}</Td><Td end>{money(c.amount)}</Td></tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── supplier payables
export function PayablesTab({ asOf }: { asOf: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "rep-payables", asOf], queryFn: () => payablesReport(company.id, asOf), enabled: !!asOf });
  if (q.isLoading || !q.data) return <Loading />;
  const rows = q.data.rows;
  const total = rows.reduce((s, r) => s + num(r.balance), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label={t("rep.pay.total")} value={money(total)} tone={total > 0 ? "text-warning" : undefined} />
        <Stat label={t("rep.pay.count")} value={String(rows.length)} />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("rep.pay.hint", { date: formatDate(asOf) })}</p>
          <ExportButton name="payables" headers={[t("rep.pay.supplier"), t("rep.pay.billed"), t("rep.pay.paid"), t("rep.pay.balance"), t("rep.pay.last")]} rows={rows.map((r) => [r.name, num(r.billed), num(r.paid), num(r.balance), r.lastActivity ?? ""])} />
        </div>
        {rows.length === 0 ? <Empty text={t("rep.pay.empty")} /> : (
          <Table minWidth={720} head={<><Th>{t("rep.pay.supplier")}</Th><Th end>{t("rep.pay.billed")}</Th><Th end>{t("rep.pay.paid")}</Th><Th end>{t("rep.pay.balance")}</Th><Th>{t("rep.pay.last")}</Th></>}>
            {rows.map((r) => (
              <tr key={r.partyId}>
                <Td>
                  {r.name}
                  {r.roles && <span className="ms-2 text-xs text-muted-foreground">{r.roles.split(", ").map((x) => tOr(t, `rep.role.${x}`, x)).join(", ")}</span>}
                </Td>
                <Td end>{money(r.billed)}</Td>
                <Td end>{money(r.paid)}</Td>
                <Td end className="font-medium">{money(r.balance)}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">{r.lastActivity ? formatDate(r.lastActivity) : "—"}</Td>
              </tr>
            ))}
            <tr className="font-semibold"><Td>{t("rep.totals")}</Td><Td /><Td /><Td end>{money(total)}</Td><Td /></tr>
          </Table>
        )}
      </Card>
    </div>
  );
}
