"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { NewBookingDialog } from "@/components/dialogs/new-booking-dialog";
import { useDeals, useUnits, useCustomers } from "@/lib/hooks/use-data";
import { formatPkr, formatDate } from "@/lib/format";
import type { Deal, DealStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<DealStatus, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  confirmed: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function DealsPage() {
  const { data: deals, isLoading } = useDeals();
  const { data: units } = useUnits();
  const { data: customers } = useCustomers();
  const [status, setStatus] = React.useState<"all" | DealStatus>("all");
  const [search, setSearch] = React.useState("");
  const [bookingOpen, setBookingOpen] = React.useState(false);

  const unitOf = (id: string) => units?.find((u) => u.id === id);
  const customerOf = (id: string) => customers?.find((c) => c.id === id);

  const filtered = (deals ?? []).filter((d) => {
    if (status !== "all" && d.status !== status) return false;
    if (search) {
      const c = customerOf(d.customerId)?.name ?? "";
      const u = unitOf(d.unitId)?.code ?? "";
      if (!`${d.voucherNo} ${c} ${u}`.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Deals &amp; Bookings</h1>
          <p className="text-sm text-muted-foreground">{deals?.length ?? 0} bookings on record</p>
        </div>
        <Button className="gap-1.5" onClick={() => setBookingOpen(true)}>
          <PlusCircle className="size-4" />
          New Booking
        </Button>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search voucher, customer, unit..." />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger size="sm" className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Voucher</th>
                <th className="pb-2.5 font-medium">Customer</th>
                <th className="pb-2.5 font-medium">Unit</th>
                <th className="pb-2.5 font-medium">Progress</th>
                <th className="pb-2.5 font-medium">Total</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium">Booked</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={7} className="py-2.5"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((deal, i) => (
                    <DealRow key={deal.id} deal={deal} index={i} customerName={customerOf(deal.customerId)?.name ?? "—"} unitCode={unitOf(deal.unitId)?.code ?? "—"} />
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      <NewBookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}

function DealRow({
  deal,
  index,
  customerName,
  unitCode,
}: {
  deal: Deal;
  index: number;
  customerName: string;
  unitCode: string;
}) {
  const pct = Math.round((deal.paidAmount / deal.totalAmount) * 100);
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index, 10) * 0.03 }}
      className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
    >
      <td className="py-3 font-mono text-xs text-muted-foreground">{deal.voucherNo}</td>
      <td className="py-3 font-medium">{customerName}</td>
      <td className="py-3 text-muted-foreground">{unitCode}</td>
      <td className="py-3">
        <div className="flex w-32 items-center gap-2">
          <Progress value={pct} className="h-1.5" />
          <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      </td>
      <td className="py-3 tabular-nums font-medium">{formatPkr(deal.totalAmount)}</td>
      <td className="py-3">
        <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[deal.status])}>
          {deal.status}
        </Badge>
      </td>
      <td className="py-3 text-muted-foreground">{formatDate(deal.createdAt)}</td>
    </motion.tr>
  );
}
