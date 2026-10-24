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

function useAction() {
  const invalidate = useInvalidateFinance();
  const [busy, setBusy] = React.useState(false);
  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await fn();
      await invalidate();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
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
        {sign && <span className="mr-1.5 inline-block w-3 text-center font-mono">{sign}</span>}
        {label}
      </span>
      <span className="whitespace-nowrap font-mono text-sm tabular-nums">{formatMoney(value)}</span>
    </div>
  );
}

// ───────────────────────────────────────────── reconcile tab
function ReconcileTab({ bankAccountId, bookBalance }: { bankAccountId: string; bookBalance: number }) {
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
            <h3 className="font-heading text-base font-semibold">Start a reconciliation</h3>
            <p className="mt-1 text-sm text-muted-foreground">Enter the closing balance from your bank statement. Then tick every item that appears on it.</p>
          </div>
          <Field label="Statement date"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
          <Field label="Closing balance on the statement"><AmountInput value={balance} onChange={setBalance} allowNegative /></Field>
          <Field label="Statement entered in the system (optional)">
            <Select value={statementId} onValueChange={setStatementId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(statements.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label || `${formatDate(s.periodFrom)} – ${formatDate(s.periodTo)}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {canStart ? (
            <Button
              disabled={busy || balance === "" || !asOf}
              onClick={() => void run(() => startReconciliation(company.id, bankAccountId, { asOf, statementBalance: balance, statementId: statementId === "none" ? null : statementId }), "Reconciliation started")}
            >
              Start reconciling
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">You can view reconciliations, but you need permission to add entries.</p>
          )}
          <p className="text-xs text-muted-foreground">Book balance right now: <span className="font-mono">{formatMoney(bookBalance)}</span></p>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-heading text-base font-semibold">Past reconciliations</h3>
          {(history.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing reconciled yet.</p>
          ) : (
            <div className="space-y-2">
              {(history.data ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">As of {formatDate(r.asOf)}</p>
                    <p className="text-xs text-muted-foreground">Statement {formatMoney(num(r.statementBalance))}{r.finalizedBy ? ` · finished by ${r.finalizedBy}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1"><Lock className="size-3" /> Finished</Badge>
                    {canApprove && r.id === last?.id && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => reopenReconciliation(company.id, r.id), "Reopened")}>
                        <RotateCcw className="size-3.5" /> Reopen
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
        <p className="py-2 text-sm text-muted-foreground">Nothing here.</p>
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
                <span className="ml-2 truncate text-sm text-muted-foreground">{[it.partyName, it.description].filter(Boolean).join(" · ")}</span>
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
            <h3 className="font-heading text-base font-semibold">Tick what appears on the bank statement</h3>
            <p className="text-xs text-muted-foreground">Ticked items are cleared as of {formatDate(r.asOf)}. Anything unticked stays outstanding.</p>
          </div>
        </div>
        {section("Money in (deposits & receipts)", money)}
        {section("Money out (cheques & payments)", payments)}
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-heading text-base font-semibold">Summary</h3>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Change</Button>
            )}
          </div>
          <Row label="Balance on bank statement" value={num(rep.statementBalance)} />
          <Row label="Deposits not yet in the bank" value={num(rep.depositsInTransit)} sign="+" />
          <Row label="Cheques not yet cashed" value={num(rep.outstandingPayments)} sign="−" />
          <Row label="Adjusted bank balance" value={num(rep.adjustedBankBalance)} sign="=" strong />
          <Row label="Balance in your books" value={num(rep.bookBalance)} />
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${Math.abs(diff) < 0.005 ? "bg-success/12 text-success" : "bg-warning/12 text-warning"}`}>
            {Math.abs(diff) < 0.005 ? "Balanced — nothing left to explain." : `Difference of ${formatMoney(Math.abs(diff))} still to explain`}
          </div>
          {Math.abs(diff) >= 0.005 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Usually a bank charge, a deposit or a payment not yet recorded. Add the missing voucher, then come back.
            </p>
          )}
          {(canEdit || canApprove) && (
            <div className="mt-4 flex gap-2">
              <Button className="flex-1 gap-1.5" disabled={busy || !canApprove || !r.canFinish} onClick={() => void run(() => finalizeReconciliation(company.id, r.id), "Reconciliation finished")}>
                <CheckCircle2 className="size-4" /> Finish
              </Button>
              <Button variant="outline" size="icon" disabled={busy} aria-label="Cancel reconciliation" onClick={() => void run(() => deleteReconciliation(company.id, r.id), "Reconciliation cancelled")}>
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
        title="Change statement details"
        description="Fix the statement date or its closing balance."
        submitLabel="Save"
        onSubmit={async () => {
          await updateReconciliation(company.id, r.id, { asOf: asOf || r.asOf, ...(balance !== "" ? { statementBalance: balance } : {}) });
          await run(async () => undefined, "Updated");
        }}
      >
        <Field label="Statement date"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
        <Field label={`Closing balance (now ${formatMoney(num(r.statementBalance))})`}><AmountInput value={balance} onChange={setBalance} allowNegative /></Field>
      </FormDialog>
    </div>
  );
}

// ───────────────────────────────────────────── statements tab
function StatementsTab({ bankAccountId }: { bankAccountId: string }) {
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
          <SelectTrigger className="w-[320px]"><SelectValue placeholder="No statements yet" /></SelectTrigger>
          <SelectContent>
            {(list.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label || `${formatDate(s.periodFrom)} – ${formatDate(s.periodTo)}`} · {s.matchedCount}/{s.lineCount} matched
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          {canEdit && activeId && (
            <Button variant="outline" className="gap-1.5" disabled={busy} onClick={() => void run(() => deleteStatement(company.id, activeId).then(() => setSelected(null)), "Statement removed")}>
              <Trash2 className="size-4" /> Remove
            </Button>
          )}
          {canEdit && <Button className="gap-1.5" onClick={() => setImporting(true)}><Plus className="size-4" /> Add statement</Button>}
        </div>
      </div>

      {!activeId ? (
        <Card className="p-10 text-center">
          <FileSpreadsheet className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No statements yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Paste a statement to let the system suggest which entries match each line.</p>
        </Card>
      ) : detail.isLoading || !detail.data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <Card className="p-4">
          {!detail.data.linesAddUp && (
            <p className="mb-3 rounded-lg bg-warning/12 px-3 py-2 text-sm text-warning">These lines do not add up to the closing balance — a row may be missing or mistyped.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 pr-3 text-right font-medium">In</th>
                  <th className="pb-2 pr-3 text-right font-medium">Out</th>
                  <th className="pb-2 font-medium">Match</th>
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
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums">{num(l.deposit) ? formatMoney(num(l.deposit)) : ""}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums">{num(l.withdrawal) ? formatMoney(num(l.withdrawal)) : ""}</td>
                      <td className="py-2">
                        {l.matchStatus === "matched" ? (
                          <div className="flex items-center gap-2">
                            <Badge className="gap-1 bg-success/12 text-success" variant="outline"><CheckCircle2 className="size-3" /> Matched</Badge>
                            {canEdit && (
                              <Button size="icon-sm" variant="ghost" aria-label="Unmatch" disabled={busy} onClick={() => void run(() => unmatchLine(company.id, l.id))}>
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
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => matchLine(company.id, l.id, [s.journalLineId]), "Matched")}>Match</Button>
                                )}
                              </div>
                            )}
                            {canEdit && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setDraftFor(l); setAccountId(null); }}>
                                Not recorded yet — create voucher
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
        title="Create voucher from this line"
        description={draftFor ? `${num(draftFor.deposit) ? "Money in" : "Money out"} ${formatMoney(Math.abs(num(draftFor.amount)))} on ${formatDate(draftFor.date)}. Choose the account it belongs to; a draft bank voucher is created and matches this line automatically once approved.` : ""}
        submitLabel="Create draft"
        submitDisabled={!accountId}
        onSubmit={async () => {
          const v = await draftVoucherFromLine(company.id, draftFor!.id, accountId!);
          toast.success(`Draft ${v.number} created — approve it to match`);
          await run(async () => undefined);
        }}
      >
        <Field label={draftFor && num(draftFor.deposit) ? "Where did this money come from?" : "What was this money spent on?"}>
          <AccountPicker value={accountId} onChange={(id) => setAccountId(id)} />
        </Field>
      </FormDialog>
    </div>
  );
}

// ───────────────────────────────────────────── page
export function LiveBankReconciliation() {
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
        eyebrow="Finance"
        title="Bank Reconciliation"
        description="Check that your books agree with what the bank says, and find what’s different"
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
          <p className="mt-3 text-sm font-medium">No bank accounts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add one under <Link href="/dashboard/accounts" className="text-primary underline">Accounts</Link> to start reconciling.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={Landmark} label="Book balance" value={formatMoney(num(active.bookBalance), { compact: true })} accent="success" />
            <StatTile icon={Scale} label="Uncleared entries" value={active.unclearedCount} accent="warning" />
            <StatTile icon={CheckCircle2} label="Last reconciled" value={active.lastReconciledOn ? formatDate(active.lastReconciledOn) : "Never"} accent="gold" />
          </div>
          <Tabs defaultValue="reconcile" key={active.id}>
            <TabsList>
              <TabsTrigger value="reconcile">Reconcile</TabsTrigger>
              <TabsTrigger value="statements">Bank statements</TabsTrigger>
            </TabsList>
            <TabsContent value="reconcile" className="mt-4"><ReconcileTab bankAccountId={active.id} bookBalance={num(active.bookBalance)} /></TabsContent>
            <TabsContent value="statements" className="mt-4"><StatementsTab bankAccountId={active.id} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
