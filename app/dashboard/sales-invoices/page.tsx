"use client";

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

export default function SalesInvoicesPage() {
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
    toast.success(`${inv.number} marked paid`);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Sales Invoices</h1>
          <p className="text-sm text-muted-foreground">{invoices?.length ?? 0} invoices billed to customers</p>
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          New Invoice
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={ReceiptText} label="Total invoices" value={stats.total} />
        <StatTile icon={Clock} label="Outstanding" value={formatPkr(stats.unpaidAmount, { compact: true })} accent="warning" />
        <StatTile icon={Clock} label="Overdue" value={stats.overdue} accent="destructive" />
        <StatTile icon={CheckCircle2} label="Collected" value={formatPkr(stats.paidAmount, { compact: true })} accent="success" />
      </div>

      <Card className="p-4">
        <div className="mb-4">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search number, customer, description..." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Invoice</th>
                <th className="pb-2.5 font-medium">Customer</th>
                <th className="pb-2.5 font-medium">Description</th>
                <th className="pb-2.5 font-medium">Amount</th>
                <th className="pb-2.5 font-medium">Due date</th>
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
                        <td className="py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {inv.status === "unpaid" ? (
                                <DropdownMenuItem onSelect={() => markPaid(inv)}>Mark as paid</DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled>Already paid</DropdownMenuItem>
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
            <p className="py-10 text-center text-sm text-muted-foreground">No invoices match your search.</p>
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
    <Card className="flex-row items-center gap-3 p-3.5">
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${accentClasses}`}>
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0">
        <p className="font-heading text-lg font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
