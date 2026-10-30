"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PartySelect } from "@/components/live/party-select";
import { useCompany } from "@/lib/providers/company-provider";
import { balanceSheet, incomeStatement, partyStatement, trialBalance, num } from "@/lib/api/finance";
import { fiscalYearOf, todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { ExportButton } from "@/components/live/export-button";
import { PrintLink } from "@/components/live/print-button";
import { useT } from "@/lib/i18n/provider";

function Range({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Input type="date" className="w-40" value={from} onChange={(e) => onFrom(e.target.value)} aria-label={t("acc.ledger.from")} />
      <span className="text-muted-foreground">{t("acc.ledger.toWord")}</span>
      <Input type="date" className="w-40" value={to} onChange={(e) => onTo(e.target.value)} aria-label={t("acc.ledger.to")} />
    </div>
  );
}

const money = (n: number) => (n ? formatMoney(n) : "");
const Loading = () => <Skeleton className="h-72 w-full rounded-xl" />;

function TrialBalanceTab({ from, to }: { from: string; to: string }) {
  const tr = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "tb", from, to], queryFn: () => trialBalance(company.id, from, to), enabled: !!from && !!to });
  if (q.isLoading || !q.data) return <Loading />;
  const rows = q.data.rows.filter((r) => !r.isGroup && (r.opening || r.debit || r.credit || r.closing));
  const t = q.data.totals;
  return (
    <Card className="p-4">
      <div className="mb-3 flex justify-end"><ExportButton name="trial-balance" headers={[tr("acc.col.code"), tr("vch.d.colAccount"), tr("rep.col.opening"), tr("vch.d.colDebit"), tr("vch.d.colCredit"), tr("rep.col.closing")]} rows={rows.map((r) => [r.code, r.name, r.opening, r.debit, r.credit, r.closing])} /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
              <th className="pb-2 font-medium">{tr("acc.col.code")}</th>
              <th className="pb-2 font-medium">{tr("vch.d.colAccount")}</th>
              <th className="pb-2 pe-3 text-end font-medium">{tr("rep.col.opening")}</th>
              <th className="pb-2 pe-3 text-end font-medium">{tr("vch.d.colDebit")}</th>
              <th className="pb-2 pe-3 text-end font-medium">{tr("vch.d.colCredit")}</th>
              <th className="pb-2 pe-3 text-end font-medium">{tr("rep.col.closing")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40">
                <td className="py-2 font-mono text-xs text-muted-foreground">{r.code}</td>
                <td className="py-2">{r.name}</td>
                <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{money(r.opening)}</td>
                <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{money(r.debit)}</td>
                <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{money(r.credit)}</td>
                <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums font-medium">{money(r.closing)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="pt-3" colSpan={3}>{tr("rep.totals")}</td>
              <td className="whitespace-nowrap pt-3 pe-3 text-end font-mono tabular-nums">{formatMoney(t.debit)}</td>
              <td className="whitespace-nowrap pt-3 pe-3 text-end font-mono tabular-nums">{formatMoney(t.credit)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{tr("rep.tb.empty")}</p>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{Math.abs(t.debit - t.credit) < 0.005 ? tr("rep.tb.equal") : tr("rep.tb.differ")}</p>
    </Card>
  );
}

function Statement({ title, totalLabel, items, total }: { title: string; totalLabel: string; items: { code: string; name: string; level: number; amount: number; isGroup?: boolean }[]; total: number }) {
  return (
    <div>
      <h4 className="mb-1 font-heading text-sm font-semibold">{title}</h4>
      {items.filter((i) => i.amount !== 0).map((i) => (
        <div key={i.code} className={`flex justify-between gap-3 py-1 text-sm ${i.isGroup ? "font-medium" : "text-muted-foreground"}`} style={{ paddingLeft: Math.max(0, i.level - 1) * 14 }}>
          <span>{i.name}</span>
          <span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(i.amount)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-border/70 pt-1.5 text-sm font-semibold">
        <span>{totalLabel}</span>
        <span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(total)}</span>
      </div>
    </div>
  );
}

function IncomeTab({ from, to }: { from: string; to: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "is", from, to], queryFn: () => incomeStatement(company.id, from, to), enabled: !!from && !!to });
  if (q.isLoading || !q.data) return <Loading />;
  const d = q.data;
  return (
    <Card className="space-y-5 p-5">
      <Statement title={t("rep.income")} totalLabel={t("rep.totalIncome")} items={d.income} total={d.totalIncome} />
      <Statement title={t("rep.expenses")} totalLabel={t("rep.totalExpenses")} items={d.expenses} total={d.totalExpense} />
      <div className={`flex justify-between rounded-lg px-3 py-2.5 font-semibold ${d.netProfit >= 0 ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive"}`}>
        <span>{d.netProfit >= 0 ? t("rep.netProfit") : t("rep.netLoss")}</span>
        <span className="whitespace-nowrap font-mono tabular-nums">{formatMoney(Math.abs(d.netProfit))}</span>
      </div>
    </Card>
  );
}

function BalanceSheetTab({ asOf }: { asOf: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "bs", asOf], queryFn: () => balanceSheet(company.id, asOf), enabled: !!asOf });
  if (q.isLoading || !q.data) return <Loading />;
  const d = q.data;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <Statement title={t("rep.assets")} totalLabel={t("rep.totalAssets")} items={d.assets} total={d.totalAssets} />
      </Card>
      <Card className="space-y-5 p-5">
        <Statement title={t("rep.liabilities")} totalLabel={t("rep.totalLiabilities")} items={d.liabilities} total={d.totalLiabilities} />
        <Statement title={t("rep.equity")} totalLabel={t("rep.totalEquity")} items={[...d.equity, { code: "profit", name: t("rep.profitToDate"), level: 1, amount: d.profitToDate }]} total={d.totalEquity} />
        <Badge variant="outline" className={d.balanced ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive"}>{d.balanced ? t("rep.balances") : t("rep.notBalance")}</Badge>
      </Card>
    </div>
  );
}

function PartyTab({ from, to }: { from: string; to: string }) {
  const t = useT();
  const { company } = useCompany();
  const [partyId, setPartyId] = React.useState<string | null>(null);
  const q = useQuery({ queryKey: ["live", "party-stmt", partyId, from, to], queryFn: () => partyStatement(company.id, partyId!, from, to), enabled: !!partyId });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><div className="w-full max-w-sm"><PartySelect value={partyId} onChange={(id) => setPartyId(id)} placeholder={t("rep.party.choose")} /></div>{partyId && <PrintLink kind="statement" id={partyId} label={t("rep.party.print")} size="default" />}{q.data && <ExportButton name="statement" headers={[t("common.date"), t("acc.ledger.colEntry"), t("vch.d.colAccount"), t("vch.d.colDebit"), t("vch.d.colCredit"), t("acc.col.balance")]} rows={q.data.lines.map((l) => [l.date, l.number, l.accountName, num(l.debit), num(l.credit), num(l.balance)])} />}</div>
      {!partyId ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">{t("rep.party.chooseHint")}</Card>
      ) : q.isLoading || !q.data ? (
        <Loading />
      ) : (
        <Card className="p-4">
          <p className="mb-2 text-sm">{t("rep.party.opening", { amount: formatMoney(num(q.data.openingBalance)) })}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("acc.ledger.colEntry")}</th>
                  <th className="pb-2 pe-3 text-end font-medium">{t("vch.d.colDebit")}</th>
                  <th className="pb-2 pe-3 text-end font-medium">{t("vch.d.colCredit")}</th>
                  <th className="pb-2 pe-3 text-end font-medium">{t("acc.col.balance")}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.lines.map((l, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="whitespace-nowrap py-2 text-muted-foreground">{formatDate(l.date)}</td>
                    <td className="py-2"><span className="font-mono text-xs">{l.number}</span> <span className="text-muted-foreground">{l.accountName}</span></td>
                    <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{money(num(l.debit))}</td>
                    <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{money(num(l.credit))}</td>
                    <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums font-medium">{formatMoney(num(l.balance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {q.data.lines.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("rep.party.empty")}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

export function LiveReports() {
  const t = useT();
  const fy = fiscalYearOf(todayIso());
  const [from, setFrom] = React.useState(fy.from);
  const [to, setTo] = React.useState(fy.to);
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={FileText}
        eyebrow={t("nav.section.finance")}
        title={t("rep.title")}
        description={t("rep.description", { year: fy.name })}
        actions={<Button variant="outline" className="gap-1.5" onClick={() => window.print()}><Printer className="size-4" /> {t("common.print")}</Button>}
      />
      <Range from={from} to={to} onFrom={setFrom} onTo={setTo} />
      <Tabs defaultValue="tb">
        <TabsList className="flex-wrap">
          <TabsTrigger value="tb">{t("rep.tab.tb")}</TabsTrigger>
          <TabsTrigger value="is">{t("rep.tab.is")}</TabsTrigger>
          <TabsTrigger value="bs">{t("rep.tab.bs")}</TabsTrigger>
          <TabsTrigger value="party">{t("rep.tab.party")}</TabsTrigger>
        </TabsList>
        <TabsContent value="tb" className="mt-4"><TrialBalanceTab from={from} to={to} /></TabsContent>
        <TabsContent value="is" className="mt-4"><IncomeTab from={from} to={to} /></TabsContent>
        <TabsContent value="bs" className="mt-4"><BalanceSheetTab asOf={to} /></TabsContent>
        <TabsContent value="party" className="mt-4"><PartyTab from={from} to={to} /></TabsContent>
      </Tabs>
    </div>
  );
}
