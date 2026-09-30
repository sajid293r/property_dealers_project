"use client";

import { UserCog as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import * as React from "react";
import { motion } from "framer-motion";
import { MoreHorizontal, ShieldCheck, UserPlus, UserCheck, UserX, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { NewUserDialog } from "@/components/dialogs/new-user-dialog";
import { RoleBadge } from "@/components/administration/role-badge";
import { UserStatusBadge } from "@/components/administration/user-status-badge";
import { UserDetailSheet } from "@/components/administration/user-detail-sheet";
import { useSystemUsers, useRoles } from "@/lib/hooks/use-data";
import { formatDate } from "@/lib/format";
import type { SystemUser } from "@/lib/types";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function UsersPage() {
  const { data: users, isLoading } = useSystemUsers();
  const { data: roles } = useRoles();

  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [activeUser, setActiveUser] = React.useState<SystemUser | null>(null);

  const filtered = (users ?? []).filter((u) => {
    const matchesSearch = `${u.name} ${u.email} ${u.username}`.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.roleId === roleFilter;
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const stats = React.useMemo(() => {
    const all = users ?? [];
    return {
      total: all.length,
      active: all.filter((u) => u.status === "active").length,
      invited: all.filter((u) => u.status === "invited").length,
      suspended: all.filter((u) => u.status === "suspended").length,
    };
  }, [users]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="Administration"
        title="Users"
        description="Everyone with a login to this workspace"
        actions={<>
        <Button className="gap-1.5" onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Invite User
        </Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={UsersIcon} label="Total users" value={stats.total} />
        <StatTile icon={UserCheck} label="Active" value={stats.active} accent="success" />
        <StatTile icon={ShieldCheck} label="Invited" value={stats.invited} accent="warning" />
        <StatTile icon={UserX} label="Suspended" value={stats.suspended} accent="destructive" />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search name, email, username..." />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[168px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roles?.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="invited">Invited</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">User</th>
                <th className="pb-2.5 font-medium">Role</th>
                <th className="pb-2.5 font-medium">Department</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium">Last active</th>
                <th className="pb-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={6} className="py-2.5"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((u, i) => {
                    const role = roles?.find((r) => r.id === u.roleId);
                    return (
                      <motion.tr
                        key={u.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                        className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                        onClick={() => setActiveUser(u)}
                      >
                        <td className="py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar size="sm">
                              <AvatarImage src={u.avatarUrl} alt={u.name} />
                              <AvatarFallback>{initials(u.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{u.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5">{role && <RoleBadge role={role} />}</td>
                        <td className="py-2.5 text-muted-foreground">{u.department}</td>
                        <td className="py-2.5"><UserStatusBadge status={u.status} /></td>
                        <td className="py-2.5 text-muted-foreground">{formatDate(u.lastActiveAt)}</td>
                        <td className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setActiveUser(u)}>View detail</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </motion.tr>
                    );
                  })}
            </tbody>
          </table>
          {!isLoading && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No users match your filters.</p>
          )}
        </div>
      </Card>

      <NewUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <UserDetailSheet user={activeUser} open={!!activeUser} onOpenChange={(o) => !o && setActiveUser(null)} />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: "primary" | "success" | "warning" | "destructive";
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  }[accent];

  return (
    <Card className="group/stat flex-row items-center gap-3 p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:ring-gold/40">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover/stat:-rotate-6 group-hover/stat:scale-110 ${accentClasses}`}>
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0">
        <p className="font-heading text-lg font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
