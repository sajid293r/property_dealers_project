"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Landmark, Plus, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormDialog, Field } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { useCompany } from "@/lib/providers/company-provider";
import { useBankAccounts, useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { createPayroll, discardPayroll, editPayrollLine, getPayroll, listPayroll, payrollAction } from "@/lib/api/modules";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import type { TranslateFn } from "@/lib/i18n/runtime";

const monthLabel = (t: TranslateFn, m: string) => t("people.monthYear", { month: t(`people.month.${Number(m.slice(5, 7))}`), year: m.slice(0, 4) });
const CLS: Record<string, string> = { draft: "bg-muted text-muted-foreground", approved: "bg-warning/12 text-warning", paid: "bg-success/12 text-success" };

export function LivePayroll() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [creating, setCreating] = React.useState(false);
  const [month, setMonth] = React.useState(todayIso().slice(0, 7));
  const [openId, setOpenId] = React.useState<string | null>(null);
  const q = useQuery({ queryKey: ["live", "payroll"], queryFn: () => listPayroll(company.id), staleTime: 15_000 });
  const runs = q.data ?? [];
  const owing = runs.filter((r) => r.status === "approved").reduce((s, r) => s + num(r.totalNet), 0);
  const last = runs.find((r) => r.status !== "draft");

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader icon={Banknote} eyebrow={t("nav.section.people")} title={t("pay.title")} description={t("pay.description")}
        actions={can("payroll.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" /> {t("pay.run")}</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Banknote} label={t("pay.tile.runs")} value={runs.length} />
        <StatTile icon={Wallet} label={t("pay.tile.toPay")} value={formatMoney(owing, { compact: true })} accent={owing ? "warning" : "muted"} />
        <StatTile icon={CheckCircle2} label={last ? t("pay.tile.last", { month: monthLabel(t, last.month) }) : t("pay.tile.lastPayroll")} value={last ? formatMoney(num(last.totalNet), { compact: true }) : "—"} accent="success" />
      </div>
      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border/70 text-start text-xs text-muted-foreground"><th className="pb-2.5 font-medium">{t("pay.col.month")}</th><th className="pb-2.5 font-medium">{t("pay.col.people")}</th><th className="pb-2.5 pe-3 text-end font-medium">{t("pay.col.gross")}</th><th className="pb-2.5 pe-3 text-end font-medium">{t("pay.col.tax")}</th><th className="pb-2.5 pe-3 text-end font-medium">{t("pay.col.net")}</th><th className="pb-2.5 font-medium">{t("common.status")}</th></tr></thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 3 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : runs.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-secondary/40" onClick={() => setOpenId(r.id)}>
                  <td className="py-2.5"><p className="font-medium">{monthLabel(t, r.month)}</p><p className="font-mono text-xs text-muted-foreground">{r.runNo}</p></td>
                  <td className="py-2.5">{r.employees ?? ""}</td>
                  <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{r.status === "draft" ? "—" : formatMoney(num(r.totalGross))}</td>
                  <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{r.status === "draft" ? "—" : formatMoney(num(r.totalTax))}</td>
                  <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums font-medium">{r.status === "draft" ? "—" : formatMoney(num(r.totalNet))}</td>
                  <td className="py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CLS[r.status]}`}>{t(`pay.status.${r.status}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.isLoading && runs.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t("pay.empty")}</p>}
        </div>
      </Card>

      <FormDialog open={creating} onOpenChange={setCreating} icon={Banknote} title={t("pay.run")} description={t("pay.run.description")}
        submitLabel={t("pay.run.submit")} submitDisabled={!/^\d{4}-\d{2}$/.test(month)}
        onSubmit={async () => { const r = await createPayroll(company.id, month); await invalidate(); toast.success(t("pay.run.created", { month: monthLabel(t, month) })); setOpenId(r.id); }}>
        <Field label={t("pay.run.month")}><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
      </FormDialog>

      <PayrollSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function PayrollSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const banks = useBankAccounts();
  const q = useQuery({ queryKey: ["live", "payroll", id], queryFn: () => getPayroll(company.id, id!), enabled: !!id });
  const [paying, setPaying] = React.useState(false);
  const [from, setFrom] = React.useState("cash");
  const [busy, setBusy] = React.useState(false);
  const r = q.data;

  async function run(fn: () => Promise<unknown>, ok: string, then?: () => void) {
    setBusy(true);
    try { await fn(); await invalidate(); toast.success(ok); then?.(); } catch (e) { toast.error(e instanceof Error ? e.message : t("common.thatDidNotWork")); } finally { setBusy(false); }
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{r ? t("pay.sheet.title", { month: monthLabel(t, r.month) }) : t("pay.sheet.fallbackTitle")}</SheetTitle>
          <SheetDescription>{r ? (r.paidOn ? t("pay.sheet.subtitlePaid", { no: r.runNo, status: t(`pay.status.${r.status}`), date: formatDate(r.paidOn) }) : t("pay.sheet.subtitle", { no: r.runNo, status: t(`pay.status.${r.status}`) })) : ""}</SheetDescription>
        </SheetHeader>
        {!r ? <div className="p-4"><Skeleton className="h-64 w-full" /></div> : (
          <div className="space-y-4 px-4 pb-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr className="border-b text-start text-xs text-muted-foreground"><th className="pb-2 font-medium">{t("pay.sheet.employee")}</th><th className="pb-2 pe-2 text-end font-medium">{t("pay.sheet.basic")}</th><th className="pb-2 pe-2 text-end font-medium">{t("pay.sheet.allowances")}</th><th className="pb-2 pe-2 text-end font-medium">{t("pay.sheet.bonus")}</th><th className="pb-2 pe-2 text-end font-medium">{t("pay.sheet.unpaidLeave")}</th><th className="pb-2 pe-2 text-end font-medium">{t("pay.sheet.tax")}</th><th className="pb-2 pe-2 text-end font-medium">{t("pay.sheet.net")}</th></tr></thead>
                <tbody>
                  {r.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="py-2"><p className="font-medium">{l.fullName}</p><p className="text-xs text-muted-foreground">{l.designation}</p>{r.status !== "draft" && <a className="text-xs text-primary hover:underline" href={`/print/payslip/${r.id}?line=${l.id}`} target="_blank" rel="noopener">{t("pay.sheet.payslip")}</a>}</td>
                      <td className="whitespace-nowrap py-2 pe-2 text-end font-mono tabular-nums">{formatMoney(num(l.basic))}</td>
                      <td className="whitespace-nowrap py-2 pe-2 text-end font-mono tabular-nums">{formatMoney(num(l.allowances))}</td>
                      <td className="py-2 pe-2 text-end">{r.status === "draft" && can("payroll.edit") ? <LineInput value={l.bonus} onSave={(v) => void run(() => editPayrollLine(company.id, r.id, l.id, { bonus: v }), t("pay.sheet.saved"))} /> : <span className="font-mono tabular-nums">{num(l.bonus) ? formatMoney(num(l.bonus)) : ""}</span>}</td>
                      <td className="whitespace-nowrap py-2 pe-2 text-end font-mono tabular-nums text-muted-foreground">{num(l.unpaidDeduction) ? `−${t("pay.sheet.unpaidDays", { amount: formatMoney(num(l.unpaidDeduction)), days: num(l.unpaidLeaveDays) })}` : ""}</td>
                      <td className="py-2 pe-2 text-end">{r.status === "draft" && can("payroll.edit") ? <LineInput value={l.tax} onSave={(v) => void run(() => editPayrollLine(company.id, r.id, l.id, { tax: v }), t("pay.sheet.saved"))} /> : <span className="font-mono tabular-nums">{formatMoney(num(l.tax))}</span>}</td>
                      <td className="whitespace-nowrap py-2 pe-2 text-end font-mono font-medium tabular-nums">{formatMoney(num(l.net))}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold"><td className="pt-3" colSpan={6}>{t("pay.sheet.totalNet")}</td><td className="whitespace-nowrap pt-3 pe-2 text-end font-mono tabular-nums">{formatMoney(r.lines.reduce((s, l) => s + num(l.net), 0))}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <div>{r.status === "draft" && can("payroll.edit") && <Button variant="ghost" className="gap-1 text-destructive" disabled={busy} onClick={() => void run(() => discardPayroll(company.id, r.id), t("pay.sheet.discarded"), onClose)}><Trash2 className="size-4" /> {t("pay.sheet.discard")}</Button>}</div>
              <div className="flex gap-2">
                {r.status === "draft" && can("payroll.approve") && <Button className="gap-1.5" disabled={busy} onClick={() => void run(() => payrollAction(company.id, r.id, "approve"), t("pay.sheet.approved"))}><CheckCircle2 className="size-4" /> {t("pay.sheet.approve")}</Button>}
                {r.status === "approved" && can("payroll.approve") && <Button className="gap-1.5" onClick={() => setPaying(true)}><Landmark className="size-4" /> {t("pay.sheet.payBtn")}</Button>}
              </div>
            </div>
            {r.status === "draft" && <p className="text-xs text-muted-foreground">{t("pay.sheet.draftHint")}</p>}
          </div>
        )}
        <FormDialog open={paying} onOpenChange={setPaying} icon={Landmark} title={t("pay.sheet.payBtn")} description={t("pay.pay.description", { amount: formatMoney(num(r?.totalNet)) })} submitLabel={t("pay.pay.submit")}
          onSubmit={async () => { await payrollAction(company.id, id!, "pay", from === "cash" ? {} : { bankAccountId: from }); await invalidate(); toast.success(t("pay.pay.done")); }}>
          <Field label={t("pay.pay.from")}>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="cash">{t("sinv.pay.cashInHand")}</SelectItem>{(banks.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} · {b.accountNo}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </FormDialog>
      </SheetContent>
    </Sheet>
  );
}

function LineInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const t = useT();
  const [v, setV] = React.useState(String(num(value)));
  return (
    <Input
      className="ms-auto h-7 w-24 text-end font-mono text-xs"
      inputMode="decimal"
      value={v}
      onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))}
      onBlur={() => { if (v !== String(num(value)) && /^\d+(\.\d{1,2})?$/.test(v)) onSave(v); }}
      aria-label={t("pay.amountAria")}
    />
  );
}
