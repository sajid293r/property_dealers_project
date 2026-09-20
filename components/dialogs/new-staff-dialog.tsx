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

const ROLES: StaffRole[] = ["admin", "manager", "agent", "accountant", "dealer"];
const DEPARTMENTS = ["Sales", "Accounts", "Marketing", "Operations"] as const;

export function NewStaffDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
    toast.success(`${name} added to staff`, { description: `${department} · ${role}` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={UserSquare2}
      title="Add Staff"
      description="Bring a new team member onto the roster."
      submitLabel="Add Staff"
      submitDisabled={!name || !role || !department || !salary}
      onSubmit={handleSubmit}
    >
      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bilal Khan" />
      </Field>

      <FieldRow>
        <Field label="Role">
          <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Department">
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03001234567" />
        </Field>
        <Field label="Monthly salary (PKR)">
          <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="60000" />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
