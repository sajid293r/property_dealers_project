"use client";

import { UserSquare2 as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { UserSquare2 as KpiUserSquare2, Banknote as KpiBanknote, Building as KpiBuilding, Calculator as KpiCalculator } from "lucide-react";
import * as React from "react";
import { motion } from "framer-motion";
import { PlusCircle } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NewStaffDialog } from "@/components/dialogs/new-staff-dialog";
import { useStaff } from "@/lib/hooks/use-data";
import { formatPkr, formatDate } from "@/lib/format";

export default function StaffPage() {
  const { data: staff, isLoading } = useStaff();
  const [open, setOpen] = React.useState(false);

  const payroll = staff?.reduce((s, m) => s + m.salary, 0) ?? 0;
  const departments = new Set((staff ?? []).map((m) => m.department)).size;
  const avgSalary = staff?.length ? Math.round(payroll / staff.length) : 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="People"
        title="Staff"
        description={<>{staff?.length ?? 0} team members</>}
        actions={<>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          Add Staff
        </Button>
        </>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Team members" value={staff?.length ?? 0} format={(n) => n.toString()} icon={KpiUserSquare2} index={0} />
        <KpiCard label="Monthly payroll" value={payroll} format={(n) => formatPkr(n, { compact: true })} icon={KpiBanknote} accent="gold" index={1} />
        <KpiCard label="Departments" value={departments} format={(n) => n.toString()} icon={KpiBuilding} index={2} />
        <KpiCard label="Average salary" value={avgSalary} format={(n) => formatPkr(n, { compact: true })} icon={KpiCalculator} accent="gold" index={3} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          : staff?.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.04, duration: 0.4 }}
              >
                <Card className="group/staff gap-0 p-0 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/[0.1] hover:ring-gold/40">
                  <div className="surface-hero relative h-16 overflow-hidden">
                    <div className="absolute -right-6 -top-8 size-28 rounded-full bg-gold/30 blur-2xl transition-transform duration-500 group-hover/staff:scale-150" />
                    <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "14px 14px" }} />
                  </div>
                  <div className="-mt-7 px-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-full border-[3px] border-card shadow-md ring-2 ring-gold/50 transition-transform duration-300 group-hover/staff:scale-110">
                      <Image src={s.avatarUrl} alt={s.name} fill sizes="56px" className="object-cover" />
                    </div>
                    <div className="min-w-0 pt-8">
                      <p className="truncate font-heading font-semibold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.department}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="outline" className="capitalize">{s.role}</Badge>
                    <span className="text-xs text-muted-foreground">Since {formatDate(s.joinedAt)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
                    <span className="text-muted-foreground">Salary</span>
                    <span className="tabular-nums font-medium">{formatPkr(s.salary)}</span>
                  </div>
                  </div>
                </Card>
              </motion.div>
            ))}
      </div>

      <NewStaffDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
