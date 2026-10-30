"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserSquare2 } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffMember, StaffRole } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

const ROLES: StaffRole[] = ["admin", "manager", "agent", "accountant", "dealer"];
const DEPARTMENTS = ["Sales", "Accounts", "Marketing", "Operations"] as const;

export function NewStaffDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<StaffRole | "">("");
  const [department, setDepartment] = React.useState<string>("");
  const [phone, setPhone] = React.useState("");
  const [salary, setSalary] = React.useState("");

  function resetForm() {
    setName("");
    setRole("");
    setDepartment("");
    setPhone("");
    setSalary("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const id = `staff-${Date.now()}`;
    const newStaff: StaffMember = {
      id,
      name,
      role: role as StaffRole,
      phone,
      department,
      salary: Number(salary) || 0,
      balance: 0,
      joinedAt: new Date().toISOString().slice(0, 10),
      avatarUrl: `https://i.pravatar.cc/80?u=${id}`,
    };

    queryClient.setQueryData<StaffMember[]>(["staff"], (old = []) => [newStaff, ...old]);
    toast.success(t("dm.staff.added", { name }), { description: `${department} · ${role}` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={UserSquare2}
      title={t("dm.add_staff")}
      description={t("dm.bring_a_new_team_member")}
      submitLabel={t("dm.add_staff")}
      submitDisabled={!name || !role || !department || !salary}
      onSubmit={handleSubmit}
    >
      <Field label={t("customers.new.fullName")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("dm.bilal_khan")} />
      </Field>

      <FieldRow>
        <Field label={t("adm.users.col.role")}>
          <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("dm.select_role")} /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("staff.csv.department")}>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("dm.select_department")} /></SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label={t("common.phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03001234567" />
        </Field>
        <Field label={t("dm.monthly_salary_pkr")}>
          <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="60000" />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
