"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FilePlus2, FileSignature, Plus, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { AmountInput } from "@/components/live/amount-input";
import { PartySelect } from "@/components/live/party-select";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { contractAction, createContract, listContracts, type ContractKind, type ContractRow } from "@/lib/api/modules";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { ExportButton } from "@/components/live/export-button";
import { PrintLink } from "@/components/live/print-button";
import { AttachmentsButton } from "@/components/live/attachments";

const KINDS: [ContractKind, string][] = [["sale_agreement", "Sale agreement"], ["rent", "Rent / lease"], ["service", "Service agreement"], ["construction", "Construction"], ["employment", "Employment"], ["other", "Other"]];
const CLS: Record<string, string> = { draft: "bg-muted text-muted-foreground", active: "bg-success/12 text-success", expired: "bg-warning/12 text-warning", terminated: "bg-destructive/10 text-destructive" };

export function LiveContracts() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [ending, setEnding] = React.useState<ContractRow | null>(null);
  const q = useQuery({ queryKey: ["live", "contracts"], queryFn: () => listContracts(company.id), staleTime: 15_000 });
  const all = q.data ?? [];
  const shown = all.filter((c) => !search.trim() || `${c.contractNo} ${c.title} ${c.partyName ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const soon = all.filter((c) => c.effectiveStatus === "active" && c.daysLeft !== null && c.daysLeft >= 0 && c.daysLeft <= 30);

  async function sign(c: ContractRow) {
    try { await contractAction(company.id, c.id, "sign"); await invalidate(); toast.success("Contract signed"); } catch (e) { toast.error(e instanceof Error ? e.message : "That did not work."); }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader icon={FileSignature} eyebrow="Sales & CRM" title="Contracts" description="Agreements with customers, tenants, suppliers and staff — never miss an expiry"
        actions={can("contracts.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" /> New contract</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={FileSignature} label="Contracts" value={all.length} />
        <StatTile icon={CheckCircle2} label="Active" value={all.filter((c) => c.effectiveStatus === "active").length} accent="success" />
        <StatTile icon={AlertTriangle} label="Ending within 30 days" value={soon.length} accent={soon.length ? "warning" : "muted"} />
        <StatTile icon={AlertTriangle} label="Expired" value={all.filter((c) => c.effectiveStatus === "expired").length} accent="muted" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder="Search contract, title, party…" /><ExportButton name="contracts" headers={["Contract", "Title", "Party", "Starts", "Ends", "Value", "Status"]} rows={shown.map((c) => [c.contractNo, c.title, c.partyName, c.startDate, c.endDate, num(c.value), c.effectiveStatus])} /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Contract</th><th className="pb-2.5 font-medium">Party</th><th className="pb-2.5 font-medium">Period</th>
                <th className="pb-2.5 pr-3 text-right font-medium">Value</th><th className="pb-2.5 font-medium">Status</th><th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : shown.map((c) => (
                <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                  <td className="py-2.5"><p className="font-medium">{c.title}</p><p className="text-xs text-muted-foreground"><span className="font-mono">{c.contractNo}</span> · {KINDS.find((k) => k[0] === c.kind)?.[1]}</p></td>
                  <td className="py-2.5">{c.partyName ?? "—"}{c.bookingNo && <p className="text-xs text-muted-foreground">{c.bookingNo}</p>}</td>
                  <td className="py-2.5"><p>{formatDate(c.startDate)}{c.endDate ? ` – ${formatDate(c.endDate)}` : ""}</p>{c.daysLeft !== null && c.effectiveStatus === "active" && <p className={`text-xs ${c.daysLeft <= 30 ? "font-medium text-warning" : "text-muted-foreground"}`}>{c.daysLeft} days left</p>}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums">{num(c.value) ? formatMoney(num(c.value)) : "—"}</td>
                  <td className="py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${CLS[c.effectiveStatus]}`}>{c.effectiveStatus}</span></td>
                  <td className="py-2.5 text-right">
                    <AttachmentsButton entityType="contract" entityId={c.id} title={c.title} iconOnly canEdit={can("contracts.edit")} categories={["Signed copy", "Annexure", "Other"]} /><PrintLink kind="contract" id={c.id} iconOnly label="Print contract" variant="ghost" />
                    {can("contracts.edit") && (
                      <div className="flex justify-end gap-1.5">
                        {c.status === "draft" && <Button size="sm" variant="outline" onClick={() => void sign(c)}>Mark signed</Button>}
                        {c.status !== "terminated" && <Button size="icon-sm" variant="ghost" aria-label="Terminate" onClick={() => setEnding(c)}><XCircle className="size-4" /></Button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.isLoading && shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{all.length === 0 ? "No contracts yet." : "Nothing matches your search."}</p>}
        </div>
      </Card>
      <NewContractDialog open={creating} onOpenChange={setCreating} />
      <ReasonDialog open={!!ending} onOpenChange={(o) => !o && setEnding(null)} icon={XCircle} title={`Terminate ${ending?.title ?? "contract"}`} description="The contract stays on record as terminated." submitLabel="Terminate" reasonLabel="Why is it ending?" dateLabel="Ended on"
        onSubmit={async (reason, date) => { await contractAction(company.id, ending!.id, "terminate", { reason, date }); await invalidate(); toast.success("Contract terminated"); }} />
    </div>
  );
}

function NewContractDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [kind, setKind] = React.useState<ContractKind>("rent");
  const [title, setTitle] = React.useState("");
  const [partyId, setPartyId] = React.useState<string | null>(null);
  const [start, setStart] = React.useState(todayIso());
  const [end, setEnd] = React.useState("");
  const [value, setValue] = React.useState("");
  const [signed, setSigned] = React.useState("");
  const [terms, setTerms] = React.useState("");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={FilePlus2} title="New contract" description="Record the agreement and its dates. Add the signing date once it is signed."
      submitLabel="Save contract" submitDisabled={title.trim().length < 3 || !start || (!!end && end < start)}
      onSubmit={async () => {
        const c = await createContract(company.id, { kind, title: title.trim(), partyId: partyId || undefined, startDate: start, endDate: end || undefined, value: value || "0", signedOn: signed || undefined, terms: terms.trim() || undefined });
        await invalidate();
        toast.success(`${c.contractNo} saved`);
        setTitle(""); setValue(""); setTerms("");
      }}>
      <FieldRow>
        <Field label="Type">
          <Select value={kind} onValueChange={(v) => setKind(v as ContractKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Value (optional)"><AmountInput value={value} onChange={setValue} /></Field>
      </FieldRow>
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shop 4, Main Boulevard — tenancy" /></Field>
      <Field label="With (optional)"><PartySelect value={partyId} onChange={(id) => setPartyId(id)} placeholder="Choose a person or company" /></Field>
      <FieldRow>
        <Field label="Starts"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Ends (optional)"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </FieldRow>
      <Field label="Signed on (leave empty if still a draft)"><Input type="date" value={signed} onChange={(e) => setSigned(e.target.value)} /></Field>
      <Field label="Key terms"><Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
    </FormDialog>
  );
}
