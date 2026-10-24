"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarPlus, Check, Clock, Palmtree, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { cancelLeave, decideLeave, fetchLeaveBalances, fetchLeaveTypes, listEmployees, listLeaveRequests, requestLeave, type LeaveRequestRow } from "@/lib/api/modules";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

const CLS: Record<string, string> = { pending: "bg-warning/12 text-warning", approved: "bg-success/12 text-success", rejected: "bg-destructive/10 text-destructive", cancelled: "bg-muted text-muted-foreground" };

export function LiveLeave() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [creating, setCreating] = React.useState(false);
  const [refusing, setRefusing] = React.useState<LeaveRequestRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const reqs = useQuery({ queryKey: ["live", "leave-requests"], queryFn: () => listLeaveRequests(company.id), staleTime: 10_000 });
  const bal = useQuery({ queryKey: ["live", "leave-balances"], queryFn: () => fetchLeaveBalances(company.id), staleTime: 10_000 });
  const all = reqs.data ?? [];
  const pending = all.filter((r) => r.status === "pending");
  const today = todayIso();
  const away = all.filter((r) => r.status === "approved" && r.fromDate <= today && r.toDate >= today);

  async function decide(r: LeaveRequestRow, approve: boolean) {
    setBusy(true);
    try { await decideLeave(company.id, r.id, approve); await invalidate(); toast.success(approve ? "Leave approved" : "Leave refused"); } catch (e) { toast.error(e instanceof Error ? e.message : "That did not work."); } finally { setBusy(false); }
  }

  const byEmployee = new Map<string, typeof bal.data>();
  for (const b of bal.data ?? []) byEmployee.set(b.fullName, [...(byEmployee.get(b.fullName) ?? []), b]);

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader icon={Palmtree} eyebrow="People" title="Leave" description="Requests, approvals and yearly balances"
        actions={can("leave.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><CalendarPlus className="size-4" /> Record leave</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Clock} label="Waiting for approval" value={pending.length} accent={pending.length ? "warning" : "muted"} />
        <StatTile icon={Palmtree} label="Away today" value={away.length} accent="gold" />
        <StatTile icon={CalendarCheck} label="Approved this year" value={all.filter((r) => r.status === "approved" && r.fromDate.startsWith(today.slice(0, 4))).length} accent="success" />
      </div>
      <Tabs defaultValue="requests">
        <TabsList><TabsTrigger value="requests">Requests</TabsTrigger><TabsTrigger value="balances">Balances</TabsTrigger></TabsList>
        <TabsContent value="requests" className="mt-4">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border/70 text-left text-xs text-muted-foreground"><th className="pb-2.5 font-medium">Employee</th><th className="pb-2.5 font-medium">Type</th><th className="pb-2.5 font-medium">Dates</th><th className="pb-2.5 font-medium">Days</th><th className="pb-2.5 font-medium">Status</th><th className="pb-2.5" /></tr></thead>
                <tbody>
                  {reqs.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : all.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                      <td className="py-2.5"><p className="font-medium">{r.employeeName}</p><p className="max-w-[220px] truncate text-xs text-muted-foreground">{r.reason}</p></td>
                      <td className="py-2.5">{r.leaveType}{!r.paid && <span className="ml-1 text-xs text-muted-foreground">(unpaid)</span>}</td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(r.fromDate)} – {formatDate(r.toDate)}</td>
                      <td className="py-2.5">{num(r.days)}</td>
                      <td className="py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${CLS[r.status]}`}>{r.status}</span>{r.decisionNote && <p className="text-xs text-muted-foreground">{r.decisionNote}</p>}</td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          {r.status === "pending" && can("leave.approve") && <><Button size="sm" className="gap-1" disabled={busy} onClick={() => void decide(r, true)}><Check className="size-3.5" /> Approve</Button><Button size="icon-sm" variant="ghost" aria-label="Refuse" onClick={() => setRefusing(r)}><X className="size-4" /></Button></>}
                          {(r.status === "pending" || r.status === "approved") && can("leave.create") && <Button size="sm" variant="ghost" onClick={() => void cancelLeave(company.id, r.id).then(invalidate).then(() => toast.success("Cancelled"))}>Cancel</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!reqs.isLoading && all.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No leave recorded yet.</p>}
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="balances" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {bal.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />) : [...byEmployee.entries()].map(([name, rows]) => (
              <Card key={name} className="space-y-3 p-4">
                <p className="font-heading text-base font-semibold">{name}</p>
                {rows!.filter((r) => r.paid).map((r) => (
                  <div key={r.leaveTypeId}>
                    <div className="flex justify-between text-sm"><span>{r.leaveType}</span><span className="text-muted-foreground">{num(r.remaining)} of {num(r.entitled)} left{num(r.pending) > 0 ? ` · ${num(r.pending)} waiting` : ""}</span></div>
                    <Progress value={num(r.entitled) ? (num(r.taken) / num(r.entitled)) * 100 : 0} className="mt-1 h-1.5" />
                  </div>
                ))}
              </Card>
            ))}
            {!bal.isLoading && byEmployee.size === 0 && <Card className="p-10 text-center text-sm text-muted-foreground md:col-span-2">Add employees under Staff to see their leave balances.</Card>}
          </div>
        </TabsContent>
      </Tabs>
      <NewLeaveDialog open={creating} onOpenChange={setCreating} />
      <ReasonDialog open={!!refusing} onOpenChange={(o) => !o && setRefusing(null)} icon={X} title="Refuse leave" description={`${refusing?.employeeName ?? ""} will see your reason.`} submitLabel="Refuse leave" reasonLabel="Reason"
        onSubmit={async (reason) => { await decideLeave(company.id, refusing!.id, false, reason); await invalidate(); toast.success("Leave refused"); }} />
    </div>
  );
}

function NewLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const emps = useQuery({ queryKey: ["live", "employees"], queryFn: () => listEmployees(company.id, { status: "active" }), enabled: open, staleTime: 30_000 });
  const types = useQuery({ queryKey: ["live", "leave-types"], queryFn: () => fetchLeaveTypes(company.id), enabled: open, staleTime: 60_000 });
  const [employeeId, setEmployeeId] = React.useState("");
  const [typeId, setTypeId] = React.useState("");
  const [from, setFrom] = React.useState(todayIso());
  const [to, setTo] = React.useState(todayIso());
  const [reason, setReason] = React.useState("");
  const days = from && to && to >= from ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0;
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={CalendarPlus} title="Record leave" description="It goes to an approver. Approved paid leave counts against the yearly allowance."
      submitLabel="Submit" submitDisabled={!employeeId || !typeId || days <= 0}
      onSubmit={async () => { await requestLeave(company.id, { employeeId, leaveTypeId: typeId, fromDate: from, toDate: to, reason: reason.trim() || undefined }); await invalidate(); toast.success("Leave recorded"); setReason(""); }}>
      <Field label="Employee">
        <Select value={employeeId} onValueChange={setEmployeeId}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{(emps.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}</SelectContent></Select>
      </Field>
      <Field label="Type of leave">
        <Select value={typeId} onValueChange={setTypeId}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{(types.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.paid ? ` (${num(t.annualDays)} days a year)` : " (unpaid)"}</SelectItem>)}</SelectContent></Select>
      </Field>
      <FieldRow>
        <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </FieldRow>
      <p className="text-xs text-muted-foreground">{days} day{days === 1 ? "" : "s"}</p>
      <Field label="Reason (optional)"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </FormDialog>
  );
}
