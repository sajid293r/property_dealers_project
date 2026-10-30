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
import { LIVE_VOUCHER_TYPES, groupLabel, localMeta } from "@/lib/live-vouchers";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { ExportButton } from "@/components/live/export-button";
import { useT } from "@/lib/i18n/provider";

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
  const t = useT();
  const router = useRouter();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allowed = React.useMemo(() => LIVE_VOUCHER_TYPES.filter((v) => !preset.types || preset.types.includes(v.type)).map((v) => localMeta(v.type)), [preset.types, t]);
  const [type, setType] = React.useState<VoucherType | "all">("all");
  const [status, setStatus] = React.useState<VoucherStatus | "all">("all");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
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
      toast.success(t("vch.discarded", { number }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("vch.couldNotDiscard"));
    }
  }

  const groups = ["Cash & bank", "Sales", "Purchases", "Other"] as const;
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={preset.icon ?? ScrollText}
        eyebrow={preset.eyebrow ?? t("nav.section.finance")}
        title={preset.title ?? t("vch.title")}
        description={preset.description ?? t("vch.description", { count: stats.total })}
        actions={
          can("accounts.create") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-1.5"><Plus className="size-4" /> {preset.newLabel ?? t("vch.new")}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {groups.filter((g) => allowed.some((v) => v.group === g)).map((g, i) => (
                  <React.Fragment key={g}>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{groupLabel(g)}</DropdownMenuLabel>
                    {allowed.filter((v) => v.group === g).map((v) => (
                      <DropdownMenuItem key={v.type} asChild>
                        <Link href={`/dashboard/vouchers/new?type=${v.type}`} className="gap-2.5 py-1.5">
                          <v.icon className="size-3.5 text-muted-foreground" />
                          <span className="flex-1">{v.label}</span>
                          <span className="text-xs text-muted-foreground">{v.type}</span>
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
        <StatTile icon={ScrollText} label={t("vch.tile.total")} value={stats.total} />
        <StatTile icon={Clock} label={t("vch.tile.pending")} value={stats.pending} accent="warning" />
        <StatTile icon={FileEdit} label={t("vch.tile.drafts")} value={stats.draft} accent="muted" />
        <StatTile icon={Wallet} label={t("vch.tile.value")} value={formatMoney(stats.value, { compact: true })} accent="success" />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <Tabs value={type} onValueChange={(v) => setType(v as VoucherType | "all")}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">{t("common.all")}</TabsTrigger>
              {allowed.map((v) => <TabsTrigger key={v.type} value={v.type}>{v.type}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2.5">
            <DataTableSearch value={search} onChange={setSearch} placeholder={t("vch.search")} />
            <ExportButton name="vouchers" headers={[t("vch.csv.voucher"), t("vch.csv.type"), t("common.date"), t("vch.csv.party"), t("vch.csv.bank"), t("vch.csv.instrument"), t("vch.csv.reference"), t("vch.csv.narration"), t("common.amount"), t("common.status")]} rows={(list.data ?? []).map((v) => [v.number, v.type, v.date, v.partyName, v.bankName, v.instrumentNo, v.reference, v.description, num(v.total), t(`vch.status.${v.status}`)])} />
            <Select value={status} onValueChange={(v) => setStatus(v as VoucherStatus | "all")}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("vch.allStatuses")}</SelectItem>
                <SelectItem value="draft">{t("vch.status.draft")}</SelectItem>
                <SelectItem value="pending">{t("vch.status.pending")}</SelectItem>
                <SelectItem value="approved">{t("vch.status.approved")}</SelectItem>
                <SelectItem value="rejected">{t("vch.status.rejected")}</SelectItem>
                <SelectItem value="void">{t("vch.status.void")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">{t("vch.col.voucher")}</th>
                <th className="pb-2.5 font-medium">{t("common.date")}</th>
                <th className="pb-2.5 font-medium">{t("vch.col.party")}</th>
                <th className="pb-2.5 pe-3 text-end font-medium">{t("common.amount")}</th>
                <th className="pb-2.5 font-medium">{t("common.status")}</th>
                <th className="pb-2.5 font-medium"><span className="sr-only">{t("common.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40"><td colSpan={6} className="py-2.5"><Skeleton className="h-10 w-full" /></td></tr>
                  ))
                : (list.data ?? []).map((v, i) => {
                    const meta = localMeta(v.type);
                    const detail = [v.bankName && `${v.bankName} ${v.bankAccountNo ?? ""}`.trim(), v.instrumentNo && t(v.instrumentType === "cheque" ? "vch.cheque" : "vch.ref", { no: v.instrumentNo }), v.description].filter(Boolean).join(" · ");
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
                        <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums font-medium">{formatMoney(num(v.total))}</td>
                        <td className="py-2.5"><LiveVoucherStatusBadge status={v.status} /></td>
                        <td className="py-2.5 text-end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={t("common.actions")}><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild><Link href={`/dashboard/vouchers/${v.id}`}>{t("vch.viewDetail")}</Link></DropdownMenuItem>
                              {(v.status === "draft" || v.status === "rejected") && can("accounts.edit") && (
                                <>
                                  <DropdownMenuItem asChild><Link href={`/dashboard/vouchers/new?edit=${v.id}`}>{t("common.edit")}</Link></DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onSelect={() => void discard(v.id, v.number)}>
                                    <Trash2 /> {t("vch.discard")}
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
              <p className="text-sm font-medium">{stats.total === 0 ? t("vch.emptyNone") : t("vch.emptyFilter")}</p>
              {stats.total === 0 && can("accounts.create") && (
                <p className="mt-1 text-sm text-muted-foreground">{t("vch.emptyHint")}</p>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
