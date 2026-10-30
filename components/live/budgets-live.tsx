"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Lock, PiggyBank, Plus, Send, Trash2, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { AmountInput } from "@/components/live/amount-input";
import { AccountPicker } from "@/components/live/account-picker";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { budgetAction, createBudget, decideBudgetRevision, getBudget, listBudgets, requestBudgetRevision, setBudgetControl } from "@/lib/api/modules";
import { fetchProjects } from "@/lib/api/live";
import { fiscalYearOf, todayIso } from "@/lib/fiscal";
import { num } from "@/lib/api/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import { tOr } from "@/lib/i18n/runtime";

const CLS: Record<string, string> = { draft: "bg-muted text-muted-foreground", submitted: "bg-warning/12 text-warning", approved: "bg-success/12 text-success", locked: "bg-primary/12 text-primary", closed: "bg-muted text-muted-foreground" };
const CONTROL_MODES = ["none", "warn", "block"] as const;

function usage(b: { committed: string; actual: string; totalAmount: string }) {
  const total = num(b.totalAmount);
  return { spent: num(b.actual) + num(b.committed), pct: total ? ((num(b.actual) + num(b.committed)) / total) * 100 : 0 };
}

export function LiveBudgets() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const q = useQuery({ queryKey: ["live", "budgets"], queryFn: () => listBudgets(company.id), staleTime: 15_000 });
  const all = q.data ?? [];
  const live = all.filter((b) => b.status === "approved" || b.status === "locked");
  const total = live.reduce((s, b) => s + num(b.totalAmount), 0);
  const spent = live.reduce((s, b) => s + num(b.actual) + num(b.committed), 0);

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader icon={PiggyBank} eyebrow={t("nav.section.finance")} title={t("bud.title")} description={t("bud.description")}
        actions={can("budgets.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" /> {t("bud.new")}</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={PiggyBank} label={t("bud.tile.all")} value={all.length} />
        <StatTile icon={Wallet} label={t("bud.tile.approved")} value={formatMoney(total, { compact: true })} accent="gold" />
        <StatTile icon={TrendingUp} label={t("bud.tile.spent")} value={formatMoney(spent, { compact: true })} accent={total && spent > total ? "warning" : "success"} />
        <StatTile icon={Send} label={t("bud.tile.waiting")} value={all.filter((b) => b.status === "submitted").length} accent="warning" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />) : all.map((b) => {
          const u = usage(b);
          return (
            <Card key={b.id} className="cursor-pointer space-y-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg" onClick={() => setOpenId(b.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-heading text-base font-semibold">{b.name}</p><p className="text-xs text-muted-foreground"><span className="font-mono">{b.budgetNo}</span> · {b.kind === "project" ? b.projectName ?? t("bud.projectFallback") : `${formatDate(b.periodStart ?? "")} – ${formatDate(b.periodEnd ?? "")}`}</p></div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${CLS[b.status]}`}>{t(`bud.status.${b.status}`)}</span>
              </div>
              <div>
                <Progress value={Math.min(100, u.pct)} className={`h-2 ${u.pct > 100 ? "[&>div]:bg-destructive" : u.pct > 85 ? "[&>div]:bg-warning" : ""}`} />
                <div className="mt-1.5 flex justify-between text-xs text-muted-foreground"><span>{t("bud.ofTotal", { spent: formatMoney(u.spent, { compact: true }), total: formatMoney(num(b.totalAmount), { compact: true }) })}</span><span>{Math.round(u.pct)}%</span></div>
              </div>
              <p className="text-xs text-muted-foreground">{t(`bud.control.${b.controlMode}`)}</p>
            </Card>
          );
        })}
        {!q.isLoading && all.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">{t("bud.empty")}</Card>}
      </div>
      <NewBudgetDialog open={creating} onOpenChange={setCreating} onCreated={setOpenId} />
      <BudgetSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

interface DraftLine { category: string; accountId: string; amount: string }

function LinesEditor({ lines, setLines }: { lines: DraftLine[]; setLines: (l: DraftLine[]) => void }) {
  const t = useT();
  const set = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      <div className="max-h-[260px] space-y-2 overflow-y-auto pe-1">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.2fr_130px_32px] items-center gap-2">
            <Input value={l.category} onChange={(e) => set(i, { category: e.target.value })} placeholder={t("bud.line.categoryPlaceholder")} aria-label={t("bud.line.categoryAria")} />
            <AccountPicker key={`${i}-${lines.length}`} value={l.accountId} onChange={(id, a) => set(i, { accountId: id, category: l.category || a?.name || "" })} only={(a) => a.class === "expense"} placeholder={t("bud.line.expenseAccount")} />
            <AmountInput value={l.amount} onChange={(v) => set(i, { amount: v })} />
            <Button type="button" size="icon-sm" variant="ghost" aria-label={t("vch.f.removeLine")} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setLines([...lines, { category: "", accountId: "", amount: "" }])}><Plus className="size-3.5" /> {t("vch.f.addLine")}</Button>
        <p className="text-sm">{t("common.total")} <span className="font-mono font-medium">{formatMoney(lines.reduce((s, l) => s + num(l.amount), 0))}</span></p>
      </div>
    </div>
  );
}

function NewBudgetDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const projects = useQuery({ queryKey: ["live", "projects-pick"], queryFn: () => fetchProjects(company.id), enabled: open, staleTime: 60_000 });
  const fy = fiscalYearOf(todayIso());
  const [kind, setKind] = React.useState<"project" | "operating">("operating");
  const [name, setName] = React.useState(() => t("bud.new.defaultName", { year: fy.name }));
  const [projectId, setProjectId] = React.useState("");
  const [start, setStart] = React.useState(fy.from);
  const [end, setEnd] = React.useState(fy.to);
  const [control, setControl] = React.useState("warn");
  const [lines, setLines] = React.useState<DraftLine[]>([{ category: "", accountId: "", amount: "" }]);
  const ready = lines.filter((l) => l.accountId && num(l.amount) > 0);
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={PiggyBank} title={t("bud.new")} description={t("bud.new.description")}
      submitLabel={t("bud.new.submit")} submitDisabled={name.trim().length < 3 || (kind === "project" && !projectId) || ready.length === 0}
      onSubmit={async () => {
        const b = await createBudget(company.id, { name: name.trim(), kind, projectId: kind === "project" ? projectId : undefined, periodStart: kind === "operating" ? start : undefined, periodEnd: kind === "operating" ? end : undefined, controlMode: control, lines: ready.map((l) => ({ category: l.category.trim() || "General", accountId: l.accountId, amount: l.amount })) });
        await invalidate();
        toast.success(t("bud.new.saved", { no: b.budgetNo }));
        onCreated(b.id);
      }}>
      <FieldRow>
        <Field label={t("bud.new.covers")}>
          <div className="flex gap-1.5">{(["operating", "project"] as const).map((k) => <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} onClick={() => { setKind(k); setName(k === "project" ? "" : t("bud.new.defaultName", { year: fy.name })); }}>{k === "operating" ? t("bud.new.officeYearly") : t("bud.new.aProject")}</Button>)}</div>
        </Field>
        <Field label={t("bud.new.whenOver")}>
          <Select value={control} onValueChange={setControl}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CONTROL_MODES.map((v) => <SelectItem key={v} value={v}>{t(`bud.control.${v}`)}</SelectItem>)}</SelectContent></Select>
        </Field>
      </FieldRow>
      <Field label={t("bud.new.name")}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("bud.new.namePlaceholder")} /></Field>
      {kind === "project"
        ? <Field label={t("bud.new.project")}><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder={t("bud.new.chooseProject")} /></SelectTrigger><SelectContent>{(projects.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></Field>
        : <FieldRow><Field label={t("acc.ledger.from")}><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field><Field label={t("acc.ledger.to")}><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field></FieldRow>}
      <Field label={t("bud.new.limits")}><LinesEditor lines={lines} setLines={setLines} /></Field>
    </FormDialog>
  );
}

function BudgetSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const q = useQuery({ queryKey: ["live", "budget", id], queryFn: () => getBudget(company.id, id!), enabled: !!id });
  const [revising, setRevising] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [lineId, setLineId] = React.useState("");
  const [delta, setDelta] = React.useState("");
  const [reason, setReason] = React.useState("");
  const b = q.data;

  async function act(a: "submit" | "recall" | "approve" | "lock" | "unlock" | "close", ok: string) {
    setBusy(true);
    try { await budgetAction(company.id, id!, a); await invalidate(); toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : t("common.thatDidNotWork")); } finally { setBusy(false); }
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{b?.name ?? t("bud.sheet.fallbackTitle")}</SheetTitle>
          <SheetDescription>{b ? t("bud.sheet.subtitle", { no: b.budgetNo, version: b.versionNo, status: t(`bud.status.${b.status}`) }) : ""}</SheetDescription>
        </SheetHeader>
        {!b ? <div className="p-4"><Skeleton className="h-64 w-full" /></div> : (
          <div className="space-y-5 px-4 pb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[[t("bud.sheet.budget"), b.totalAmount], [t("bud.sheet.spent"), b.actual], [t("bud.sheet.committed"), b.committed], [t("bud.sheet.left"), String(num(b.totalAmount) - num(b.actual) - num(b.committed))]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-secondary/50 px-3 py-2"><p className="text-xs text-muted-foreground">{l}</p><p className="font-mono text-sm font-medium">{formatMoney(num(v), { compact: true })}</p></div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {b.status === "draft" && can("budgets.edit") && <Button className="gap-1.5" disabled={busy} onClick={() => void act("submit", t("bud.sheet.sent"))}><Send className="size-4" /> {t("bud.sheet.send")}</Button>}
              {b.status === "submitted" && can("budgets.edit") && <Button variant="outline" disabled={busy} onClick={() => void act("recall", t("bud.sheet.recalled"))}>{t("vch.d.recall")}</Button>}
              {b.status === "submitted" && can("budgets.approve") && <Button className="gap-1.5" disabled={busy} onClick={() => void act("approve", t("bud.sheet.approvedDone"))}><CheckCircle2 className="size-4" /> {t("bud.sheet.approve")}</Button>}
              {b.status === "approved" && can("budgets.edit") && <Button variant="outline" onClick={() => { setLineId(b.lines[0]?.id ?? ""); setRevising(true); }}>{t("bud.sheet.requestChange")}</Button>}
              {b.status === "approved" && can("budgets.approve") && <Button variant="outline" className="gap-1.5" disabled={busy} onClick={() => void act("lock", t("bud.sheet.lockedDone"))}><Lock className="size-4" /> {t("bud.sheet.lock")}</Button>}
              {(b.status === "approved" || b.status === "locked") && can("budgets.approve") && <Button variant="ghost" disabled={busy} onClick={() => void act("close", t("bud.sheet.closedDone"))}>{t("bud.sheet.close")}</Button>}
              {b.status !== "closed" && can("budgets.approve") && (
                <Select value={b.controlMode} onValueChange={(v) => void setBudgetControl(company.id, b.id, v).then(invalidate).then(() => toast.success(t("bud.sheet.controlUpdated")))}>
                  <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTROL_MODES.map((v) => <SelectItem key={v} value={v}>{t(`bud.control.${v}`)}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-3">
              {b.lines.map((l) => {
                const pct = l.utilizationPct ? num(l.utilizationPct) : 0;
                return (
                  <div key={l.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{l.category}<span className="ms-2 text-xs font-normal text-muted-foreground">{l.accountCode} {l.accountName}</span></span><span className="font-mono text-xs">{formatMoney(num(l.actual) + num(l.committed), { compact: true })} / {formatMoney(num(l.budgetAmount), { compact: true })}</span></div>
                    <Progress value={Math.min(100, pct)} className={`mt-1 h-1.5 ${pct > 100 ? "[&>div]:bg-destructive" : pct > 85 ? "[&>div]:bg-warning" : ""}`} />
                  </div>
                );
              })}
            </div>
            {b.revisions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("bud.sheet.changes")}</p>
                <div className="space-y-2">
                  {b.revisions.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                      <div><p className="font-medium">{t("bud.rev.title", { type: tOr(t, `bud.rev.${r.type}`, r.type), no: r.revisionNo })}</p><p className="text-xs text-muted-foreground">{r.reason} · {r.lines.map((x) => `${x.category} ${num(x.deltaAmount) > 0 ? "+" : ""}${formatMoney(num(x.deltaAmount), { compact: true })}`).join(", ")}</p></div>
                      {r.status === "pending" && can("budgets.approve")
                        ? <div className="flex gap-1.5"><Button size="sm" onClick={() => void decideBudgetRevision(company.id, r.id, "approve").then(invalidate).then(() => toast.success(t("bud.rev.approvedDone"))).catch((e) => toast.error(e instanceof Error ? e.message : t("bud.rev.couldNotApprove")))}>{t("bud.rev.approve")}</Button><Button size="sm" variant="ghost" onClick={() => void decideBudgetRevision(company.id, r.id, "reject").then(invalidate)}>{t("bud.rev.reject")}</Button></div>
                        : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "approved" ? "bg-success/12 text-success" : r.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-warning/12 text-warning"}`}>{tOr(t, `bud.rev.${r.status}`, r.status)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <FormDialog open={revising} onOpenChange={setRevising} icon={PiggyBank} title={t("bud.req.title")} description={t("bud.req.description")} submitLabel={t("bud.req.submit")} submitDisabled={!lineId || num(delta) === 0 || reason.trim().length < 3}
          onSubmit={async () => { await requestBudgetRevision(company.id, id!, { type: "supplementary", reason: reason.trim(), lines: [{ budgetLineId: lineId, delta }] }); await invalidate(); toast.success(t("bud.req.sent")); setDelta(""); setReason(""); }}>
          <Field label={t("bud.req.line")}><Select value={lineId} onValueChange={setLineId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(b?.lines ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.category}</SelectItem>)}</SelectContent></Select></Field>
          <Field label={t("bud.req.extra")}><AmountInput value={delta} onChange={setDelta} /></Field>
          <Field label={t("bud.req.why")}><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </FormDialog>
      </SheetContent>
    </Sheet>
  );
}

