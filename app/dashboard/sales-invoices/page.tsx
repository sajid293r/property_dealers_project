"use client";

import { useCompany } from "@/lib/providers/company-provider";
import { LiveVoucherList, type VoucherListPreset } from "@/components/live/voucher-list";

const salesPreset = (t: (key: string) => string): VoucherListPreset => ({ types: ["SV", "CN"], eyebrow: t("nav.section.sales"), title: t("nav.item.sales-invoices"), description: t("sinvoice.description"), newLabel: t("sinvoice.new"), icon: ReceiptText });

import { ReceiptText as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, MoreHorizontal, PlusCircle, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { InvoiceStatusBadge } from "@/components/sales/status-badges";
import { NewSalesInvoiceDialog } from "@/components/dialogs/new-sales-invoice-dialog";
import { useCustomers, useSalesInvoices } from "@/lib/hooks/use-data";
import { isOverdue } from "@/lib/sales";
import { formatDate, formatPkr } from "@/lib/format";
import type { SalesInvoice } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

function DemoSalesInvoicesPage() {
  const t = useT();
  const { data: invoices, isLoading } = useSalesInvoices();
  const { data: customers } = useCustomers();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const filtered = (invoices ?? []).filter((inv) => {
    const customer = customers?.find((c) => c.id === inv.customerId);
    return `${inv.number} ${inv.description} ${customer?.name ?? ""}`.toLowerCase().includes(search.toLowerCase());
  });

  const stats = React.useMemo(() => {
    const all = invoices ?? [];
    const unpaid = all.filter((i) => i.status === "unpaid");
    return {
      total: all.length,
      unpaidAmount: unpaid.reduce((s, i) => s + i.amount, 0),
      overdue: unpaid.filter((i) => isOverdue(i.dueDate, i.status)).length,
      paidAmount: all.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0),
    };
  }, [invoices]);

  function markPaid(inv: SalesInvoice) {
    queryClient.setQueryData<SalesInvoice[]>(["salesInvoices"], (old = []) =>
      old.map((item) => (item.id === inv.id ? { ...item, status: "paid" } : item)),
    );
    toast.success(t("dm.sinv.marked_paid", { number: inv.number }));
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow={t("nav.section.sales")}
        title={t("nav.item.sales-invoices")}
        description={t("dm.sinv.description", { count: invoices?.length ?? 0 })}
        actions={<>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          {t("dm.new_invoice")}
        </Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={ReceiptText} label={t("dm.total_invoices")} value={stats.total} />
        <StatTile icon={Clock} label={t("deals.kpi.outstanding")} value={formatPkr(stats.unpaidAmount, { compact: true })} accent="warning" />
        <StatTile icon={Clock} label={t("dashboard.live.overdue")} value={stats.overdue} accent="destructive" />
        <StatTile icon={CheckCircle2} label={t("dashboard.schedule.collected")} value={formatPkr(stats.paidAmount, { compact: true })} accent="success" />
      </div>

      <Card className="p-4">
        <div className="mb-4">
          <DataTableSearch value={search} onChange={setSearch} placeholder={t("dm.search_number_customer_description")} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">{t("print.invoice.title")}</th>
                <th className="pb-2.5 font-medium">{t("common.customer")}</th>
                <th className="pb-2.5 font-medium">{t("rec.st.colDescription")}</th>
                <th className="pb-2.5 font-medium">{t("common.amount")}</th>
                <th className="pb-2.5 font-medium">{t("print.invoice.dueDate")}</th>
                <th className="pb-2.5 font-medium">{t("common.status")}</th>
                <th className="pb-2.5 font-medium"><span className="sr-only">{t("common.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={7} className="py-2.5"><Skeleton className="h-9 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((inv, i) => {
                    const customer = customers?.find((c) => c.id === inv.customerId);
                    return (
                      <motion.tr
                        key={inv.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                        className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                      >
                        <td className="py-2.5 font-mono font-medium">{inv.number}</td>
                        <td className="py-2.5">{customer?.name ?? "—"}</td>
                        <td className="py-2.5 text-muted-foreground">{inv.description}</td>
                        <td className="py-2.5 tabular-nums font-medium">{formatPkr(inv.amount)}</td>
                        <td className="py-2.5 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                        <td className="py-2.5"><InvoiceStatusBadge status={inv.status} dueDate={inv.dueDate} /></td>
                        <td className="py-2.5 text-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {inv.status === "unpaid" ? (
                                <DropdownMenuItem onSelect={() => markPaid(inv)}>{t("dm.mark_as_paid")}</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled>{t("dm.already_paid")}</DropdownMenuItem>
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
            <p className="py-10 text-center text-sm text-muted-foreground">{t("dm.no_invoices_match_your_search")}</p>
          )}
        </div>
      </Card>

      <NewSalesInvoiceDialog open={open} onOpenChange={setOpen} />
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

export default function Page() {
  const t = useT();
  const { live } = useCompany();
  return live ? <LiveVoucherList preset={salesPreset(t)} /> : <DemoSalesInvoicesPage />;
}
