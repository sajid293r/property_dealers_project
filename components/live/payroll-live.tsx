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

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const CLS: Record<string, string> = { draft: "bg-muted text-muted-foreground", approved: "bg-warning/12 text-warning", paid: "bg-success/12 text-success" };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Approved — to pay", paid: "Paid" };

export function LivePayroll() {
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
      <PageHeader icon={Banknote} eyebrow="People" title="Payroll" description="Monthly salaries, posted to your books when approved and paid"
        actions={can("payroll.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" /> Run payroll</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Banknote} label="Payroll runs" value={runs.length} />
        <StatTile icon={Wallet} label="Approved, still to pay" value={formatMoney(owing, { compact: true })} accent={owing ? "warning" : "muted"} />
        <StatTile icon={CheckCircle2} label={last ? `Last: ${monthLabel(last.month)}` : "Last payroll"} value={last ? formatMoney(num(last.totalNet), { compact: true }) : "—"} accent="success" />
      </div>
      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border/70 text-left text-xs text-muted-foreground"><th className="pb-2.5 font-medium">Month</th><th className="pb-2.5 font-medium">People</th><th className="pb-2.5 pr-3 text-right font-medium">Gross</th><th className="pb-2.5 pr-3 text-right font-medium">Tax</th><th className="pb-2.5 pr-3 text-right font-medium">Net pay</th><th className="pb-2.5 font-medium">Status</th></tr></thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 3 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : runs.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-secondary/40" onClick={() => setOpenId(r.id)}>
                  <td className="py-2.5"><p className="font-medium">{monthLabel(r.month)}</p><p className="font-mono text-xs text-muted-foreground">{r.runNo}</p></td>
                  <td className="py-2.5">{r.employees ?? ""}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums">{r.status === "draft" ? "—" : formatMoney(num(r.totalGross))}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums">{r.status === "draft" ? "—" : formatMoney(num(r.totalTax))}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums font-medium">{r.status === "draft" ? "—" : formatMoney(num(r.totalNet))}</td>
                  <td className="py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CLS[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.isLoading && runs.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No payroll yet. Add your employees under Staff, then run the first month.</p>}
        </div>
      </Card>

      <FormDialog open={creating} onOpenChange={setCreating} icon={Banknote} title="Run payroll" description="Creates a draft for every employee who worked in the month. Unpaid leave is taken off automatically. Review it, then approve."
        submitLabel="Create draft" submitDisabled={!/^\d{4}-\d{2}$/.test(month)}
        onSubmit={async () => { const r = await createPayroll(company.id, month); await invalidate(); toast.success(`Payroll for ${monthLabel(month)} created`); setOpenId(r.id); }}>
        <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
      </FormDialog>

      <PayrollSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function PayrollSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
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
    try { await fn(); await invalidate(); toast.success(ok); then?.(); } catch (e) { toast.error(e instanceof Error ? e.message : "That did not work."); } finally { setBusy(false); }
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{r ? `Payroll — ${monthLabel(r.month)}` : "Payroll"}</SheetTitle>
          <SheetDescription>{r ? `${r.runNo} · ${STATUS_LABEL[r.status]}${r.paidOn ? ` on ${formatDate(r.paidOn)}` : ""}` : ""}</SheetDescription>
        </SheetHeader>
        {!r ? <div className="p-4"><Skeleton className="h-64 w-full" /></div> : (
          <div className="space-y-4 px-4 pb-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">Employee</th><th className="pb-2 pr-2 text-right font-medium">Basic</th><th className="pb-2 pr-2 text-right font-medium">Allowances</th><th className="pb-2 pr-2 text-right font-medium">Bonus</th><th className="pb-2 pr-2 text-right font-medium">Unpaid leave</th><th className="pb-2 pr-2 text-right font-medium">Tax</th><th className="pb-2 pr-2 text-right font-medium">Net</th></tr></thead>
                <tbody>
                  {r.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="py-2"><p className="font-medium">{l.fullName}</p><p className="text-xs text-muted-foreground">{l.designation}</p>{r.status !== "draft" && <a className="text-xs text-primary hover:underline" href={`/print/payslip/${r.id}?line=${l.id}`} target="_blank" rel="noopener">Payslip</a>}</td>
                      <td className="whitespace-nowrap py-2 pr-2 text-right font-mono tabular-nums">{formatMoney(num(l.basic))}</td>
                      <td className="whitespace-nowrap py-2 pr-2 text-right font-mono tabular-nums">{formatMoney(num(l.allowances))}</td>
                      <td className="py-2 pr-2 text-right">{r.status === "draft" && can("payroll.edit") ? <LineInput value={l.bonus} onSave={(v) => void run(() => editPayrollLine(company.id, r.id, l.id, { bonus: v }), "Saved")} /> : <span className="font-mono tabular-nums">{num(l.bonus) ? formatMoney(num(l.bonus)) : ""}</span>}</td>
                      <td className="whitespace-nowrap py-2 pr-2 text-right font-mono tabular-nums text-muted-foreground">{num(l.unpaidDeduction) ? `−${formatMoney(num(l.unpaidDeduction))} (${num(l.unpaidLeaveDays)}d)` : ""}</td>
                      <td className="py-2 pr-2 text-right">{r.status === "draft" && can("payroll.edit") ? <LineInput value={l.tax} onSave={(v) => void run(() => editPayrollLine(company.id, r.id, l.id, { tax: v }), "Saved")} /> : <span className="font-mono tabular-nums">{formatMoney(num(l.tax))}</span>}</td>
                      <td className="whitespace-nowrap py-2 pr-2 text-right font-mono font-medium tabular-nums">{formatMoney(num(l.net))}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold"><td className="pt-3" colSpan={6}>Total net pay</td><td className="whitespace-nowrap pt-3 pr-2 text-right font-mono tabular-nums">{formatMoney(r.lines.reduce((s, l) => s + num(l.net), 0))}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <div>{r.status === "draft" && can("payroll.edit") && <Button variant="ghost" className="gap-1 text-destructive" disabled={busy} onClick={() => void run(() => discardPayroll(company.id, r.id), "Draft discarded", onClose)}><Trash2 className="size-4" /> Discard draft</Button>}</div>
              <div className="flex gap-2">
                {r.status === "draft" && can("payroll.approve") && <Button className="gap-1.5" disabled={busy} onClick={() => void run(() => payrollAction(company.id, r.id, "approve"), "Approved and posted to the books")}><CheckCircle2 className="size-4" /> Approve</Button>}
                {r.status === "approved" && can("payroll.approve") && <Button className="gap-1.5" onClick={() => setPaying(true)}><Landmark className="size-4" /> Pay salaries</Button>}
              </div>
            </div>
            {r.status === "draft" && <p className="text-xs text-muted-foreground">Approving books the salary expense and what is owed to staff and for tax. Change a bonus or tax amount first if needed.</p>}
          </div>
        )}
        <FormDialog open={paying} onOpenChange={setPaying} icon={Landmark} title="Pay salaries" description={`${formatMoney(num(r?.totalNet))} will leave the account you choose.`} submitLabel="Pay"
          onSubmit={async () => { await payrollAction(company.id, id!, "pay", from === "cash" ? {} : { bankAccountId: from }); await invalidate(); toast.success("Salaries paid"); }}>
          <Field label="Pay from">
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="cash">Cash in hand</SelectItem>{(banks.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} · {b.accountNo}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </FormDialog>
      </SheetContent>
    </Sheet>
  );
}

function LineInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = React.useState(String(num(value)));
  return (
    <Input
      className="ml-auto h-7 w-24 text-right font-mono text-xs"
      inputMode="decimal"
      value={v}
      onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))}
      onBlur={() => { if (v !== String(num(value)) && /^\d+(\.\d{1,2})?$/.test(v)) onSave(v); }}
      aria-label="Amount"
    />
  );
}
