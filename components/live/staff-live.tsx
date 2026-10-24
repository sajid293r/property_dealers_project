"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, UserPlus, UserSquare2, Users2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { AmountInput } from "@/components/live/amount-input";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { createEmployee, listEmployees, updateEmployee, type EmployeeRow } from "@/lib/api/modules";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { ExportButton } from "@/components/live/export-button";
import { AttachmentsButton } from "@/components/live/attachments";

export function LiveStaff() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<EmployeeRow | "new" | null>(null);
  const [leaving, setLeaving] = React.useState<EmployeeRow | null>(null);
  const q = useQuery({ queryKey: ["live", "employees"], queryFn: () => listEmployees(company.id), staleTime: 15_000 });
  const all = q.data ?? [];
  const active = all.filter((e) => e.status === "active");
  const shown = all.filter((e) => !search.trim() || `${e.fullName} ${e.empNo} ${e.designation ?? ""} ${e.department ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader icon={UserSquare2} eyebrow="People" title="Staff" description="Your team, their pay and their records"
        actions={can("staff.create") ? <Button className="gap-1.5" onClick={() => setEditing("new")}><UserPlus className="size-4" /> Add employee</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Users2} label="Active employees" value={active.length} />
        <StatTile icon={Banknote} label="Monthly salary bill" value={formatMoney(active.reduce((s, e) => s + num(e.grossSalary), 0), { compact: true })} accent="gold" />
        <StatTile icon={Wallet} label="Tax withheld a month" value={formatMoney(active.reduce((s, e) => s + num(e.incomeTax), 0), { compact: true })} accent="muted" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder="Search name, number, designation…" /><ExportButton name="staff" headers={["No.", "Name", "Designation", "Department", "Joined", "Gross monthly pay", "Status"]} rows={shown.map((e) => [e.empNo, e.fullName, e.designation, e.department, e.joinDate, num(e.grossSalary), e.status])} /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Employee</th><th className="pb-2.5 font-medium">Role</th><th className="pb-2.5 font-medium">Joined</th>
                <th className="pb-2.5 pr-3 text-right font-medium">Monthly pay</th><th className="pb-2.5 font-medium">Status</th><th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : shown.map((e) => (
                <tr key={e.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                  <td className="py-2.5"><p className="font-medium">{e.fullName}</p><p className="text-xs text-muted-foreground"><span className="font-mono">{e.empNo}</span>{e.phone ? ` · ${e.phone}` : ""}</p></td>
                  <td className="py-2.5"><p>{e.designation ?? "—"}</p><p className="text-xs text-muted-foreground">{e.department}</p></td>
                  <td className="py-2.5 text-muted-foreground">{formatDate(e.joinDate)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums">{formatMoney(num(e.grossSalary))}</td>
                  <td className="py-2.5"><Badge variant="outline" className={e.status === "active" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"}>{e.status === "active" ? "Active" : e.status === "resigned" ? "Resigned" : "Terminated"}</Badge></td>
                  <td className="py-2.5 text-right">
                    {can("staff.edit") && <div className="flex justify-end gap-1.5"><AttachmentsButton entityType="employee" entityId={e.id} title={e.fullName} iconOnly canEdit categories={["CNIC copy", "Contract", "Qualification", "Other"]} /><Button size="sm" variant="outline" onClick={() => setEditing(e)}>Edit</Button>{e.status === "active" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setLeaving(e)}>Left</Button>}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.isLoading && shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{all.length === 0 ? "No employees yet. Add your first team member." : "Nothing matches your search."}</p>}
        </div>
      </Card>
      <EmployeeDialog target={editing} onClose={() => setEditing(null)} />
      <ReasonDialog open={!!leaving} onOpenChange={(o) => !o && setLeaving(null)} icon={UserSquare2} title={`${leaving?.fullName ?? "Employee"} has left`} description="They stop appearing in payroll after their last day. Their history is kept." submitLabel="Record leaving" reasonLabel="Reason (resigned, terminated, retired…)" dateLabel="Last working day"
        onSubmit={async (reason, date) => { await updateEmployee(company.id, leaving!.id, { status: /terminat|fired|dismiss/i.test(reason) ? "terminated" : "resigned", leftOn: date, notes: `Left: ${reason}` }); await invalidate(); toast.success("Recorded"); }} />
    </div>
  );
}

function EmployeeDialog({ target, onClose }: { target: EmployeeRow | "new" | null; onClose: () => void }) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const isNew = target === "new";
  const e = target && target !== "new" ? target : null;
  const key = e?.id ?? (isNew ? "new" : "none");
  return <EmployeeForm key={key} open={!!target} onClose={onClose} employee={e} companyId={company.id} invalidate={invalidate} />;
}

function EmployeeForm({ open, onClose, employee, companyId, invalidate }: { open: boolean; onClose: () => void; employee: EmployeeRow | null; companyId: string; invalidate: () => Promise<unknown> }) {
  const [f, setF] = React.useState({
    fullName: employee?.fullName ?? "", phone: employee?.phone ?? "", designation: employee?.designation ?? "", department: employee?.department ?? "", joinDate: employee?.joinDate ?? todayIso(),
    basic: employee?.basicSalary ?? "", house: employee?.houseAllowance ?? "", transport: employee?.transportAllowance ?? "", other: employee?.otherAllowance ?? "", tax: employee?.incomeTax ?? "", bankAccountNo: employee?.bankAccountNo ?? "",
  });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const gross = num(f.basic) + num(f.house) + num(f.transport) + num(f.other);
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} icon={UserPlus} title={employee ? `Edit ${employee.fullName}` : "Add employee"} description="Salary figures are monthly. Income tax is the fixed amount withheld each month — your accountant sets it."
      submitLabel={employee ? "Save changes" : "Add employee"} submitDisabled={f.fullName.trim().length < 2 || !f.joinDate}
      onSubmit={async () => {
        const body = { fullName: f.fullName.trim(), phone: f.phone.trim() || undefined, designation: f.designation.trim() || undefined, department: f.department.trim() || undefined, joinDate: f.joinDate,
          basicSalary: f.basic || "0", houseAllowance: f.house || "0", transportAllowance: f.transport || "0", otherAllowance: f.other || "0", incomeTax: f.tax || "0", bankAccountNo: f.bankAccountNo.trim() || undefined };
        if (employee) await updateEmployee(companyId, employee.id, body); else await createEmployee(companyId, body);
        await invalidate();
        toast.success(employee ? "Saved" : "Employee added");
      }}>
      <FieldRow>
        <Field label="Full name"><Input value={f.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="Designation"><Input value={f.designation} onChange={(e) => set("designation", e.target.value)} placeholder="Sales Manager" /></Field>
        <Field label="Department"><Input value={f.department} onChange={(e) => set("department", e.target.value)} placeholder="Sales" /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="Joined on"><Input type="date" value={f.joinDate} onChange={(e) => set("joinDate", e.target.value)} /></Field>
        <Field label="Bank account no."><Input value={f.bankAccountNo} onChange={(e) => set("bankAccountNo", e.target.value)} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="Basic salary"><AmountInput value={f.basic} onChange={(v) => set("basic", v)} /></Field>
        <Field label="House allowance"><AmountInput value={f.house} onChange={(v) => set("house", v)} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label="Transport allowance"><AmountInput value={f.transport} onChange={(v) => set("transport", v)} /></Field>
        <Field label="Other allowance"><AmountInput value={f.other} onChange={(v) => set("other", v)} /></Field>
      </FieldRow>
      <Field label="Income tax withheld monthly"><AmountInput value={f.tax} onChange={(v) => set("tax", v)} /></Field>
      <p className="text-xs text-muted-foreground">Gross monthly pay: <span className="font-mono font-medium text-foreground">{formatMoney(gross)}</span></p>
    </FormDialog>
  );
}
