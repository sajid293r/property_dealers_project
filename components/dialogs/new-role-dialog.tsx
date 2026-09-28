"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldPlus } from "lucide-react";
import { FormDialog, Field } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PermissionMatrix } from "@/components/administration/permission-matrix";
import { emptyMatrix, ROLE_COLOR_CLASSES, type RoleColor } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const COLOR_OPTIONS: RoleColor[] = ["primary", "gold", "success", "warning", "destructive", "violet", "blue"];

export function NewRoleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState<RoleColor>("blue");
  const [permissions, setPermissions] = React.useState(emptyMatrix());

  function resetForm() {
    setName("");
    setDescription("");
    setColor("blue");
    setPermissions(emptyMatrix());
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const id = `custom-${Date.now()}`;
    const newRole: UserRole = {
      id,
      name,
      description: description || "Custom role.",
      color,
      isSystem: false,
      permissions,
    };

    queryClient.setQueryData<UserRole[]>(["roles"], (old = []) => [...old, newRole]);
    toast.success(`${name} role created`, { description: "Assign it to users from the Users screen." });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={ShieldPlus}
      title="New Role"
      description="Build a custom access profile for a job function this system doesn't already cover."
      submitLabel="Create Role"
      submitDisabled={!name}
      onSubmit={handleSubmit}
    >
      <Field label="Role name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Site Supervisor" />
      </Field>

      <Field label="Description">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this role is responsible for..."
          rows={2}
        />
      </Field>

      <Field label="Badge colour">
        <Select value={color} onValueChange={(v) => setColor(v as RoleColor)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLOR_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                <span className="flex items-center gap-2 capitalize">
                  <span className={cn("size-2.5 rounded-full", ROLE_COLOR_CLASSES[c].text.replace("text-", "bg-"))} />
                  {c}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Permissions">
        <PermissionMatrix value={permissions} onChange={setPermissions} compact />
      </Field>
    </FormDialog>
  );
}
