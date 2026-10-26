"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BellRing, CalendarClock, MessageSquare, Phone, UserCheck, UserPlus, Users2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { AmountInput } from "@/components/live/amount-input";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { addLeadActivity, convertLead, createLead, getLead, listLeads, setLeadStage, type LeadStage } from "@/lib/api/modules";
import { fetchProjects } from "@/lib/api/live";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { ExportButton } from "@/components/live/export-button";

const STAGES: { key: LeadStage; label: string; tone: string }[] = [
  { key: "new", label: "New", tone: "bg-primary/10 text-primary" },
  { key: "contacted", label: "Contacted", tone: "bg-gold/15 text-gold" },
  { key: "site_visit", label: "Site visit", tone: "bg-warning/12 text-warning" },
  { key: "negotiation", label: "Negotiation", tone: "bg-primary/15 text-primary" },
  { key: "won", label: "Won", tone: "bg-success/12 text-success" },
  { key: "lost", label: "Lost", tone: "bg-muted text-muted-foreground" },
];
const SOURCES = [
  ["walk_in", "Walk-in"], ["phone", "Phone call"], ["website", "Website"], ["social_media", "Social media"],
  ["referral", "Referral"], ["dealer", "Dealer"], ["exhibition", "Exhibition"], ["other", "Other"],
] as const;
const KIND_LABEL: Record<string, string> = { call: "Call", whatsapp: "WhatsApp", meeting: "Meeting", site_visit: "Site visit", note: "Note", stage_change: "Stage" };

export function LiveLeads() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const q = useQuery({ queryKey: ["live", "leads"], queryFn: () => listLeads(company.id), staleTime: 15_000 });
  const leads = (q.data ?? []).filter((l) => !search.trim() || `${l.name} ${l.phone ?? ""} ${l.leadNo}`.toLowerCase().includes(search.trim().toLowerCase()));
  const open = (q.data ?? []).filter((l) => l.stage !== "won" && l.stage !== "lost");
  const dueToday = open.filter((l) => l.nextFollowup && l.nextFollowup <= todayIso()).length;
  const won = (q.data ?? []).filter((l) => l.stage === "won").length;
  const total = (q.data ?? []).length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader
        icon={Users2}
        eyebrow="Sales & CRM"
        title="Leads"
        description="Every enquiry, from first call to booking"
        actions={can("crm.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><UserPlus className="size-4" /> New lead</Button> : undefined}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users2} label="Open leads" value={open.length} />
        <StatTile icon={BellRing} label="Follow-ups due" value={dueToday} accent={dueToday > 0 ? "warning" : "muted"} />
        <StatTile icon={UserCheck} label="Became customers" value={won} accent="success" />
        <StatTile icon={CalendarClock} label="Conversion" value={total ? `${Math.round((won / total) * 100)}%` : "—"} accent="gold" />
      </div>
      <div className="flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder="Search name, phone, lead number…" /><ExportButton name="leads" headers={["Lead", "Name", "Phone", "City", "Source", "Stage", "Project", "Budget up to", "Next follow-up", "Added"]} rows={leads.map((l) => [l.leadNo, l.name, l.phone, l.city, l.source, l.stage, l.interestProject, l.budgetMax ? num(l.budgetMax) : "", l.nextFollowup, l.createdAt.slice(0, 10)])} /></div>

      {q.isLoading ? <Skeleton className="h-96 rounded-xl" /> : (
        <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((st) => {
            const col = leads.filter((l) => l.stage === st.key);
            return (
              <div key={st.key} className="min-w-[210px] rounded-xl bg-secondary/40 p-2.5">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.tone}`}>{st.label}</span>
                  <span className="text-xs text-muted-foreground">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((l, i) => (
                    <motion.button key={l.id} type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}
                      onClick={() => setOpenId(l.id)}
                      className="w-full rounded-lg border border-border/60 bg-card p-3 text-start text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-md">
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.phone ?? l.city ?? l.leadNo}</p>
                      {(l.interestProject || l.budgetMax) && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">{[l.interestProject, l.budgetMax && `up to ${formatMoney(num(l.budgetMax), { compact: true })}`].filter(Boolean).join(" · ")}</p>
                      )}
                      {l.nextFollowup && st.key !== "won" && st.key !== "lost" && (
                        <p className={`mt-1.5 text-xs ${l.nextFollowup <= todayIso() ? "font-medium text-warning" : "text-muted-foreground"}`}>Follow up {formatDate(l.nextFollowup)}</p>
                      )}
                    </motion.button>
                  ))}
                  {col.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Nobody here</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewLeadDialog open={creating} onOpenChange={setCreating} onCreated={(id) => { void invalidate(); setOpenId(id); }} />
      <LeadSheet id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function NewLeadDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const { company } = useCompany();
  const [f, setF] = React.useState({ name: "", phone: "", city: "", source: "walk_in", projectId: "", budgetMax: "", followup: "", notes: "" });
  const projects = useQuery({ queryKey: ["live", "projects-pick"], queryFn: () => fetchProjects(company.id), enabled: open, staleTime: 60_000 });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={UserPlus}
      title="New lead"
      description="Write down who asked and what they are looking for. You can log every call and visit after."
      submitLabel="Add lead"
      submitDisabled={f.name.trim().length < 2}
      onSubmit={async () => {
        const l = await createLead(company.id, {
          name: f.name.trim(), phone: f.phone.trim() || undefined, city: f.city.trim() || undefined, source: f.source,
          interestProjectId: f.projectId || undefined, budgetMax: f.budgetMax || undefined, nextFollowup: f.followup || undefined, notes: f.notes.trim() || undefined,
        });
        toast.success(`${l.leadNo} added`);
        setF({ name: "", phone: "", city: "", source: "walk_in", projectId: "", budgetMax: "", followup: "", notes: "" });
        onCreated(l.id);
      }}
    >
      <FieldRow>
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ahmed Khan" /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0300-1234567" inputMode="tel" /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="City"><Input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Lahore" /></Field>
        <Field label="Heard about us from">
          <Select value={f.source} onValueChange={(v) => set("source", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Interested in">
          <Select value={f.projectId || "any"} onValueChange={(v) => set("projectId", v === "any" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">Any project</SelectItem>{(projects.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Budget up to"><AmountInput value={f.budgetMax} onChange={(v) => set("budgetMax", v)} /></Field>
      </FieldRow>
      <Field label="Follow up on"><Input type="date" value={f.followup} onChange={(e) => set("followup", e.target.value)} /></Field>
      <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
    </FormDialog>
  );
}

function LeadSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { company } = useCompany();
  const { can } = usePermissions();
  const router = useRouter();
  const invalidate = useInvalidateFinance();
  const q = useQuery({ queryKey: ["live", "lead", id], queryFn: () => getLead(company.id, id!), enabled: !!id });
  const [kind, setKind] = React.useState("call");
  const [note, setNote] = React.useState("");
  const [follow, setFollow] = React.useState("");
  const [lost, setLost] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const l = q.data;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      await invalidate();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }
  const closed = l?.stage === "won" || l?.stage === "lost";

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{l?.name ?? "Lead"}</SheetTitle>
          <SheetDescription>{l ? `${l.leadNo} · ${l.phone ?? "no phone"}${l.city ? ` · ${l.city}` : ""}` : ""}</SheetDescription>
        </SheetHeader>
        {!l ? <div className="p-4"><Skeleton className="h-64 w-full" /></div> : (
          <div className="space-y-5 px-4 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={STAGES.find((s) => s.key === l.stage)?.tone}>{STAGES.find((s) => s.key === l.stage)?.label}</Badge>
              {l.interestProject && <Badge variant="outline">{l.interestProject}</Badge>}
              {l.budgetMax && <Badge variant="outline">up to {formatMoney(num(l.budgetMax), { compact: true })}</Badge>}
              {l.nextFollowup && <Badge variant="outline" className="text-warning">Follow up {formatDate(l.nextFollowup)}</Badge>}
            </div>
            {l.notes && <p className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">{l.notes}</p>}
            {l.lostReason && <p className="text-sm text-destructive">Lost: {l.lostReason}</p>}

            {!closed && can("crm.edit") && (
              <div className="flex flex-wrap gap-2">
                <Select value={l.stage} onValueChange={(v) => void run(() => setLeadStage(company.id, l.id, v), "Stage updated")}>
                  <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.filter((s) => s.key !== "won" && s.key !== "lost").map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
                {can("customers.create") && <Button size="sm" className="gap-1" disabled={busy} onClick={() => void run(() => convertLead(company.id, l.id), "Added to your customers")}><UserCheck className="size-3.5" /> Make a customer</Button>}
                <Button size="sm" variant="outline" className="gap-1" onClick={() => router.push(`/dashboard/quotations?lead=${l.id}`)}>Quote a property</Button>
                <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => setLost(true)}><XCircle className="size-3.5" /> Lost</Button>
              </div>
            )}
            {l.partyId && <p className="text-sm text-success">This lead is now a customer in your address book.</p>}

            {can("crm.edit") && (
              <div className="space-y-2 rounded-xl border border-border/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Log something</p>
                <div className="flex gap-2">
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{["call", "whatsapp", "meeting", "site_visit", "note"].map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="date" className="h-8" value={follow} onChange={(e) => setFollow(e.target.value)} aria-label="Next follow-up" />
                </div>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was said or agreed?" />
                <Button size="sm" disabled={busy || !note.trim()} className="gap-1" onClick={() => void run(async () => { await addLeadActivity(company.id, l.id, { kind, note: note.trim(), nextFollowup: follow || undefined }); setNote(""); setFollow(""); }, "Saved")}>
                  {kind === "call" ? <Phone className="size-3.5" /> : <MessageSquare className="size-3.5" />} Save
                </Button>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</p>
              {l.activities.length === 0 ? <p className="text-sm text-muted-foreground">Nothing logged yet.</p> : (
                <ul className="space-y-2.5">
                  {l.activities.map((a) => (
                    <li key={a.id} className="border-s-2 border-gold/50 ps-3 text-sm">
                      <p><span className="font-medium">{KIND_LABEL[a.kind] ?? a.kind}</span> <span className="text-xs text-muted-foreground">· {formatDate(a.at)}{a.by ? ` · ${a.by}` : ""}</span></p>
                      {a.note && <p className="text-muted-foreground">{a.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <ReasonDialog open={lost} onOpenChange={setLost} icon={XCircle} title="Mark as lost" description="Say why, so you can learn from it." submitLabel="Mark lost" reasonLabel="Why was it lost?"
          onSubmit={async (reason) => { await setLeadStage(company.id, id!, "lost", reason); await invalidate(); toast.success("Marked as lost"); }} />
      </SheetContent>
    </Sheet>
  );
}

