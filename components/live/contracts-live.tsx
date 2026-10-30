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
import { useT } from "@/lib/i18n/provider";
import { tOr } from "@/lib/i18n/runtime";

const KINDS: ContractKind[] = ["sale_agreement", "rent", "service", "construction", "employment", "other"];
const CLS: Record<string, string> = { draft: "bg-muted text-muted-foreground", active: "bg-success/12 text-success", expired: "bg-warning/12 text-warning", terminated: "bg-destructive/10 text-destructive" };

export function LiveContracts() {
  const t = useT();
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
    try { await contractAction(company.id, c.id, "sign"); await invalidate(); toast.success(t("contracts.signed")); } catch (e) { toast.error(e instanceof Error ? e.message : t("common.thatDidNotWork")); }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader icon={FileSignature} eyebrow={t("nav.section.sales")} title={t("contracts.title")} description={t("contracts.description")}
        actions={can("contracts.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" /> {t("contracts.new")}</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={FileSignature} label={t("contracts.tile.all")} value={all.length} />
        <StatTile icon={CheckCircle2} label={t("contracts.tile.active")} value={all.filter((c) => c.effectiveStatus === "active").length} accent="success" />
        <StatTile icon={AlertTriangle} label={t("contracts.tile.ending")} value={soon.length} accent={soon.length ? "warning" : "muted"} />
        <StatTile icon={AlertTriangle} label={t("contracts.tile.expired")} value={all.filter((c) => c.effectiveStatus === "expired").length} accent="muted" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder={t("contracts.search")} /><ExportButton name="contracts" headers={[t("contracts.csv.contract"), t("contracts.csv.title"), t("contracts.csv.party"), t("contracts.csv.starts"), t("contracts.csv.ends"), t("contracts.csv.value"), t("common.status")]} rows={shown.map((c) => [c.contractNo, c.title, c.partyName, c.startDate, c.endDate, num(c.value), t(`contracts.status.${c.effectiveStatus}`)])} /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">{t("contracts.col.contract")}</th><th className="pb-2.5 font-medium">{t("contracts.col.party")}</th><th className="pb-2.5 font-medium">{t("contracts.col.period")}</th>
                <th className="pb-2.5 pe-3 text-end font-medium">{t("contracts.col.value")}</th><th className="pb-2.5 font-medium">{t("common.status")}</th><th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : shown.map((c) => (
                <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                  <td className="py-2.5"><p className="font-medium">{c.title}</p><p className="text-xs text-muted-foreground"><span className="font-mono">{c.contractNo}</span> · {tOr(t, `contracts.kind.${c.kind}`, c.kind)}</p></td>
                  <td className="py-2.5">{c.partyName ?? "—"}{c.bookingNo && <p className="text-xs text-muted-foreground">{c.bookingNo}</p>}</td>
                  <td className="py-2.5"><p>{formatDate(c.startDate)}{c.endDate ? ` – ${formatDate(c.endDate)}` : ""}</p>{c.daysLeft !== null && c.effectiveStatus === "active" && <p className={`text-xs ${c.daysLeft <= 30 ? "font-medium text-warning" : "text-muted-foreground"}`}>{t("contracts.daysLeft", { count: c.daysLeft })}</p>}</td>
                  <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{num(c.value) ? formatMoney(num(c.value)) : "—"}</td>
                  <td className="py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CLS[c.effectiveStatus]}`}>{t(`contracts.status.${c.effectiveStatus}`)}</span></td>
                  <td className="py-2.5 text-end">
                    <AttachmentsButton entityType="contract" entityId={c.id} title={c.title} iconOnly canEdit={can("contracts.edit")} categories={["Signed copy", "Annexure", "Other"]} /><PrintLink kind="contract" id={c.id} iconOnly label={t("contracts.print")} variant="ghost" />
                    {can("contracts.edit") && (
                      <div className="flex justify-end gap-1.5">
                        {c.status === "draft" && <Button size="sm" variant="outline" onClick={() => void sign(c)}>{t("contracts.markSigned")}</Button>}
                        {c.status !== "terminated" && <Button size="icon-sm" variant="ghost" aria-label={t("contracts.terminateAria")} onClick={() => setEnding(c)}><XCircle className="size-4" /></Button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.isLoading && shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{all.length === 0 ? t("contracts.emptyAll") : t("contracts.emptySearch")}</p>}
        </div>
      </Card>
      <NewContractDialog open={creating} onOpenChange={setCreating} />
      <ReasonDialog open={!!ending} onOpenChange={(o) => !o && setEnding(null)} icon={XCircle} title={ending ? t("contracts.terminate.title", { title: ending.title }) : t("contracts.terminate.titleFallback")} description={t("contracts.terminate.description")} submitLabel={t("contracts.terminate.submit")} reasonLabel={t("contracts.terminate.reason")} dateLabel={t("contracts.terminate.date")}
        onSubmit={async (reason, date) => { await contractAction(company.id, ending!.id, "terminate", { reason, date }); await invalidate(); toast.success(t("contracts.terminate.done")); }} />
    </div>
  );
}

function NewContractDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
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
    <FormDialog open={open} onOpenChange={onOpenChange} icon={FilePlus2} title={t("contracts.new")} description={t("contracts.new.description")}
      submitLabel={t("contracts.new.submit")} submitDisabled={title.trim().length < 3 || !start || (!!end && end < start)}
      onSubmit={async () => {
        const c = await createContract(company.id, { kind, title: title.trim(), partyId: partyId || undefined, startDate: start, endDate: end || undefined, value: value || "0", signedOn: signed || undefined, terms: terms.trim() || undefined });
        await invalidate();
        toast.success(t("contracts.new.saved", { no: c.contractNo }));
        setTitle(""); setValue(""); setTerms("");
      }}>
      <FieldRow>
        <Field label={t("contracts.new.type")}>
          <Select value={kind} onValueChange={(v) => setKind(v as ContractKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map((v) => <SelectItem key={v} value={v}>{t(`contracts.kind.${v}`)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t("contracts.new.value")}><AmountInput value={value} onChange={setValue} /></Field>
      </FieldRow>
      <Field label={t("contracts.new.titleLabel")}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("contracts.new.titlePlaceholder")} /></Field>
      <Field label={t("contracts.new.with")}><PartySelect value={partyId} onChange={(id) => setPartyId(id)} placeholder={t("contracts.new.choosePerson")} /></Field>
      <FieldRow>
        <Field label={t("contracts.new.starts")}><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label={t("contracts.new.ends")}><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </FieldRow>
      <Field label={t("contracts.new.signedOn")}><Input type="date" value={signed} onChange={(e) => setSigned(e.target.value)} /></Field>
      <Field label={t("contracts.new.terms")}><Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
    </FormDialog>
  );
}
