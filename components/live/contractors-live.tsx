"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, FilePlus2, HardHat, Plus, ReceiptText, UserPlus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { AmountInput } from "@/components/live/amount-input";
import { PartySelect } from "@/components/live/party-select";
import { NewPartyDialog } from "@/components/live/party-dialog";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { closeConstructionContract, contractorBillAction, createConstructionContract, createContractorBill, getConstructionContract, listConstructionContracts, listContractors } from "@/lib/api/modules";
import { fetchProjects } from "@/lib/api/live";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { AttachmentsButton } from "@/components/live/attachments";
import { useT } from "@/lib/i18n/provider";
import { tOr } from "@/lib/i18n/runtime";

const CLS: Record<string, string> = { active: "bg-success/12 text-success", completed: "bg-primary/12 text-primary", terminated: "bg-destructive/10 text-destructive", draft: "bg-muted text-muted-foreground", approved: "bg-success/12 text-success", void: "bg-muted text-muted-foreground line-through" };

export function LiveContractors() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const [newParty, setNewParty] = React.useState(false);
  const [newContract, setNewContract] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const people = useQuery({ queryKey: ["live", "contractors"], queryFn: () => listContractors(company.id), staleTime: 15_000 });
  const contracts = useQuery({ queryKey: ["live", "construction-contracts"], queryFn: () => listConstructionContracts(company.id), staleTime: 15_000 });
  const all = people.data ?? [];
  const cs = contracts.data ?? [];

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader icon={HardHat} eyebrow={t("nav.section.projects")} title={t("contractors.title")} description={t("contractors.description")}
        actions={
          <div className="flex flex-wrap gap-2">
            {can("customers.create") && <Button variant="outline" className="gap-1.5" onClick={() => setNewParty(true)}><UserPlus className="size-4" /> {t("contractors.add")}</Button>}
            {can("contractors.create") && <Button className="gap-1.5" onClick={() => setNewContract(true)}><FilePlus2 className="size-4" /> {t("contractors.newAgreement")}</Button>}
          </div>
        } />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={HardHat} label={t("contractors.tile.all")} value={all.length} />
        <StatTile icon={ReceiptText} label={t("contractors.tile.agreed")} value={formatMoney(cs.filter((c) => c.status !== "terminated").reduce((s, c) => s + num(c.contractValue), 0), { compact: true })} accent="gold" />
        <StatTile icon={CheckCircle2} label={t("contractors.tile.billed")} value={formatMoney(all.reduce((s, c) => s + num(c.billed), 0), { compact: true })} accent="success" />
        <StatTile icon={Wallet} label={t("contractors.tile.owed")} value={formatMoney(all.reduce((s, c) => s + num(c.owed), 0), { compact: true })} accent="warning" />
      </div>
      <Tabs defaultValue="agreements">
        <TabsList><TabsTrigger value="agreements">{t("contractors.tab.agreements")}</TabsTrigger><TabsTrigger value="contractors">{t("contractors.tab.contractors")}</TabsTrigger></TabsList>
        <TabsContent value="agreements" className="mt-4">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead><tr className="border-b border-border/70 text-start text-xs text-muted-foreground"><th className="pb-2.5 font-medium">{t("contractors.col.agreement")}</th><th className="pb-2.5 font-medium">{t("contractors.col.contractor")}</th><th className="pb-2.5 font-medium">{t("contractors.col.project")}</th><th className="pb-2.5 pe-3 text-end font-medium">{t("contractors.col.value")}</th><th className="pb-2.5 font-medium">{t("contractors.col.billed")}</th><th className="pb-2.5 font-medium">{t("common.status")}</th></tr></thead>
                <tbody>
                  {contracts.isLoading ? Array.from({ length: 3 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : cs.map((c) => {
                    const pct = num(c.contractValue) ? Math.min(100, (num(c.billed) / num(c.contractValue)) * 100) : 0;
                    return (
                      <tr key={c.id} className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-secondary/40" onClick={() => setOpenId(c.id)}>
                        <td className="py-2.5"><p className="font-medium">{c.title}</p><p className="font-mono text-xs text-muted-foreground">{c.contractNo}</p></td>
                        <td className="py-2.5">{c.contractorName}</td>
                        <td className="py-2.5 text-muted-foreground">{c.projectName}</td>
                        <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{formatMoney(num(c.contractValue))}</td>
                        <td className="min-w-[140px] py-2.5"><Progress value={pct} className="h-1.5" /><p className="mt-1 text-xs text-muted-foreground">{formatMoney(num(c.billed), { compact: true })} · {Math.round(pct)}%</p></td>
                        <td className="py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CLS[c.status]}`}>{tOr(t, `contractors.status.${c.status}`, c.status)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!contracts.isLoading && cs.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t("contractors.emptyAgreements")}</p>}
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="contractors" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {people.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />) : all.map((c) => (
              <Card key={c.id} className="space-y-2 p-4">
                <div><p className="font-heading text-base font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{[c.phone, c.city].filter(Boolean).join(" · ") || "—"}</p></div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground">{t("contractors.card.billed")}</p><p className="font-mono">{formatMoney(num(c.billed), { compact: true })}</p></div>
                  <div><p className="text-muted-foreground">{t("contractors.card.retention")}</p><p className="font-mono">{formatMoney(num(c.retentionHeld), { compact: true })}</p></div>
                  <div><p className="text-muted-foreground">{t("contractors.card.owed")}</p><p className="font-mono font-medium text-warning">{formatMoney(num(c.owed), { compact: true })}</p></div>
                </div>
                <p className="text-xs text-muted-foreground">{t("contractors.card.active", { count: c.activeContracts })}</p>
              </Card>
            ))}
            {!people.isLoading && all.length === 0 && <Card className="p-10 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">{t("contractors.emptyPeople")}</Card>}
          </div>
        </TabsContent>
      </Tabs>
      <NewPartyDialog open={newParty} onOpenChange={setNewParty} defaultRoles={["contractor"]} />
      <NewAgreementDialog open={newContract} onOpenChange={setNewContract} onCreated={setOpenId} />
      <AgreementSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function NewAgreementDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const projects = useQuery({ queryKey: ["live", "projects-pick"], queryFn: () => fetchProjects(company.id), enabled: open, staleTime: 60_000 });
  const [contractorId, setContractorId] = React.useState<string | null>(null);
  const [projectId, setProjectId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [value, setValue] = React.useState("");
  const [retention, setRetention] = React.useState("5");
  const [start, setStart] = React.useState(todayIso());
  const [end, setEnd] = React.useState("");
  const [scope, setScope] = React.useState("");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={FilePlus2} title={t("contractors.newAgreement")} description={t("contractors.new.description")}
      submitLabel={t("contractors.new.submit")} submitDisabled={!contractorId || !projectId || title.trim().length < 3 || num(value) <= 0}
      onSubmit={async () => {
        const c = await createConstructionContract(company.id, { contractorId, projectId, title: title.trim(), contractValue: value, retentionPct: Number(retention) || 0, startDate: start, endDate: end || undefined, scope: scope.trim() || undefined });
        await invalidate();
        toast.success(t("contractors.new.created", { no: c.contractNo }));
        setTitle(""); setValue(""); setScope("");
        onCreated(c.id);
      }}>
      <Field label={t("contractors.col.contractor")}><PartySelect value={contractorId} onChange={(id) => setContractorId(id)} role="contractor" placeholder={t("contractors.new.chooseContractor")} createLabel={t("contractors.new.addContractor")} /></Field>
      <Field label={t("contractors.col.project")}>
        <Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder={t("contractors.new.chooseProject")} /></SelectTrigger><SelectContent>{(projects.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
      </Field>
      <Field label={t("contractors.new.work")}><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("contractors.new.workPlaceholder")} /></Field>
      <FieldRow>
        <Field label={t("contractors.new.value")}><AmountInput value={value} onChange={setValue} /></Field>
        <Field label={t("contractors.new.retention")}><Input inputMode="decimal" value={retention} onChange={(e) => setRetention(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("contractors.new.starts")}><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label={t("contractors.new.finishBy")}><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </FieldRow>
      <Field label={t("contractors.new.scope")}><Textarea rows={2} value={scope} onChange={(e) => setScope(e.target.value)} /></Field>
    </FormDialog>
  );
}

function AgreementSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const q = useQuery({ queryKey: ["live", "construction-contract", id], queryFn: () => getConstructionContract(company.id, id!), enabled: !!id });
  const [billing, setBilling] = React.useState(false);
  const [voiding, setVoiding] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const [desc, setDesc] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const c = q.data;

  async function approve(billId: string) {
    setBusy(true);
    try { await contractorBillAction(company.id, billId, "approve"); await invalidate(); toast.success(t("contractors.sheet.approved")); } catch (e) { toast.error(e instanceof Error ? e.message : t("common.thatDidNotWork")); } finally { setBusy(false); }
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{c?.title ?? t("contractors.sheet.fallbackTitle")}</SheetTitle>
          <SheetDescription>{c ? `${c.contractNo} · ${c.contractorName} · ${c.projectName}` : ""}</SheetDescription>
        </SheetHeader>
        {!c ? <div className="p-4"><Skeleton className="h-64 w-full" /></div> : (
          <div className="space-y-5 px-4 pb-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[[t("contractors.sheet.agreed"), c.contractValue], [t("contractors.sheet.billed"), c.billed], [t("contractors.sheet.retentionHeld"), c.retentionHeld], [t("contractors.sheet.stillToBill"), c.remaining]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-secondary/50 px-3 py-2"><p className="text-xs text-muted-foreground">{l}</p><p className="font-mono text-sm font-medium">{formatMoney(num(v), { compact: true })}</p></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {c.status === "active" && can("contractors.create") && <Button className="gap-1.5" onClick={() => setBilling(true)}><Plus className="size-4" /> {t("contractors.sheet.addBill")}</Button>}
              {can("accounts.create") && <Button variant="outline" asChild><Link href="/dashboard/vouchers/new?type=BPV">{t("contractors.sheet.pay")}</Link></Button>}<AttachmentsButton entityType="construction_contract" entityId={c.id} title={c.title} size="default" canEdit={can("contractors.edit")} categories={["Agreement", "BOQ", "Drawing", "Measurement sheet", "Other"]} />
              {c.status === "active" && can("contractors.edit") && <Button variant="ghost" onClick={() => void closeConstructionContract(company.id, c.id, "completed").then(invalidate).then(() => toast.success(t("contractors.sheet.completed")))}>{t("contractors.sheet.markCompleted")}</Button>}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("contractors.sheet.bills")}</p>
              {(c.bills ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("contractors.sheet.noBills")}</p> : (
                <div className="space-y-2">
                  {(c.bills ?? []).map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                      <div><p className="font-mono font-medium">{b.billNo} <span className="font-sans font-normal text-muted-foreground">· {formatDate(b.billDate)}</span></p><p className="text-xs text-muted-foreground">{b.description}</p></div>
                      <div className="text-end"><p className="font-mono">{formatMoney(num(b.grossAmount))}</p><p className="text-xs text-muted-foreground">{t("contractors.sheet.billLine", { retention: formatMoney(num(b.retentionAmount)), net: formatMoney(num(b.netAmount)) })}</p></div>
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLS[b.status]}`}>{tOr(t, `contractors.status.${b.status}`, b.status)}</span>
                        {b.status === "draft" && can("contractors.approve") && <Button size="sm" disabled={busy} onClick={() => void approve(b.id)}>{t("contractors.sheet.approve")}</Button>}
                        {b.status === "approved" && can("contractors.approve") && <Button size="icon-sm" variant="ghost" aria-label={t("contractors.sheet.voidAria")} onClick={() => setVoiding(b.id)}><Ban className="size-4" /></Button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <FormDialog open={billing} onOpenChange={setBilling} icon={ReceiptText} title={t("contractors.bill.title")} description={t("contractors.bill.description", { pct: c?.retentionPct ?? 0 })} submitLabel={t("contractors.bill.submit")} submitDisabled={num(amount) <= 0}
          onSubmit={async () => { await createContractorBill(company.id, id!, { billDate: date, grossAmount: amount, description: desc.trim() || undefined }); await invalidate(); toast.success(t("contractors.bill.added")); setAmount(""); setDesc(""); }}>
          <Field label={t("contractors.bill.amount")}><AmountInput value={amount} onChange={setAmount} /></Field>
          <FieldRow><Field label={t("contractors.bill.date")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label={t("contractors.bill.for")}><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("contractors.bill.forPlaceholder")} /></Field></FieldRow>
        </FormDialog>
        <ReasonDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} icon={Ban} title={t("contractors.void.title")} description={t("contractors.void.description")} submitLabel={t("contractors.void.submit")}
          onSubmit={async (reason) => { await contractorBillAction(company.id, voiding!, "void", { reason }); await invalidate(); toast.success(t("contractors.void.done")); }} />
      </SheetContent>
    </Sheet>
  );
}
