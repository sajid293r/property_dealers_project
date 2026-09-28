"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Ban, CalendarClock, CheckCircle2, Landmark, MoreHorizontal, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { ChequeStatusBadge } from "@/components/sales/status-badges";
import { NewChequeDialog } from "@/components/dialogs/new-cheque-dialog";
import { useCustomers, usePostDatedCheques } from "@/lib/hooks/use-data";
import { formatDate, formatPkr } from "@/lib/format";
import type { ChequeStatus, PostDatedCheque } from "@/lib/types";
import { toast } from "sonner";

export default function ChequesPage() {
  const { data: cheques, isLoading } = usePostDatedCheques();
  const { data: customers } = useCustomers();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const filtered = (cheques ?? []).filter((c) => {
    const customer = customers?.find((cust) => cust.id === c.customerId);
    return `${c.chequeNo} ${c.bankName} ${customer?.name ?? ""}`.toLowerCase().includes(search.toLowerCase());
  });

  const stats = React.useMemo(() => {
    const all = cheques ?? [];
    return {
      inHand: all.filter((c) => c.status === "in_hand").reduce((s, c) => s + c.amount, 0),
      deposited: all.filter((c) => c.status === "deposited").reduce((s, c) => s + c.amount, 0),
      cleared: all.filter((c) => c.status === "cleared").reduce((s, c) => s + c.amount, 0),
      bounced: all.filter((c) => c.status === "bounced").length,
    };
  }, [cheques]);

  function setStatus(cheque: PostDatedCheque, status: ChequeStatus) {
    queryClient.setQueryData<PostDatedCheque[]>(["postDatedCheques"], (old = []) =>
      old.map((item) => (item.id === cheque.id ? { ...item, status } : item)),
    );
    const messages: Record<ChequeStatus, string> = {
      in_hand: `Cheque #${cheque.chequeNo} marked in hand`,
      deposited: `Cheque #${cheque.chequeNo} deposited`,
      cleared: `Cheque #${cheque.chequeNo} cleared`,
      bounced: `Cheque #${cheque.chequeNo} marked bounced`,
    };
    toast.success(messages[status]);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Post-Dated Cheques</h1>
          <p className="text-sm text-muted-foreground">{cheques?.length ?? 0} cheques collected against installments</p>
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          Record Cheque
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={CalendarClock} label="In hand" value={formatPkr(stats.inHand, { compact: true })} />
        <StatTile icon={Landmark} label="Deposited" value={formatPkr(stats.deposited, { compact: true })} accent="primary" />
        <StatTile icon={CheckCircle2} label="Cleared" value={formatPkr(stats.cleared, { compact: true })} accent="success" />
        <StatTile icon={Ban} label="Bounced" value={stats.bounced} accent="destructive" />
      </div>

      <Card className="p-4">
        <div className="mb-4">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search cheque no, bank, customer..." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Cheque</th>
                <th className="pb-2.5 font-medium">Bank</th>
                <th className="pb-2.5 font-medium">Customer</th>
                <th className="pb-2.5 font-medium">Amount</th>
                <th className="pb-2.5 font-medium">Cheque date</th>
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
                : filtered.map((c, i) => {
                    const customer = customers?.find((cust) => cust.id === c.customerId);
                    return (
                      <motion.tr
                        key={c.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                        className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                      >
                        <td className="py-2.5 font-mono font-medium">#{c.chequeNo}</td>
                        <td className="py-2.5 text-muted-foreground">{c.bankName}</td>
                        <td className="py-2.5">{customer?.name ?? "—"}</td>
                        <td className="py-2.5 tabular-nums font-medium">{formatPkr(c.amount)}</td>
                        <td className="py-2.5 text-muted-foreground">{formatDate(c.chequeDate)}</td>
                        <td className="py-2.5"><ChequeStatusBadge status={c.status} /></td>
                        <td className="py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {c.status === "in_hand" && (
                                <DropdownMenuItem onSelect={() => setStatus(c, "deposited")}>Deposit</DropdownMenuItem>
                              )}
                              {c.status === "deposited" && (
                                <>
                                  <DropdownMenuItem onSelect={() => setStatus(c, "cleared")}>Mark cleared</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onSelect={() => setStatus(c, "bounced")}>
                                    Mark bounced
                                  </DropdownMenuItem>
                                </>
                              )}
                              {(c.status === "cleared" || c.status === "bounced") && (
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
            <p className="py-10 text-center text-sm text-muted-foreground">No cheques match your search.</p>
          )}
        </div>
      </Card>

      <NewChequeDialog open={open} onOpenChange={setOpen} />
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
  accent?: "primary" | "success" | "destructive";
}) {
  const accentClasses = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
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
