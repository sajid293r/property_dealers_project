"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, HandCoins, Plus, Receipt, Wrench } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { AmountInput } from "@/components/live/amount-input";
import { PartySelect } from "@/components/live/party-select";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useBankAccounts, useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { createServiceInvoice, listServiceInvoices, payServiceInvoice, voidServiceInvoice, type ServiceInvoiceRow } from "@/lib/api/modules";
import { num } from "@/lib/api/finance";
import { RECEIPT_METHODS } from "@/lib/live-sales";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { ExportButton } from "@/components/live/export-button";
import { PrintLink } from "@/components/live/print-button";
import { methodLabel } from "@/lib/live-sales";
import { useT } from "@/lib/i18n/provider";

const CLS: Record<string, string> = { unpaid: "bg-muted text-muted-foreground", partial: "bg-warning/12 text-warning", paid: "bg-success/12 text-success", void: "bg-muted text-muted-foreground line-through" };
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function LiveServiceInvoices() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [paying, setPaying] = React.useState<ServiceInvoiceRow | null>(null);
  const [voiding, setVoiding] = React.useState<ServiceInvoiceRow | null>(null);
  const q = useQuery({ queryKey: ["live", "service-invoices"], queryFn: () => listServiceInvoices(company.id), staleTime: 15_000 });
  const all = q.data ?? [];
  const live = all.filter((i) => i.status !== "void");
  const shown = all.filter((i) => !search.trim() || `${i.number} ${i.customerName} ${i.periodLabel ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader icon={Wrench} eyebrow={t("nav.section.sales")} title={t("sinv.title")} description={t("sinv.description")}
        actions={can("accounts.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" /> {t("sinv.new")}</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Receipt} label={t("sinv.tile.invoices")} value={live.length} />
        <StatTile icon={HandCoins} label={t("sinv.tile.toCollect")} value={formatMoney(live.reduce((s, i) => s + num(i.balance), 0), { compact: true })} accent="gold" />
        <StatTile icon={AlertTriangle} label={t("sinv.tile.overdue")} value={live.filter((i) => i.overdue).length} accent={live.some((i) => i.overdue) ? "warning" : "muted"} />
        <StatTile icon={HandCoins} label={t("sinv.tile.collected")} value={formatMoney(live.reduce((s, i) => s + num(i.paidAmount), 0), { compact: true })} accent="success" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder={t("sinv.search")} /><ExportButton name="service-invoices" headers={[t("sinv.csv.invoice"), t("common.date"), t("common.customer"), t("sinv.csv.for"), t("sinv.csv.due"), t("common.amount"), t("sinv.csv.paid"), t("sinv.csv.balance"), t("common.status")]} rows={shown.map((i) => [i.number, i.issueDate, i.customerName, i.periodLabel, i.dueDate, num(i.amount), num(i.paidAmount), num(i.balance), t(i.status === "unpaid" ? "sinv.status.unpaid" : `status.${i.status}`)])} /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">{t("sinv.col.invoice")}</th><th className="pb-2.5 font-medium">{t("common.customer")}</th><th className="pb-2.5 font-medium">{t("sinv.col.for")}</th><th className="pb-2.5 font-medium">{t("sinv.col.due")}</th>
                <th className="pb-2.5 pe-3 text-end font-medium">{t("common.amount")}</th><th className="pb-2.5 pe-3 text-end font-medium">{t("sinv.col.balance")}</th><th className="pb-2.5 font-medium">{t("common.status")}</th><th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={8} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : shown.map((i) => (
                <tr key={i.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                  <td className="py-2.5"><p className="font-mono font-medium">{i.number}</p><p className="text-xs text-muted-foreground">{formatDate(i.issueDate)}</p></td>
                  <td className="py-2.5">{i.customerName}</td>
                  <td className="py-2.5"><p>{i.periodLabel ?? "—"}</p><p className="max-w-[200px] truncate text-xs text-muted-foreground">{[i.propertyCode, i.description].filter(Boolean).join(" · ")}</p></td>
                  <td className={`py-2.5 ${i.overdue ? "font-medium text-warning" : "text-muted-foreground"}`}>{formatDate(i.dueDate)}</td>
                  <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{formatMoney(num(i.amount))}</td>
                  <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{i.status === "void" ? "" : formatMoney(num(i.balance))}</td>
                  <td className="py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CLS[i.status]}`}>{t(i.status === "unpaid" ? "sinv.status.unpaid" : `status.${i.status}`)}</span></td>
                  <td className="py-2.5 text-end">
                    <div className="flex justify-end gap-1.5">
                      <PrintLink kind="service-invoice" id={i.id} iconOnly label={t("sinv.print")} variant="ghost" />
                      {(i.status === "unpaid" || i.status === "partial") && can("accounts.create") && <Button size="sm" variant="outline" onClick={() => setPaying(i)}>{t("sinv.receive")}</Button>}
                      {i.status === "unpaid" && can("accounts.approve") && <Button size="icon-sm" variant="ghost" aria-label={t("sinv.voidAria")} onClick={() => setVoiding(i)}><Ban className="size-4" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.isLoading && shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{all.length === 0 ? t("sinv.emptyAll") : t("sinv.emptySearch")}</p>}
        </div>
      </Card>
      <NewInvoiceDialog open={creating} onOpenChange={setCreating} />
      <PayDialog invoice={paying} onClose={() => setPaying(null)} />
      <ReasonDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} icon={Ban} title={voiding ? t("sinv.void.title", { number: voiding.number }) : t("sinv.void.titleFallback")} description={t("sinv.void.description")} submitLabel={t("sinv.void.submit")}
        onSubmit={async (reason) => { await voidServiceInvoice(company.id, voiding!.id, reason); await invalidate(); toast.success(t("sinv.void.done")); }} />
    </div>
  );
}

function NewInvoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [issue, setIssue] = React.useState(todayIso());
  const [due, setDue] = React.useState(plusDays(15));
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={Wrench} title={t("sinv.new.title")} description={t("sinv.new.description")}
      submitLabel={t("sinv.new.submit")} submitDisabled={!customerId || num(amount) <= 0 || !due}
      onSubmit={async () => {
        const r = await createServiceInvoice(company.id, { customerId, periodLabel: period.trim() || undefined, description: description.trim() || undefined, amount, issueDate: issue, dueDate: due });
        await invalidate();
        toast.success(t("sinv.new.issued", { no: r.number }));
        setAmount(""); setDescription(""); setPeriod("");
      }}>
      <Field label={t("common.customer")}><PartySelect value={customerId} onChange={(id) => setCustomerId(id)} role="customer" placeholder={t("quotes.new.chooseCustomer")} createLabel={t("customers.select.addCustomer")} /></Field>
      <FieldRow>
        <Field label={t("sinv.new.period")}><Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder={t("sinv.new.periodPlaceholder")} /></Field>
        <Field label={t("common.amount")}><AmountInput value={amount} onChange={setAmount} /></Field>
      </FieldRow>
      <Field label={t("sinv.new.descriptionLabel")}><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("sinv.new.descriptionPlaceholder")} /></Field>
      <FieldRow>
        <Field label={t("sinv.new.invoiceDate")}><Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
        <Field label={t("sinv.new.dueDate")}><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </FieldRow>
    </FormDialog>
  );
}

function PayDialog({ invoice, onClose }: { invoice: ServiceInvoiceRow | null; onClose: () => void }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const banks = useBankAccounts();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("cash");
  const [into, setInto] = React.useState("cash");
  const [ref, setRef] = React.useState("");
  const m = RECEIPT_METHODS.find((x) => x.value === method)!;
  return (
    <FormDialog open={!!invoice} onOpenChange={(o) => { if (!o) { onClose(); setAmount(""); } }} icon={HandCoins} title={t("sinv.pay.title", { number: invoice?.number ?? "" })} description={t("sinv.pay.description", { name: invoice?.customerName ?? "", amount: formatMoney(num(invoice?.balance)) })}
      submitLabel={t("sinv.pay.submit")} submitDisabled={num(amount) <= 0 || num(amount) > num(invoice?.balance) || (m.needsRef && !ref.trim()) || (method !== "cash" && into === "cash")}
      onSubmit={async () => {
        await payServiceInvoice(company.id, invoice!.id, { amount, method, bankAccountId: into === "cash" ? undefined : into, reference: ref.trim() || undefined });
        await invalidate();
        toast.success(t("sinv.pay.saved"));
        setAmount(""); setRef("");
      }}>
      <Field label={t("sinv.pay.amount")}><AmountInput value={amount} onChange={setAmount} /></Field>
      <FieldRow>
        <Field label={t("sinv.pay.paidBy")}>
          <Select value={method} onValueChange={(v) => { setMethod(v); setInto(v === "cash" ? "cash" : banks.data?.[0]?.id ?? "cash"); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{RECEIPT_METHODS.map((x) => <SelectItem key={x.value} value={x.value}>{methodLabel(x.value)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t("sinv.pay.depositedInto")}>
          <Select value={into} onValueChange={setInto}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{method === "cash" && <SelectItem value="cash">{t("sinv.pay.cashInHand")}</SelectItem>}{(banks.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} · {b.accountNo}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </FieldRow>
      {m.needsRef && <Field label={t(`deals.ref.${method}`)}><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
    </FormDialog>
  );
}
