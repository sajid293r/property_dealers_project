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
import { useT } from "@/lib/i18n/provider";

export function LiveStaff() {
  const t = useT();
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
      <PageHeader icon={UserSquare2} eyebrow={t("nav.section.people")} title={t("staff.title")} description={t("staff.description")}
        actions={can("staff.create") ? <Button className="gap-1.5" onClick={() => setEditing("new")}><UserPlus className="size-4" /> {t("staff.add")}</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Users2} label={t("staff.tile.active")} value={active.length} />
        <StatTile icon={Banknote} label={t("staff.tile.bill")} value={formatMoney(active.reduce((s, e) => s + num(e.grossSalary), 0), { compact: true })} accent="gold" />
        <StatTile icon={Wallet} label={t("staff.tile.tax")} value={formatMoney(active.reduce((s, e) => s + num(e.incomeTax), 0), { compact: true })} accent="muted" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder={t("staff.search")} /><ExportButton name="staff" headers={[t("staff.csv.no"), t("common.name"), t("staff.csv.designation"), t("staff.csv.department"), t("staff.csv.joined"), t("staff.csv.gross"), t("common.status")]} rows={shown.map((e) => [e.empNo, e.fullName, e.designation, e.department, e.joinDate, num(e.grossSalary), t(`staff.status.${e.status}`)])} /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">{t("staff.col.employee")}</th><th className="pb-2.5 font-medium">{t("staff.col.role")}</th><th className="pb-2.5 font-medium">{t("staff.col.joined")}</th>
                <th className="pb-2.5 pe-3 text-end font-medium">{t("staff.col.pay")}</th><th className="pb-2.5 font-medium">{t("common.status")}</th><th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : shown.map((e) => (
                <tr key={e.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                  <td className="py-2.5"><p className="font-medium">{e.fullName}</p><p className="text-xs text-muted-foreground"><span className="font-mono">{e.empNo}</span>{e.phone ? ` · ${e.phone}` : ""}</p></td>
                  <td className="py-2.5"><p>{e.designation ?? "—"}</p><p className="text-xs text-muted-foreground">{e.department}</p></td>
                  <td className="py-2.5 text-muted-foreground">{formatDate(e.joinDate)}</td>
                  <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{formatMoney(num(e.grossSalary))}</td>
                  <td className="py-2.5"><Badge variant="outline" className={e.status === "active" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"}>{t(`staff.status.${e.status}`)}</Badge></td>
                  <td className="py-2.5 text-end">
                    {can("staff.edit") && <div className="flex justify-end gap-1.5"><AttachmentsButton entityType="employee" entityId={e.id} title={e.fullName} iconOnly canEdit categories={["CNIC copy", "Contract", "Qualification", "Other"]} /><Button size="sm" variant="outline" onClick={() => setEditing(e)}>{t("common.edit")}</Button>{e.status === "active" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setLeaving(e)}>{t("staff.left")}</Button>}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.isLoading && shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{all.length === 0 ? t("staff.emptyAll") : t("staff.emptySearch")}</p>}
        </div>
      </Card>
      <EmployeeDialog target={editing} onClose={() => setEditing(null)} />
      <ReasonDialog open={!!leaving} onOpenChange={(o) => !o && setLeaving(null)} icon={UserSquare2} title={leaving ? t("staff.leave.title", { name: leaving.fullName }) : t("staff.leave.titleFallback")} description={t("staff.leave.description")} submitLabel={t("staff.leave.submit")} reasonLabel={t("staff.leave.reason")} dateLabel={t("staff.leave.date")}
        onSubmit={async (reason, date) => { await updateEmployee(company.id, leaving!.id, { status: /terminat|fired|dismiss/i.test(reason) ? "terminated" : "resigned", leftOn: date, notes: `Left: ${reason}` }); await invalidate(); toast.success(t("staff.leave.done")); }} />
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
  const t = useT();
  const [f, setF] = React.useState({
    fullName: employee?.fullName ?? "", phone: employee?.phone ?? "", designation: employee?.designation ?? "", department: employee?.department ?? "", joinDate: employee?.joinDate ?? todayIso(),
    basic: employee?.basicSalary ?? "", house: employee?.houseAllowance ?? "", transport: employee?.transportAllowance ?? "", other: employee?.otherAllowance ?? "", tax: employee?.incomeTax ?? "", bankAccountNo: employee?.bankAccountNo ?? "",
  });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const gross = num(f.basic) + num(f.house) + num(f.transport) + num(f.other);
  return (
    <FormDialog open={open} onOpenChange={(o) => !o && onClose()} icon={UserPlus} title={employee ? t("staff.form.edit", { name: employee.fullName }) : t("staff.add")} description={t("staff.form.description")}
      submitLabel={employee ? t("staff.form.saveChanges") : t("staff.add")} submitDisabled={f.fullName.trim().length < 2 || !f.joinDate}
      onSubmit={async () => {
        const body = { fullName: f.fullName.trim(), phone: f.phone.trim() || undefined, designation: f.designation.trim() || undefined, department: f.department.trim() || undefined, joinDate: f.joinDate,
          basicSalary: f.basic || "0", houseAllowance: f.house || "0", transportAllowance: f.transport || "0", otherAllowance: f.other || "0", incomeTax: f.tax || "0", bankAccountNo: f.bankAccountNo.trim() || undefined };
        if (employee) await updateEmployee(companyId, employee.id, body); else await createEmployee(companyId, body);
        await invalidate();
        toast.success(employee ? t("staff.form.saved") : t("staff.form.added"));
      }}>
      <FieldRow>
        <Field label={t("staff.form.fullName")}><Input value={f.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
        <Field label={t("common.phone")}><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" /></Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("staff.form.designation")}><Input value={f.designation} onChange={(e) => set("designation", e.target.value)} placeholder={t("staff.form.designationPlaceholder")} /></Field>
        <Field label={t("staff.form.department")}><Input value={f.department} onChange={(e) => set("department", e.target.value)} placeholder={t("staff.form.departmentPlaceholder")} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("staff.form.joinedOn")}><Input type="date" value={f.joinDate} onChange={(e) => set("joinDate", e.target.value)} /></Field>
        <Field label={t("staff.form.bankAccount")}><Input value={f.bankAccountNo} onChange={(e) => set("bankAccountNo", e.target.value)} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("staff.form.basic")}><AmountInput value={f.basic} onChange={(v) => set("basic", v)} /></Field>
        <Field label={t("staff.form.house")}><AmountInput value={f.house} onChange={(v) => set("house", v)} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("staff.form.transport")}><AmountInput value={f.transport} onChange={(v) => set("transport", v)} /></Field>
        <Field label={t("staff.form.other")}><AmountInput value={f.other} onChange={(v) => set("other", v)} /></Field>
      </FieldRow>
      <Field label={t("staff.form.tax")}><AmountInput value={f.tax} onChange={(v) => set("tax", v)} /></Field>
      <p className="text-xs text-muted-foreground">{t("staff.form.gross", { amount: formatMoney(gross) })}</p>
    </FormDialog>
  );
}
