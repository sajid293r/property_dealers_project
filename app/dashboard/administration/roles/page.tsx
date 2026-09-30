"use client";

import { ShieldCheck as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import * as React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NewRoleDialog } from "@/components/dialogs/new-role-dialog";
import { RoleDetailSheet } from "@/components/administration/role-detail-sheet";
import { useRoles, useSystemUsers } from "@/lib/hooks/use-data";
import { ROLE_COLOR_CLASSES, moduleCount, PERMISSION_MODULES } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function RolesPage() {
  const { data: roles, isLoading } = useRoles();
  const { data: users } = useSystemUsers();

  const [newRoleOpen, setNewRoleOpen] = React.useState(false);
  const [activeRole, setActiveRole] = React.useState<UserRole | null>(null);

  const memberCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users ?? []) counts[u.roleId] = (counts[u.roleId] ?? 0) + 1;
    return counts;
  }, [users]);

  const totalModules = PERMISSION_MODULES.length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="Administration"
        title="Roles &amp; Permissions"
        description={<>{roles?.length ?? 0} roles · default org-chart roles plus anything custom you add</>}
        actions={<>
        <Button className="gap-1.5" onClick={() => setNewRoleOpen(true)}>
          <ShieldPlus className="size-4" />
          New Role
        </Button>
        </>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          : roles?.map((role, i) => {
              const palette = ROLE_COLOR_CLASSES[role.color];
              const count = moduleCount(role.permissions);
              return (
                <motion.button
                  key={role.id}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.04, duration: 0.4 }}
                  onClick={() => setActiveRole(role)}
                  className="text-left"
                >
                  <Card className="h-full p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/[0.06]">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
                          palette.bg,
                          palette.text,
                          palette.ring,
                        )}
                      >
                        <ShieldCheck className="size-4.5" />
                      </div>
                      {role.isSystem && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          System
                        </span>
                      )}
                    </div>

                    <h3 className="mt-3 font-heading text-base font-semibold">{role.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {role.description}
                    </p>

                    <div className="mt-3.5 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" />
                        {memberCounts[role.id] ?? 0} {memberCounts[role.id] === 1 ? "member" : "members"}
                      </span>
                      <span>{count} / {totalModules} modules</span>
                    </div>
                  </Card>
                </motion.button>
              );
            })}
      </div>

      <NewRoleDialog open={newRoleOpen} onOpenChange={setNewRoleOpen} />
      <RoleDetailSheet
        role={activeRole}
        memberCount={activeRole ? (memberCounts[activeRole.id] ?? 0) : 0}
        open={!!activeRole}
        onOpenChange={(o) => !o && setActiveRole(null)}
      />
    </div>
  );
}
