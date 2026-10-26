"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FilePlus2, FileStack, Send, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { AmountInput } from "@/components/live/amount-input";
import { SearchSelect } from "@/components/live/search-select";
import { PartySelect } from "@/components/live/party-select";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { acceptQuotation, createQuotation, listLeads, listQuotations, setQuotationStatus, type QuotationRow } from "@/lib/api/modules";
import { listAvailableProperties } from "@/lib/api/sales";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { ExportButton } from "@/components/live/export-button";
import { PrintLink } from "@/components/live/print-button";

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground", sent: "bg-primary/12 text-primary", accepted: "bg-success/12 text-success", rejected: "bg-destructive/10 text-destructive", expired: "bg-warning/12 text-warning",
};
const label = (q: QuotationRow) => (q.expired ? "expired" : q.status);
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function LiveQuotations() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const params = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(!!params.get("lead"));
  const [busy, setBusy] = React.useState(false);
  const q = useQuery({ queryKey: ["live", "quotations"], queryFn: () => listQuotations(company.id), staleTime: 15_000 });

  const all = q.data ?? [];
  const shown = all.filter((x) => !search.trim() || `${x.quoteNo} ${x.leadName ?? ""} ${x.customerName ?? ""} ${x.propertyCode}`.toLowerCase().includes(search.trim().toLowerCase()));
  const openValue = all.filter((x) => (x.status === "draft" || x.status === "sent") && !x.expired).reduce((s, x) => s + num(x.netPrice), 0);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); await invalidate(); toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : "That did not work."); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader icon={FileStack} eyebrow="Sales & CRM" title="Quotations" description="Price offers that become bookings when the customer says yes"
        actions={can("crm.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><FilePlus2 className="size-4" /> New quotation</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={FileStack} label="Quotations" value={all.length} />
        <StatTile icon={Send} label="Waiting for an answer" value={all.filter((x) => x.status === "sent" && !x.expired).length} accent="warning" />
        <StatTile icon={CheckCircle2} label="Accepted" value={all.filter((x) => x.status === "accepted").length} accent="success" />
        <StatTile icon={FileStack} label="Open offers" value={formatMoney(openValue, { compact: true })} accent="gold" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder="Search quotation, name, property…" /><ExportButton name="quotations" headers={["Quotation", "Date", "For", "Property", "Net price", "Valid until", "Status"]} rows={shown.map((x) => [x.quoteNo, x.quoteDate, x.customerName ?? x.leadName, x.propertyCode, num(x.netPrice), x.validUntil, label(x)])} /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Quotation</th><th className="pb-2.5 font-medium">For</th><th className="pb-2.5 font-medium">Property</th>
                <th className="pb-2.5 pe-3 text-end font-medium">Price</th><th className="pb-2.5 font-medium">Valid until</th><th className="pb-2.5 font-medium">Status</th><th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={7} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : shown.map((x) => (
                <tr key={x.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                  <td className="py-2.5"><p className="font-mono font-medium">{x.quoteNo}</p><p className="text-xs text-muted-foreground">{formatDate(x.quoteDate)}</p></td>
                  <td className="py-2.5">{x.customerName ?? x.leadName}{!x.customerName && <span className="ms-1 text-xs text-muted-foreground">(lead)</span>}</td>
                  <td className="py-2.5"><p>{x.propertyCode} · {x.propertyTitle}</p><p className="text-xs text-muted-foreground">{x.installments > 0 ? `${formatMoney(num(x.downPayment), { compact: true })} down + ${x.installments} installments` : "Full payment"}</p></td>
                  <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{formatMoney(num(x.netPrice))}</td>
                  <td className="py-2.5 text-muted-foreground">{formatDate(x.validUntil)}</td>
                  <td className="py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_CLASS[label(x)]}`}>{label(x)}</span></td>
                  <td className="py-2.5 text-end">
                    <PrintLink kind="quotation" id={x.id} iconOnly label="Print quotation" variant="ghost" />
                    {x.status === "accepted" && x.bookingId ? <Button size="sm" variant="outline" asChild><Link href={`/dashboard/deals/${x.bookingId}`}>View booking</Link></Button> : (x.status === "draft" || x.status === "sent") && !x.expired && (
                      <div className="flex justify-end gap-1.5">
                        {x.status === "draft" && can("crm.edit") && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => setQuotationStatus(company.id, x.id, "sent"), "Marked as sent")}>Mark sent</Button>}
                        {can("deals.create") && <Button size="sm" disabled={busy} className="gap-1" onClick={() => void run(() => acceptQuotation(company.id, x.id), "Booking created")}><CheckCircle2 className="size-3.5" /> Accept</Button>}
                        {can("crm.edit") && <Button size="icon-sm" variant="ghost" aria-label="Reject" disabled={busy} onClick={() => void run(() => setQuotationStatus(company.id, x.id, "rejected"), "Marked as rejected")}><XCircle className="size-4" /></Button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.isLoading && shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{all.length === 0 ? "No quotations yet. Quote a property to a lead or customer." : "No quotation matches your search."}</p>}
        </div>
      </Card>
      <NewQuotationDialog open={creating} onOpenChange={setCreating} presetLead={params.get("lead") ?? undefined} />
    </div>
  );
}

function NewQuotationDialog({ open, onOpenChange, presetLead }: { open: boolean; onOpenChange: (o: boolean) => void; presetLead?: string }) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const props = useQuery({ queryKey: ["live", "available-properties"], queryFn: () => listAvailableProperties(company.id), enabled: open, staleTime: 15_000 });
  const leads = useQuery({ queryKey: ["live", "leads"], queryFn: () => listLeads(company.id), enabled: open, staleTime: 15_000 });
  const [audience, setAudience] = React.useState<"lead" | "customer">(presetLead ? "lead" : "customer");
  const [leadId, setLeadId] = React.useState<string | null>(presetLead ?? null);
  const [partyId, setPartyId] = React.useState<string | null>(null);
  const [propertyId, setPropertyId] = React.useState<string | null>(null);
  const [discount, setDiscount] = React.useState("");
  const [down, setDown] = React.useState("");
  const [count, setCount] = React.useState("0");
  const [first, setFirst] = React.useState(plusDays(30));
  const [valid, setValid] = React.useState(plusDays(14));
  const [notes, setNotes] = React.useState("");

  const chosen = props.data?.find((p) => p.id === propertyId);
  const price = chosen ? num(chosen.listPrice) : 0;
  const net = Math.max(price - num(discount), 0);
  const n = Number(count) || 0;
  const rest = net - num(down);
  const target = audience === "lead" ? leadId : partyId;

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={FilePlus2} title="New quotation" description="Offer a property at a price and a payment plan. If the customer accepts, a booking is created for you."
      submitLabel="Create quotation" submitDisabled={!target || !propertyId || rest < 0 || (n > 0 && !first) || !valid}
      onSubmit={async () => {
        const body: Record<string, unknown> = { propertyId, validUntil: valid, discount: discount || "0", downPayment: down || "0", installments: n, firstDue: n > 0 ? first : undefined, notes: notes.trim() || undefined };
        if (audience === "lead") body.leadId = leadId; else body.partyId = partyId;
        const r = await createQuotation(company.id, body);
        await invalidate();
        toast.success(`${r.quoteNo} created`);
      }}>
      <FieldRow>
        <Field label="Quote to">
          <div className="flex gap-1.5">
            {(["customer", "lead"] as const).map((a) => <Button key={a} type="button" size="sm" variant={audience === a ? "default" : "outline"} onClick={() => setAudience(a)}>{a === "lead" ? "A lead" : "A customer"}</Button>)}
          </div>
        </Field>
      </FieldRow>
      {audience === "lead"
        ? <Field label="Lead"><SearchSelect options={(leads.data ?? []).filter((l) => l.stage !== "lost").map((l) => ({ value: l.id, label: l.name, hint: l.phone ?? l.leadNo }))} value={leadId} onChange={setLeadId} placeholder="Choose a lead" searchPlaceholder="Search leads" emptyText="No lead found" /></Field>
        : <Field label="Customer"><PartySelect value={partyId} onChange={(id) => setPartyId(id)} role="customer" placeholder="Choose a customer" createLabel="Add a new customer" /></Field>}
      <Field label="Property">
        <SearchSelect options={(props.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.title}`, hint: formatMoney(num(p.listPrice), { compact: true }), group: p.project ?? "No project" }))} value={propertyId} onChange={setPropertyId} placeholder="Choose a property" searchPlaceholder="Search by code or name" emptyText="No available property" />
      </Field>
      <FieldRow>
        <Field label="Discount"><AmountInput value={discount} onChange={setDiscount} /></Field>
        <Field label="Down payment"><AmountInput value={down} onChange={setDown} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="Installments"><Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 3))} /></Field>
        <Field label="First one due"><Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} disabled={n === 0} /></Field>
      </FieldRow>
      <Field label="Offer valid until"><Input type="date" value={valid} min={todayIso()} onChange={(e) => setValid(e.target.value)} /></Field>
      {chosen && (
        <div className="rounded-lg bg-secondary/50 px-3 py-2.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Customer pays</span><span className="font-mono font-medium">{formatMoney(net)}</span></div>
          {rest < 0 ? <p className="text-destructive">The down payment is more than the price.</p> : n > 0 && <p className="text-xs text-muted-foreground">then {n} installments of about {formatMoney(rest / n)}</p>}
        </div>
      )}
      <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </FormDialog>
  );
}
