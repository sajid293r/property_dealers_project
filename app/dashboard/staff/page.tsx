"use client";

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

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Staff</h1>
          <p className="text-sm text-muted-foreground">{staff?.length ?? 0} team members</p>
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          Add Staff
        </Button>
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
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-full border border-border/60">
                      <Image src={s.avatarUrl} alt={s.name} fill sizes="44px" className="object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.name}</p>
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
                </Card>
              </motion.div>
            ))}
      </div>

      <NewStaffDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
