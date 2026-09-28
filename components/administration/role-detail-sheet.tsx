"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Save, ShieldCheck, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PermissionMatrix } from "@/components/administration/permission-matrix";
import { ROLE_COLOR_CLASSES, moduleCount, type PermissionMatrix as PermissionMatrixType } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function RoleDetailSheet({
  role,
  memberCount,
  open,
  onOpenChange,
}: {
  role: UserRole | null;
  memberCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<PermissionMatrixType | null>(role?.permissions ?? null);
  const [draftRoleId, setDraftRoleId] = React.useState<string | null>(role?.id ?? null);

  if (role && role.id !== draftRoleId) {
    setDraftRoleId(role.id);
    setDraft(role.permissions);
  }

  if (!role) return null;
  const palette = ROLE_COLOR_CLASSES[role.color];
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(role.permissions);

  function handleSave() {
    if (!role || !draft) return;
    queryClient.setQueryData<UserRole[]>(["roles"], (old = []) =>
      old.map((r) => (r.id === role.id ? { ...r, permissions: draft } : r)),
    );
    toast.success(`${role.name} permissions updated`);
  }

  function handleDuplicate() {
    if (!role) return;
    const id = `custom-${Date.now()}`;
    const copy: UserRole = {
      ...role,
      id,
      name: `${role.name} (Copy)`,
      isSystem: false,
      permissions: draft ?? role.permissions,
    };
    queryClient.setQueryData<UserRole[]>(["roles"], (old = []) => [...old, copy]);
    toast.success(`Duplicated as "${copy.name}"`, { description: "Edit it freely — this copy isn't a system role." });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="sr-only">
          <SheetTitle>{role.name}</SheetTitle>
          <SheetDescription>Role permissions</SheetDescription>
        </SheetHeader>

        <div className="relative isolate overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/[0.07] via-transparent to-gold/[0.06] px-6 py-6">
          <div className="flex items-start gap-3.5">
            <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl ring-1", palette.bg, palette.text, palette.ring)}>
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-lg font-semibold">{role.name}</h2>
                {role.isSystem && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    System role
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                {memberCount} {memberCount === 1 ? "member" : "members"} · {moduleCount(role.permissions)} modules
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-sm font-medium">Permissions</h3>
              {role.isSystem && (
                <span className="text-xs text-muted-foreground">System roles are read-only</span>
              )}
            </div>
            {draft && (
              <PermissionMatrix
                value={draft}
                onChange={role.isSystem ? undefined : setDraft}
                compact
              />
            )}
          </div>

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleDuplicate}>
              <Copy className="size-3.5" />
              Duplicate as custom role
            </Button>
            {!role.isSystem && (
              <Button size="sm" className="flex-1 gap-1.5" onClick={handleSave} disabled={!dirty}>
                <Save className="size-3.5" />
                Save changes
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
