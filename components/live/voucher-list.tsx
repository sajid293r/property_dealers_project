"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Clock, FileEdit, MoreHorizontal, Plus, ScrollText, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { LiveVoucherStatusBadge, LiveVoucherTypeBadge } from "@/components/live/voucher-badges";
import { StatTile } from "@/components/live/stat-tile";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { discardVoucher, listVouchers, num, type VoucherRow, type VoucherStatus, type VoucherType } from "@/lib/api/finance";
import { LIVE_VOUCHER_TYPES, liveVoucherMeta } from "@/lib/live-vouchers";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { ExportButton } from "@/components/live/export-button";

export interface VoucherListPreset {
  /** Only these voucher types (tabs and the New menu are limited to them). */
  types?: VoucherType[];
  eyebrow?: string;
  title?: string;
  description?: string;
  newLabel?: string;
  icon?: typeof ScrollText;
}

export function LiveVoucherList({ preset = {} }: { preset?: VoucherListPreset }) {
  const router = useRouter();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const allowed = React.useMemo(() => LIVE_VOUCHER_TYPES.filter((t) => !preset.types || preset.types.includes(t.type)), [preset.types]);
  const [type, setType] = React.useState<VoucherType | "all">("all");
  const [status, setStatus] = React.useState<VoucherStatus | "all">("all");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const scope = preset.types?.join(",") ?? "";
  const only = (rows: VoucherRow[]) => (preset.types ? rows.filter((r) => preset.types!.includes(r.type)) : rows);
  const all = useQuery({ queryKey: ["live", "vouchers", "all", scope], queryFn: async () => only(await listVouchers(company.id)), staleTime: 15_000 });
  const list = useQuery({
    queryKey: ["live", "vouchers", type, status, debounced, scope],
    queryFn: async () => only(await listVouchers(company.id, { type: type === "all" ? undefined : type, status: status === "all" ? undefined : status, search: debounced || undefined })),
    staleTime: 15_000,
  });

  const stats = React.useMemo(() => {
    const v = all.data ?? [];
    return {
      total: v.length,
      pending: v.filter((x) => x.status === "pending").length,
      draft: v.filter((x) => x.status === "draft").length,
      value: v.filter((x) => x.status === "approved").reduce((s, x) => s + num(x.total), 0),
    };
  }, [all.data]);

  async function discard(id: string, number: string) {
    try {
      await discardVoucher(company.id, id);
      await invalidate();
      toast.success(`${number} discarded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not discard it.");
    }
  }

  const groups = ["Cash & bank", "Sales", "Purchases", "Other"] as const;
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={preset.icon ?? ScrollText}
        eyebrow={preset.eyebrow ?? "Finance"}
        title={preset.title ?? "Vouchers"}
        description={preset.description ?? <>{stats.total} vouchers · cash, bank, sales, purchases &amp; journal entries</>}
        actions={
          can("accounts.create") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1.5"><Plus className="size-4" /> {preset.newLabel ?? "New Voucher"}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {groups.filter((g) => allowed.some((t) => t.group === g)).map((g, i) => (
                  <React.Fragment key={g}>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</DropdownMenuLabel>
                    {allowed.filter((t) => t.group === g).map((t) => (
                      <DropdownMenuItem key={t.type} asChild>
                        <Link href={`/dashboard/vouchers/new?type=${t.type}`} className="gap-2.5 py-1.5">
                          <t.icon className="size-3.5 text-muted-foreground" />
                          <span className="flex-1">{t.label}</span>
                          <span className="text-xs text-muted-foreground">{t.type}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={ScrollText} label="Total vouchers" value={stats.total} />
        <StatTile icon={Clock} label="Pending approval" value={stats.pending} accent="warning" />
        <StatTile icon={FileEdit} label="Drafts" value={stats.draft} accent="muted" />
        <StatTile icon={Wallet} label="Approved value" value={formatMoney(stats.value, { compact: true })} accent="success" />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <Tabs value={type} onValueChange={(v) => setType(v as VoucherType | "all")}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">All</TabsTrigger>
              {allowed.map((t) => <TabsTrigger key={t.type} value={t.type}>{t.type}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2.5">
            <DataTableSearch value={search} onChange={setSearch} placeholder="Search number, party, cheque no…" />
            <ExportButton name="vouchers" headers={["Voucher", "Type", "Date", "Party", "Bank", "Instrument", "Reference", "Narration", "Amount", "Status"]} rows={(list.data ?? []).map((v) => [v.number, v.type, v.date, v.partyName, v.bankName, v.instrumentNo, v.reference, v.description, num(v.total), v.status])} />
            <Select value={status} onValueChange={(v) => setStatus(v as VoucherStatus | "all")}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Voucher</th>
                <th className="pb-2.5 font-medium">Date</th>
                <th className="pb-2.5 font-medium">Party / Details</th>
                <th className="pb-2.5 pr-3 text-right font-medium">Amount</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40"><td colSpan={6} className="py-2.5"><Skeleton className="h-10 w-full" /></td></tr>
                  ))
                : (list.data ?? []).map((v, i) => {
                    const meta = liveVoucherMeta(v.type);
                    const detail = [v.bankName && `${v.bankName} ${v.bankAccountNo ?? ""}`.trim(), v.instrumentNo && `${v.instrumentType === "cheque" ? "Cheque" : "Ref"} ${v.instrumentNo}`, v.description].filter(Boolean).join(" · ");
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
                            <LiveVoucherTypeBadge type={v.type} />
                            <span className="font-mono font-medium">{v.number}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-muted-foreground">{formatDate(v.date)}</td>
                        <td className="py-2.5">
                          <p className="truncate font-medium">{v.partyName ?? meta.short}</p>
                          <p className="max-w-[340px] truncate text-xs text-muted-foreground">{detail || "—"}</p>
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums font-medium">{formatMoney(num(v.total))}</td>
                        <td className="py-2.5"><LiveVoucherStatusBadge status={v.status} /></td>
                        <td className="py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild><Link href={`/dashboard/vouchers/${v.id}`}>View detail</Link></DropdownMenuItem>
                              {(v.status === "draft" || v.status === "rejected") && can("accounts.edit") && (
                                <>
                                  <DropdownMenuItem asChild><Link href={`/dashboard/vouchers/new?edit=${v.id}`}>Edit</Link></DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onSelect={() => void discard(v.id, v.number)}>
                                    <Trash2 /> Discard
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
          {!list.isLoading && (list.data ?? []).length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm font-medium">{stats.total === 0 ? "No vouchers yet" : "No vouchers match your filters"}</p>
              {stats.total === 0 && can("accounts.create") && (
                <p className="mt-1 text-sm text-muted-foreground">Use “New Voucher” to record a payment, a receipt, an invoice or a journal.</p>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
