"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, FileStack, MoreHorizontal, PlusCircle, Send, TrendingUp } from "lucide-react";
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
import { QuotationStatusBadge } from "@/components/sales/status-badges";
import { NewQuotationDialog } from "@/components/dialogs/new-quotation-dialog";
import { useCustomers, useQuotations, useUnits } from "@/lib/hooks/use-data";
import { formatDate, formatPkr } from "@/lib/format";
import type { Quotation, QuotationStatus } from "@/lib/types";
import { toast } from "sonner";

export default function QuotationsPage() {
  const { data: quotations, isLoading } = useQuotations();
  const { data: customers } = useCustomers();
  const { data: units } = useUnits();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const filtered = (quotations ?? []).filter((q) => {
    const customer = customers?.find((c) => c.id === q.customerId);
    const unit = units?.find((u) => u.id === q.unitId);
    return `${q.number} ${customer?.name ?? ""} ${unit?.code ?? ""}`.toLowerCase().includes(search.toLowerCase());
  });

  const stats = React.useMemo(() => {
    const all = quotations ?? [];
    const converted = all.filter((q) => q.status === "converted").length;
    return {
      total: all.length,
      sent: all.filter((q) => q.status === "sent").length,
      accepted: all.filter((q) => q.status === "accepted").length,
      conversionRate: all.length ? Math.round((converted / all.length) * 100) : 0,
    };
  }, [quotations]);

  function setStatus(q: Quotation, status: QuotationStatus) {
    queryClient.setQueryData<Quotation[]>(["quotations"], (old = []) =>
      old.map((item) => (item.id === q.id ? { ...item, status } : item)),
    );
    const messages: Record<QuotationStatus, string> = {
      draft: `${q.number} reverted to draft`,
      sent: `${q.number} sent to customer`,
      accepted: `${q.number} marked accepted`,
      expired: `${q.number} marked expired`,
      converted: `${q.number} converted — create the booking from Deals & Bookings`,
    };
    toast.success(messages[status]);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Quotations</h1>
          <p className="text-sm text-muted-foreground">{quotations?.length ?? 0} quotes issued to prospects</p>
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          New Quotation
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={FileStack} label="Total quotations" value={stats.total} />
        <StatTile icon={Send} label="Awaiting response" value={stats.sent} accent="primary" />
        <StatTile icon={CheckCircle2} label="Accepted" value={stats.accepted} accent="success" />
        <StatTile icon={TrendingUp} label="Conversion rate" value={`${stats.conversionRate}%`} accent="gold" />
      </div>

      <Card className="p-4">
        <div className="mb-4">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search number, customer, unit..." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Quotation</th>
                <th className="pb-2.5 font-medium">Customer</th>
                <th className="pb-2.5 font-medium">Unit</th>
                <th className="pb-2.5 font-medium">Price</th>
                <th className="pb-2.5 font-medium">Valid until</th>
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
                : filtered.map((q, i) => {
                    const customer = customers?.find((c) => c.id === q.customerId);
                    const unit = units?.find((u) => u.id === q.unitId);
                    const netPrice = q.price * (1 - q.discountPercent / 100);
                    return (
                      <motion.tr
                        key={q.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                        className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                      >
                        <td className="py-2.5 font-mono font-medium">{q.number}</td>
                        <td className="py-2.5">{customer?.name ?? "—"}</td>
                        <td className="py-2.5 text-muted-foreground">{unit?.code ?? "—"}</td>
                        <td className="py-2.5">
                          <span className="tabular-nums font-medium">{formatPkr(netPrice)}</span>
                          {q.discountPercent > 0 && (
                            <span className="ml-1.5 text-xs text-muted-foreground">-{q.discountPercent}%</span>
                          )}
                        </td>
                        <td className="py-2.5 text-muted-foreground">{formatDate(q.validUntil)}</td>
                        <td className="py-2.5"><QuotationStatusBadge status={q.status} /></td>
                        <td className="py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {q.status === "draft" && (
                                <DropdownMenuItem onSelect={() => setStatus(q, "sent")}>Send to customer</DropdownMenuItem>
                              )}
                              {q.status === "sent" && (
                                <>
                                  <DropdownMenuItem onSelect={() => setStatus(q, "accepted")}>Mark accepted</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => setStatus(q, "expired")}>Mark expired</DropdownMenuItem>
                                </>
                              )}
                              {q.status === "accepted" && (
                                <DropdownMenuItem onSelect={() => setStatus(q, "converted")}>Convert to booking</DropdownMenuItem>
                              )}
                              {(q.status === "expired" || q.status === "converted") && (
                                <DropdownMenuItem disabled>No further actions</DropdownMenuItem>
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
            <p className="py-10 text-center text-sm text-muted-foreground">No quotations match your search.</p>
          )}
        </div>
      </Card>

      <NewQuotationDialog open={open} onOpenChange={setOpen} />
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
  accent?: "primary" | "success" | "gold";
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    gold: "bg-gold/15 text-gold",
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
