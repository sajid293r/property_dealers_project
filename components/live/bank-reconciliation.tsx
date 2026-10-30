"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileSpreadsheet, Landmark, Lock, Plus, RotateCcw, Scale, Trash2, Unlink, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog, Field } from "@/components/dialogs/form-dialog";
import { AmountInput } from "@/components/live/amount-input";
import { AccountPicker } from "@/components/live/account-picker";
import { StatTile } from "@/components/live/stat-tile";
import { StatementImportDialog } from "@/components/live/statement-import-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useBankAccounts, useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import {
  bankLedger,
  clearLedgerLine,
  deleteReconciliation,
  deleteStatement,
  draftVoucherFromLine,
  finalizeReconciliation,
  getReconciliation,
  getStatement,
  listReconciliations,
  listStatements,
  matchLine,
  num,
  reopenReconciliation,
  startReconciliation,
  statementSuggestions,
  unclearLedgerLine,
  unmatchLine,
  updateReconciliation,
  type LedgerItem,
  type StatementLine,
} from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

function useAction() {
  const t = useT();
  const invalidate = useInvalidateFinance();
  const [busy, setBusy] = React.useState(false);
  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await fn();
      await invalidate();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.thatDidNotWork"));
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

function Row({ label, value, strong, sign }: { label: string; value: number; strong?: boolean; sign?: "+" | "−" | "=" }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "border-t border-border/70 font-semibold" : ""}`}>
      <span className="text-sm text-muted-foreground">
        {sign && <span className="me-1.5 inline-block w-3 text-center font-mono">{sign}</span>}
        {label}
      </span>
      <span className="whitespace-nowrap font-mono text-sm tabular-nums">{formatMoney(value)}</span>
    </div>
  );
}

// ───────────────────────────────────────────── reconcile tab
function ReconcileTab({ bankAccountId, bookBalance }: { bankAccountId: string; bookBalance: number }) {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const { busy, run } = useAction();
  const canStart = can("accounts.create");
  const canEdit = can("accounts.edit");
  const canApprove = can("accounts.approve");

  const history = useQuery({ queryKey: ["live", "recs", bankAccountId], queryFn: () => listReconciliations(company.id, bankAccountId) });
  const statements = useQuery({ queryKey: ["live", "statements", bankAccountId], queryFn: () => listStatements(company.id, bankAccountId) });
  const draft = history.data?.find((r) => r.status === "draft");
  const rec = useQuery({
    queryKey: ["live", "rec", draft?.id],
    queryFn: () => getReconciliation(company.id, draft!.id),
    enabled: !!draft,
  });

  const [asOf, setAsOf] = React.useState(todayIso());
  const [balance, setBalance] = React.useState("");
  const [statementId, setStatementId] = React.useState<string>("none");
  const [editing, setEditing] = React.useState(false);

  if (history.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  if (!draft) {
    const last = history.data?.find((r) => r.status === "finalized");
    return (
      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-heading text-base font-semibold">{t("rec.start.title")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("rec.start.hint")}</p>
          </div>
          <Field label={t("rec.start.date")}><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
          <Field label={t("rec.start.closing")}><AmountInput value={balance} onChange={setBalance} allowNegative /></Field>
          <Field label={t("rec.start.entered")}>
            <Select value={statementId} onValueChange={setStatementId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("common.none")}</SelectItem>
                {(statements.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label || `${formatDate(s.periodFrom)} – ${formatDate(s.periodTo)}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {canStart ? (
            <Button
              disabled={busy || balance === "" || !asOf}
              onClick={() => void run(() => startReconciliation(company.id, bankAccountId, { asOf, statementBalance: balance, statementId: statementId === "none" ? null : statementId }), t("rec.start.started"))}
            >
              {t("rec.start.button")}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t("rec.start.noPermission")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("rec.bookNow")} <span className="font-mono">{formatMoney(bookBalance)}</span></p>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-heading text-base font-semibold">{t("rec.past")}</h3>
          {(history.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("rec.pastEmpty")}</p>
          ) : (
            <div className="space-y-2">
              {(history.data ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{t("rec.asOf", { date: formatDate(r.asOf) })}</p>
                    <p className="text-xs text-muted-foreground">{r.finalizedBy ? t("rec.statementLineBy", { amount: formatMoney(num(r.statementBalance)), name: r.finalizedBy }) : t("rec.statementLine", { amount: formatMoney(num(r.statementBalance)) })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1"><Lock className="size-3" /> {t("rec.finishedBadge")}</Badge>
                    {canApprove && r.id === last?.id && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => reopenReconciliation(company.id, r.id), t("rec.reopened"))}>
                        <RotateCcw className="size-3.5" /> {t("rec.reopen")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  const r = rec.data;
  if (!r) return <Skeleton className="h-64 w-full rounded-xl" />;
  const rep = r.report;
  const diff = num(rep.difference);

  const section = (title: string, items: LedgerItem[]) => (
    <div key={title}>
      <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t("rec.nothingHere")}</p>
      ) : (
        items.map((it) => {
          const amount = num(it.debit) - num(it.credit);
          return (
            <label key={it.journalLineId} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-secondary/40">
              <Checkbox
                checked={it.cleared}
                disabled={busy || !canEdit}
                onCheckedChange={(c) =>
                  void run(() => (c === true ? clearLedgerLine(company.id, it.journalLineId, r.asOf) : unclearLedgerLine(company.id, it.journalLineId)))
                }
              />
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{formatDate(it.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs">{it.number}</span>
                <span className="ms-2 truncate text-sm text-muted-foreground">{[it.partyName, it.description].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={`whitespace-nowrap font-mono text-sm tabular-nums ${amount < 0 ? "text-destructive" : "text-success"}`}>{formatMoney(amount)}</span>
            </label>
          );
        })
      )}
    </div>
  );

  const money = r.items.filter((i) => num(i.debit) > 0);
  const payments = r.items.filter((i) => num(i.credit) > 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-base font-semibold">{t("rec.tick.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("rec.tick.hint", { date: formatDate(r.asOf) })}</p>
          </div>
        </div>
        {section(t("rec.moneyIn"), money)}
        {section(t("rec.moneyOut"), payments)}
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-heading text-base font-semibold">{t("rec.summary")}</h3>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{t("rec.change")}</Button>
            )}
          </div>
          <Row label={t("rec.row.statement")} value={num(rep.statementBalance)} />
          <Row label={t("rec.row.deposits")} value={num(rep.depositsInTransit)} sign="+" />
          <Row label={t("rec.row.cheques")} value={num(rep.outstandingPayments)} sign="−" />
          <Row label={t("rec.row.adjusted")} value={num(rep.adjustedBankBalance)} sign="=" strong />
          <Row label={t("rec.row.books")} value={num(rep.bookBalance)} />
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${Math.abs(diff) < 0.005 ? "bg-success/12 text-success" : "bg-warning/12 text-warning"}`}>
            {Math.abs(diff) < 0.005 ? t("rec.balanced") : t("rec.difference", { amount: formatMoney(Math.abs(diff)) })}
          </div>
          {Math.abs(diff) >= 0.005 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("rec.differenceHint")}
            </p>
          )}
          {(canEdit || canApprove) && (
            <div className="mt-4 flex gap-2">
              <Button className="flex-1 gap-1.5" disabled={busy || !canApprove || !r.canFinish} onClick={() => void run(() => finalizeReconciliation(company.id, r.id), t("rec.finished"))}>
                <CheckCircle2 className="size-4" /> {t("rec.finish")}
              </Button>
              <Button variant="outline" size="icon" disabled={busy} aria-label={t("rec.cancelAria")} onClick={() => void run(() => deleteReconciliation(company.id, r.id), t("rec.cancelled"))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          )}
        </Card>
      </div>

      <FormDialog
        open={editing}
        onOpenChange={setEditing}
        icon={Scale}
        title={t("rec.edit.title")}
        description={t("rec.edit.description")}
        submitLabel={t("common.save")}
        onSubmit={async () => {
          await updateReconciliation(company.id, r.id, { asOf: asOf || r.asOf, ...(balance !== "" ? { statementBalance: balance } : {}) });
          await run(async () => undefined, t("rec.edit.updated"));
        }}
      >
        <Field label={t("rec.start.date")}><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
        <Field label={t("rec.edit.closingNow", { amount: formatMoney(num(r.statementBalance)) })}><AmountInput value={balance} onChange={setBalance} allowNegative /></Field>
      </FormDialog>
    </div>
  );
}

// ───────────────────────────────────────────── statements tab
function StatementsTab({ bankAccountId }: { bankAccountId: string }) {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const { busy, run } = useAction();
  const [importing, setImporting] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [draftFor, setDraftFor] = React.useState<StatementLine | null>(null);
  const [accountId, setAccountId] = React.useState<string | null>(null);

  const list = useQuery({ queryKey: ["live", "statements", bankAccountId], queryFn: () => listStatements(company.id, bankAccountId) });
  const activeId = selected ?? list.data?.[0]?.id ?? null;
  const detail = useQuery({ queryKey: ["live", "statement", activeId], queryFn: () => getStatement(company.id, activeId!), enabled: !!activeId });
  const suggestions = useQuery({ queryKey: ["live", "suggestions", activeId], queryFn: () => statementSuggestions(company.id, activeId!), enabled: !!activeId });
  const ledger = useQuery({ queryKey: ["live", "ledger-uncleared", bankAccountId], queryFn: () => bankLedger(company.id, bankAccountId, { uncleared: true }) });
  const ledgerById = React.useMemo(() => new Map((ledger.data ?? []).map((l) => [l.journalLineId, l])), [ledger.data]);
  const bestFor = (lineId: string) => (suggestions.data ?? []).filter((s) => s.statementLineId === lineId).sort((a, b) => b.score - a.score)[0];

  const canEdit = can("accounts.create");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={activeId ?? ""} onValueChange={setSelected}>
          <SelectTrigger className="w-[320px]"><SelectValue placeholder={t("rec.st.none")} /></SelectTrigger>
          <SelectContent>
            {(list.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label || `${formatDate(s.periodFrom)} – ${formatDate(s.periodTo)}`} · {t("rec.st.matchedOf", { matched: s.matchedCount, total: s.lineCount })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          {canEdit && activeId && (
            <Button variant="outline" className="gap-1.5" disabled={busy} onClick={() => void run(() => deleteStatement(company.id, activeId).then(() => setSelected(null)), t("rec.st.removed"))}>
              <Trash2 className="size-4" /> {t("rec.st.remove")}
            </Button>
          )}
          {canEdit && <Button className="gap-1.5" onClick={() => setImporting(true)}><Plus className="size-4" /> {t("rec.st.add")}</Button>}
        </div>
      </div>

      {!activeId ? (
        <Card className="p-10 text-center">
          <FileSpreadsheet className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">{t("rec.st.none")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("rec.st.emptyHint")}</p>
        </Card>
      ) : detail.isLoading || !detail.data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <Card className="p-4">
          {!detail.data.linesAddUp && (
            <p className="mb-3 rounded-lg bg-warning/12 px-3 py-2 text-sm text-warning">{t("rec.st.notAddUp")}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">{t("common.date")}</th>
                  <th className="pb-2 font-medium">{t("rec.st.colDescription")}</th>
                  <th className="pb-2 pe-3 text-end font-medium">{t("rec.st.colIn")}</th>
                  <th className="pb-2 pe-3 text-end font-medium">{t("rec.st.colOut")}</th>
                  <th className="pb-2 font-medium">{t("rec.st.colMatch")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.lines.map((l) => {
                  const s = l.matchStatus === "unmatched" ? bestFor(l.id) : undefined;
                  const target = s ? ledgerById.get(s.journalLineId) : undefined;
                  return (
                    <tr key={l.id} className="border-b border-border/40 align-top last:border-0">
                      <td className="whitespace-nowrap py-2 text-muted-foreground">{formatDate(l.date)}</td>
                      <td className="py-2">
                        <p className="max-w-[260px] truncate">{l.description || "—"}</p>
                        {l.reference && <p className="font-mono text-xs text-muted-foreground">{l.reference}</p>}
                      </td>
                      <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{num(l.deposit) ? formatMoney(num(l.deposit)) : ""}</td>
                      <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{num(l.withdrawal) ? formatMoney(num(l.withdrawal)) : ""}</td>
                      <td className="py-2">
                        {l.matchStatus === "matched" ? (
                          <div className="flex items-center gap-2">
                            <Badge className="gap-1 bg-success/12 text-success" variant="outline"><CheckCircle2 className="size-3" /> {t("rec.st.matched")}</Badge>
                            {canEdit && (
                              <Button size="icon-sm" variant="ghost" aria-label={t("rec.st.unmatchAria")} disabled={busy} onClick={() => void run(() => unmatchLine(company.id, l.id))}>
                                <Unlink className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {s && target && (
                              <div className="flex items-center gap-2">
                                <Wand2 className="size-3.5 shrink-0 text-gold" />
                                <span className="max-w-[220px] truncate text-xs text-muted-foreground">
                                  {target.number} · {target.partyName ?? target.description ?? ""}
                                </span>
                                {canEdit && (
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => matchLine(company.id, l.id, [s.journalLineId]), t("rec.st.matchedDone"))}>{t("rec.st.match")}</Button>
                                )}
                              </div>
                            )}
                            {canEdit && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setDraftFor(l); setAccountId(null); }}>
                                {t("rec.st.createVoucher")}
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <StatementImportDialog open={importing} onOpenChange={setImporting} bankAccountId={bankAccountId} onCreated={setSelected} />

      <FormDialog
        open={!!draftFor}
        onOpenChange={(o) => !o && setDraftFor(null)}
        icon={Plus}
        title={t("rec.st.dlgTitle")}
        description={draftFor ? t(num(draftFor.deposit) ? "rec.st.dlgInDescription" : "rec.st.dlgOutDescription", { amount: formatMoney(Math.abs(num(draftFor.amount))), date: formatDate(draftFor.date) }) : ""}
        submitLabel={t("rec.st.dlgSubmit")}
        submitDisabled={!accountId}
        onSubmit={async () => {
          const v = await draftVoucherFromLine(company.id, draftFor!.id, accountId!);
          toast.success(t("rec.st.dlgCreated", { number: v.number }));
          await run(async () => undefined);
        }}
      >
        <Field label={draftFor && num(draftFor.deposit) ? t("rec.st.whereFrom") : t("rec.st.whatSpent")}>
          <AccountPicker value={accountId} onChange={(id) => setAccountId(id)} />
        </Field>
      </FormDialog>
    </div>
  );
}

// ───────────────────────────────────────────── page
export function LiveBankReconciliation() {
  const t = useT();
  const params = useSearchParams();
  const accounts = useBankAccounts();
  const [picked, setPicked] = React.useState<string | null>(params.get("account"));
  const list = accounts.data ?? [];
  const activeId = picked && list.some((b) => b.id === picked) ? picked : list[0]?.id ?? null;
  const active = list.find((b) => b.id === activeId);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={Scale}
        eyebrow={t("nav.section.finance")}
        title={t("rec.title")}
        description={t("rec.description")}
        actions={
          list.length > 0 ? (
            <Select value={activeId ?? ""} onValueChange={setPicked}>
              <SelectTrigger className="w-[300px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {list.map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} · {b.accountNo}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {accounts.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !active ? (
        <Card className="p-10 text-center">
          <Landmark className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">{t("acc.noBanks")}</p>
          <p className="mt-1 text-sm text-muted-foreground"><Link href="/dashboard/accounts" className="text-primary underline">{t("rec.noBanksLink")}</Link></p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={Landmark} label={t("acc.bookBalance")} value={formatMoney(num(active.bookBalance), { compact: true })} accent="success" />
            <StatTile icon={Scale} label={t("rec.tile.uncleared")} value={active.unclearedCount} accent="warning" />
            <StatTile icon={CheckCircle2} label={t("rec.tile.last")} value={active.lastReconciledOn ? formatDate(active.lastReconciledOn) : t("rec.never")} accent="gold" />
          </div>
          <Tabs defaultValue="reconcile" key={active.id}>
            <TabsList>
              <TabsTrigger value="reconcile">{t("rec.tab.reconcile")}</TabsTrigger>
              <TabsTrigger value="statements">{t("rec.tab.statements")}</TabsTrigger>
            </TabsList>
            <TabsContent value="reconcile" className="mt-4"><ReconcileTab bankAccountId={active.id} bookBalance={num(active.bookBalance)} /></TabsContent>
            <TabsContent value="statements" className="mt-4"><StatementsTab bankAccountId={active.id} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
