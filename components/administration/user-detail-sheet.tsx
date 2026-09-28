"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, KeyRound, Mail, Phone, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RoleBadge } from "@/components/administration/role-badge";
import { UserStatusBadge } from "@/components/administration/user-status-badge";
import { PermissionMatrix } from "@/components/administration/permission-matrix";
import { useRoles } from "@/lib/hooks/use-data";
import { formatDate } from "@/lib/format";
import type { SystemUser } from "@/lib/types";
import { toast } from "sonner";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserDetailSheet({
  user,
  open,
  onOpenChange,
}: {
  user: SystemUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: roles } = useRoles();
  const role = roles?.find((r) => r.id === user?.roleId);

  function toggleStatus() {
    if (!user) return;
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    queryClient.setQueryData<SystemUser[]>(["systemUsers"], (old = []) =>
      old.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u)),
    );
    toast.success(nextStatus === "suspended" ? `${user.name} suspended` : `${user.name} reactivated`);
    onOpenChange(false);
  }

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="sr-only">
          <SheetTitle>{user.name}</SheetTitle>
          <SheetDescription>User detail and permissions</SheetDescription>
        </SheetHeader>

        <div className="relative isolate overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/[0.07] via-transparent to-gold/[0.06] px-6 py-6">
          <div className="flex items-start gap-3.5">
            <Avatar size="lg" className="ring-2 ring-background">
              <AvatarImage src={user.avatarUrl} alt={user.name} />
              <AvatarFallback>{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 pt-0.5">
              <h2 className="font-heading text-lg font-semibold">{user.name}</h2>
              <p className="text-xs text-muted-foreground">@{user.username}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {role && <RoleBadge role={role} showSystemIcon />}
                <UserStatusBadge status={user.status} />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate text-foreground">{user.email}</span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Phone className="size-3.5 shrink-0" />
              <span className="text-foreground">{user.phone}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-xs">
            <div>
              <p className="text-muted-foreground">Department</p>
              <p className="mt-0.5 font-medium text-foreground">{user.department}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last active</p>
              <p className="mt-0.5 font-medium text-foreground">{formatDate(user.lastActiveAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Member since</p>
              <p className="mt-0.5 font-medium text-foreground">{formatDate(user.createdAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">User ID</p>
              <p className="mt-0.5 font-mono font-medium text-foreground">{user.id}</p>
            </div>
          </div>

          <Separator />

          <div>
            <div className="mb-2.5 flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
              <h3 className="text-sm font-medium">Access via {role?.name ?? "role"}</h3>
            </div>
            {role && <PermissionMatrix value={role.permissions} compact />}
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Account actions</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => toast.success(`Password reset link sent to ${user.email}`)}
              >
                <KeyRound className="size-3.5" />
                Reset password
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={toggleStatus}
              >
                {user.status === "suspended" ? (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    Reactivate
                  </>
                ) : (
                  <>
                    <Ban className="size-3.5" />
                    Suspend
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
