"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleBadge } from "@/components/administration/role-badge";
import { useRoles } from "@/lib/hooks/use-data";
import type { SystemUser } from "@/lib/types";
import { toast } from "sonner";

const DEPARTMENTS = ["Management", "Finance", "Sales", "Operations", "Projects"] as const;

export function NewUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: roles } = useRoles();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [department, setDepartment] = React.useState("");

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setRoleId("");
    setDepartment("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const id = `user-${Date.now()}`;
    const username = name.toLowerCase().trim().replace(/\s+/g, ".");
    const newUser: SystemUser = {
      id,
      name,
      username,
      email,
      phone,
      avatarUrl: `https://i.pravatar.cc/80?u=${id}`,
      roleId,
      department,
      status: "invited",
      lastActiveAt: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString().slice(0, 10),
    };

    queryClient.setQueryData<SystemUser[]>(["systemUsers"], (old = []) => [newUser, ...old]);
    const role = roles?.find((r) => r.id === roleId);
    toast.success(`Invitation sent to ${name}`, {
      description: role ? `${role.name} · ${department}` : department,
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={UserPlus}
      title="Invite User"
      description="Give a team member their own login and a role that scopes what they can see."
      submitLabel="Send Invite"
      submitDisabled={!name || !email || !roleId || !department}
      onSubmit={handleSubmit}
    >
      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sana Malik" />
      </Field>

      <FieldRow>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sana.malik@company.pk"
          />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03001234567" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Role">
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {roles?.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">{r.name}</span>
                </SelectItem>
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

      {roleId && roles && (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
          <span className="mr-1.5">Will be added as</span>
          <RoleBadge role={roles.find((r) => r.id === roleId)!} />
        </div>
      )}
    </FormDialog>
  );
}
