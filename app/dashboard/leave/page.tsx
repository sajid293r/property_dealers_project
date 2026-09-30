"use client";

import { Palmtree as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarCheck2, CalendarDays, Clock, MoreHorizontal, Palmtree, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { LeaveStatusBadge, LeaveTypeBadge } from "@/components/leave/leave-badges";
import { NewLeaveRequestDialog } from "@/components/dialogs/new-leave-request-dialog";
import { useStaff, useLeaveRequests } from "@/lib/hooks/use-data";
import { MOCK_TODAY_ISO } from "@/lib/mock-data/seed";
import { formatDate } from "@/lib/format";
import type { LeaveRequest, LeaveStatus } from "@/lib/types";
import { toast } from "sonner";

export default function LeavePage() {
  const { data: requests, isLoading } = useLeaveRequests();
  const { data: staff } = useStaff();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<LeaveStatus | "all">("all");
  const [open, setOpen] = React.useState(false);

  const filtered = (requests ?? []).filter((r) => {
    const member = staff?.find((s) => s.id === r.staffId);
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const matchesSearch = `${member?.name ?? ""} ${r.type} ${r.reason}`.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const stats = React.useMemo(() => {
    const all = requests ?? [];
    const onLeaveToday = all.filter(
      (r) => r.status === "approved" && r.fromDate <= MOCK_TODAY_ISO && r.toDate >= MOCK_TODAY_ISO,
    ).length;
    const thisMonth = MOCK_TODAY_ISO.slice(0, 7);
    return {
      pending: all.filter((r) => r.status === "pending").length,
      onLeaveToday,
      approvedThisMonth: all.filter((r) => r.status === "approved" && r.fromDate.slice(0, 7) === thisMonth).length,
      totalDaysThisYear: all
        .filter((r) => r.status === "approved" && r.fromDate.slice(0, 4) === MOCK_TODAY_ISO.slice(0, 4))
        .reduce((sum, r) => sum + r.days, 0),
    };
  }, [requests]);

  function decide(request: LeaveRequest, status: "approved" | "rejected") {
    const today = new Date().toISOString().slice(0, 10);
    queryClient.setQueryData<LeaveRequest[]>(["leaveRequests"], (old = []) =>
      old.map((r) => (r.id === request.id ? { ...r, status, approvedBy: "You", approvedAt: today } : r)),
    );
    const member = staff?.find((s) => s.id === request.staffId);
    toast.success(
      status === "approved" ? `Leave approved for ${member?.name}` : `Leave rejected for ${member?.name}`,
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="People"
        title="Leave"
        description={<>{requests?.length ?? 0} requests across the team</>}
        actions={<>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          New Leave Request
        </Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Clock} label="Pending requests" value={stats.pending} accent="warning" />
        <StatTile icon={Palmtree} label="On leave today" value={stats.onLeaveToday} accent="primary" />
        <StatTile icon={CalendarCheck2} label="Approved this month" value={stats.approvedThisMonth} accent="success" />
        <StatTile icon={CalendarDays} label="Days taken this year" value={stats.totalDaysThisYear} />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search staff, type, reason..." />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LeaveStatus | "all")}>
            <SelectTrigger size="sm" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Staff</th>
                <th className="pb-2.5 font-medium">Type</th>
                <th className="pb-2.5 font-medium">Dates</th>
                <th className="pb-2.5 font-medium">Days</th>
                <th className="pb-2.5 font-medium">Reason</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={7} className="py-2.5"><Skeleton className="h-9 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((r, i) => {
                    const member = staff?.find((s) => s.id === r.staffId);
                    return (
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                        className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                      >
                        <td className="py-2.5 font-medium">{member?.name ?? "—"}</td>
                        <td className="py-2.5"><LeaveTypeBadge type={r.type} /></td>
                        <td className="py-2.5 text-muted-foreground">
                          {formatDate(r.fromDate)} – {formatDate(r.toDate)}
                        </td>
                        <td className="py-2.5 tabular-nums">{r.days}</td>
                        <td className="py-2.5 max-w-[220px] truncate text-muted-foreground">{r.reason}</td>
                        <td className="py-2.5"><LeaveStatusBadge status={r.status} /></td>
                        <td className="py-2.5 text-right">
                          {r.status === "pending" ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => decide(r, "approved")}>Approve</DropdownMenuItem>
                                <DropdownMenuItem variant="destructive" onSelect={() => decide(r, "rejected")}>
                                  Reject
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-xs text-muted-foreground">{r.approvedBy}</span>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No leave requests match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <NewLeaveRequestDialog open={open} onOpenChange={setOpen} />
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
  accent?: "primary" | "success" | "warning";
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
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
