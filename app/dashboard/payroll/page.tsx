"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  Banknote,
  UserSquare2,
  HandCoins,
  TimerReset,
  CheckCircle2,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RecordAdvanceDialog } from "@/components/dialogs/record-advance-dialog";
import { useStaff, useAccounts } from "@/lib/hooks/use-data";
import { formatPkr } from "@/lib/format";
import type { Account, StaffMember, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function PayrollPage() {
  const { data: staff, isLoading } = useStaff();
  const { data: accounts } = useAccounts();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [department, setDepartment] = React.useState("all");
  const [advanceOpen, setAdvanceOpen] = React.useState(false);
  const [paidIds, setPaidIds] = React.useState<Set<string>>(new Set());

  const departments = React.useMemo(
    () => Array.from(new Set((staff ?? []).map((s) => s.department))),
    [staff],
  );

  const filtered = React.useMemo(() => {
    return (staff ?? []).filter((s) => {
      if (department !== "all" && s.department !== department) return false;
      if (search && !`${s.name} ${s.role}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [staff, search, department]);

  const totalPayroll = staff?.reduce((sum, s) => sum + s.salary, 0) ?? 0;
  const outstandingAdvances = staff?.reduce((sum, s) => sum + Math.max(s.balance, 0), 0) ?? 0;
  const pendingCount = (staff?.length ?? 0) - paidIds.size;

  function netPayable(s: StaffMember) {
    return Math.max(s.salary - Math.max(s.balance, 0), 0);
  }

  function disburse(s: StaffMember) {
    const cashAccount = accounts?.find((a) => a.code === "AC-001") ?? accounts?.[0];
    if (!cashAccount) return;
    const net = netPayable(s);

    queryClient.setQueryData<Account[]>(["accounts"], (old = []) =>
      old.map((a) => (a.id === cashAccount.id ? { ...a, balance: a.balance - net } : a)),
    );
    queryClient.setQueryData<Transaction[]>(["transactions"], (old = []) => [
      {
        id: `txn-${Date.now()}-${s.id}`,
        accountId: cashAccount.id,
        kind: "debit",
        amount: net,
        title: `Salary — ${s.name}`,
        category: "Salary",
        date: new Date().toISOString().slice(0, 10),
        confirmed: true,
      },
      ...old,
    ]);

    setPaidIds((prev) => new Set(prev).add(s.id));
    toast.success(`${formatPkr(net)} disbursed to ${s.name}`);
  }

  function disburseAll() {
    const pending = filtered.filter((s) => !paidIds.has(s.id));
    pending.forEach(disburse);
    if (pending.length > 0) {
      toast.success(`Payroll disbursed for ${pending.length} staff member${pending.length > 1 ? "s" : ""}`);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Salary disbursement, loans and advances tied to each staff ledger
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setAdvanceOpen(true)}>
            <PlusCircle className="size-4" />
            Record Advance
          </Button>
          <Button className="gap-1.5" onClick={disburseAll} disabled={pendingCount === 0}>
            <CheckCircle2 className="size-4" />
            Disburse All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Monthly Payroll"
          value={totalPayroll}
          format={(n) => formatPkr(n, { compact: true })}
          icon={Banknote}
          index={0}
        />
        <KpiCard
          label="Staff on Payroll"
          value={staff?.length ?? 0}
          format={(n) => n.toString()}
          icon={UserSquare2}
          index={1}
        />
        <KpiCard
          label="Outstanding Advances"
          value={outstandingAdvances}
          format={(n) => formatPkr(n, { compact: true })}
          icon={HandCoins}
          index={2}
          accent="gold"
        />
        <KpiCard
          label="Pending Disbursements"
          value={pendingCount}
          format={(n) => n.toString()}
          icon={TimerReset}
          index={3}
        />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search name, role..." />
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Staff</th>
                <th className="pb-2.5 font-medium">Role</th>
                <th className="pb-2.5 font-medium">Base Salary</th>
                <th className="pb-2.5 font-medium">Advance Balance</th>
                <th className="pb-2.5 font-medium">Net Payable</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={7} className="py-2.5"><Skeleton className="h-12 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((s, i) => {
                    const paid = paidIds.has(s.id);
                    return (
                      <motion.tr
                        key={s.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                        className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                      >
                        <td className="py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="relative size-9 shrink-0 overflow-hidden rounded-full border border-border/60">
                              <Image src={s.avatarUrl} alt={s.name} fill sizes="36px" className="object-cover" />
                            </div>
                            <div>
                              <p className="font-medium leading-tight">{s.name}</p>
                              <p className="text-[11px] text-muted-foreground">{s.department}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <Badge variant="outline" className="capitalize">{s.role}</Badge>
                        </td>
                        <td className="py-2.5 tabular-nums font-medium">{formatPkr(s.salary)}</td>
                        <td
                          className={cn(
                            "py-2.5 tabular-nums",
                            s.balance > 0 ? "text-warning font-medium" : "text-muted-foreground",
                          )}
                        >
                          {s.balance > 0 ? formatPkr(s.balance) : "—"}
                        </td>
                        <td className="py-2.5 tabular-nums font-medium text-primary">
                          {formatPkr(netPayable(s))}
                        </td>
                        <td className="py-2.5">
                          {paid ? (
                            <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
                              Pending
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={paid}
                            onClick={() => disburse(s)}
                          >
                            {paid ? "Disbursed" : "Disburse"}
                          </Button>
                        </td>
                      </motion.tr>
                    );
                  })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No staff match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <RecordAdvanceDialog open={advanceOpen} onOpenChange={setAdvanceOpen} />
    </div>
  );
}
