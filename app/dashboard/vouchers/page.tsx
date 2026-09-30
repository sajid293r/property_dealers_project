"use client";

import { ScrollText as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  FileEdit,
  MoreHorizontal,
  Plus,
  ScrollText,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { VoucherTypeBadge } from "@/components/vouchers/voucher-type-badge";
import { VoucherStatusBadge } from "@/components/vouchers/voucher-status-badge";
import { useVouchers } from "@/lib/hooks/use-data";
import { VOUCHER_TYPES, voucherTotal, voucherTypeMeta } from "@/lib/vouchers";
import { formatDate, formatPkr } from "@/lib/format";
import type { Voucher, VoucherStatus, VoucherType } from "@/lib/types";
import { toast } from "sonner";

type TypeFilter = "all" | VoucherType;

export default function VouchersPage() {
  const { data: vouchers, isLoading } = useVouchers();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = React.useState<VoucherStatus | "all">("all");
  const [search, setSearch] = React.useState("");

  const stats = React.useMemo(() => {
    const all = vouchers ?? [];
    return {
      total: all.length,
      pending: all.filter((v) => v.status === "pending").length,
      draft: all.filter((v) => v.status === "draft").length,
      value: all.filter((v) => v.status === "approved").reduce((s, v) => s + voucherTotal(v.lines), 0),
    };
  }, [vouchers]);

  const filtered = (vouchers ?? []).filter((v) => {
    const matchesType = typeFilter === "all" || v.type === typeFilter;
    const matchesStatus = statusFilter === "all" || v.status === statusFilter;
    const matchesSearch = `${v.number} ${v.description} ${v.partyName ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  function decide(voucher: Voucher, status: "approved" | "rejected") {
    queryClient.setQueryData<Voucher[]>(["vouchers"], (old = []) =>
      old.map((v) =>
        v.id === voucher.id
          ? { ...v, status, approvedBy: "You", approvedAt: new Date().toISOString().slice(0, 10) }
          : v,
      ),
    );
    toast.success(status === "approved" ? `${voucher.number} approved` : `${voucher.number} rejected`);
  }

  function deleteDraft(voucher: Voucher) {
    queryClient.setQueryData<Voucher[]>(["vouchers"], (old = []) => old.filter((v) => v.id !== voucher.id));
    toast.success(`${voucher.number} deleted`);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="Finance"
        title="Vouchers"
        description={<>{vouchers?.length ?? 0} vouchers · cash, bank &amp; journal entries</>}
        actions={<>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="size-4" />
              New Voucher
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {VOUCHER_TYPES.map((t) => (
              <DropdownMenuItem key={t.type} asChild>
                <Link href={`/dashboard/vouchers/new?type=${t.type}`} className="gap-2.5 py-1.5">
                  <t.icon className="size-3.5 text-muted-foreground" />
                  <span className="flex-1">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.type}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={ScrollText} label="Total vouchers" value={stats.total} />
        <StatTile icon={Clock} label="Pending approval" value={stats.pending} accent="warning" />
        <StatTile icon={FileEdit} label="Drafts" value={stats.draft} accent="muted" />
        <StatTile icon={Wallet} label="Approved value" value={formatPkr(stats.value, { compact: true })} accent="success" />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              {VOUCHER_TYPES.map((t) => (
                <TabsTrigger key={t.type} value={t.type}>{t.type}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2.5">
            <DataTableSearch value={search} onChange={setSearch} placeholder="Search number, party, description..." />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as VoucherStatus | "all")}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Voucher</th>
                <th className="pb-2.5 font-medium">Date</th>
                <th className="pb-2.5 font-medium">Party / Description</th>
                <th className="pb-2.5 font-medium">Amount</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={6} className="py-2.5"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((v, i) => {
                    const meta = voucherTypeMeta(v.type);
                    return (
                      <motion.tr
                        key={v.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                        className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                        onClick={() => router.push(`/dashboard/vouchers/${v.id}`)}
                      >
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <VoucherTypeBadge type={v.type} />
                            <span className="font-mono font-medium">{v.number}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-muted-foreground">{formatDate(v.date)}</td>
                        <td className="py-2.5">
                          <p className="truncate font-medium">{v.partyName ?? meta.shortLabel}</p>
                          <p className="max-w-[280px] truncate text-xs text-muted-foreground">{v.description}</p>
                        </td>
                        <td className="py-2.5 tabular-nums font-medium">{formatPkr(voucherTotal(v.lines))}</td>
                        <td className="py-2.5"><VoucherStatusBadge status={v.status} /></td>
                        <td className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/vouchers/${v.id}`}>View detail</Link>
                              </DropdownMenuItem>
                              {v.status === "pending" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => decide(v, "approved")}>
                                    <CheckCircle2 className="text-success" />
                                    Approve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem variant="destructive" onSelect={() => decide(v, "rejected")}>
                                    <XCircle />
                                    Un-Approve (Reject)
                                  </DropdownMenuItem>
                                </>
                              )}
                              {v.status === "draft" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onSelect={() => deleteDraft(v)}>
                                    <Trash2 />
                                    Delete draft
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </motion.tr>
                    );
                  })}
            </tbody>
          </table>
          {!isLoading && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No vouchers match your filters.</p>
          )}
        </div>
      </Card>
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
  value: number | string;
  accent?: "primary" | "success" | "warning" | "muted";
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
    muted: "bg-muted text-muted-foreground",
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
