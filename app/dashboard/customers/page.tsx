"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { NewCustomerDialog } from "@/components/dialogs/new-customer-dialog";
import { useCustomers } from "@/lib/hooks/use-data";
import { formatPkr, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function CustomersPage() {
  const { data: customers, isLoading } = useCustomers();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const filtered = (customers ?? []).filter((c) =>
    `${c.name} ${c.cnic} ${c.phone}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers?.length ?? 0} clients on record</p>
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          Add Customer
        </Button>
      </div>

      <Card className="p-4">
        <div className="mb-4">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search name, CNIC, phone..." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Name</th>
                <th className="pb-2.5 font-medium">CNIC</th>
                <th className="pb-2.5 font-medium">Phone</th>
                <th className="pb-2.5 font-medium">City</th>
                <th className="pb-2.5 font-medium">Total Paid</th>
                <th className="pb-2.5 font-medium">Balance</th>
                <th className="pb-2.5 font-medium">Since</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={7} className="py-2.5"><Skeleton className="h-8 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((c, i) => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 10) * 0.03 }}
                      className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                    >
                      <td className="py-2.5 font-medium">{c.name}</td>
                      <td className="py-2.5 font-mono text-xs text-muted-foreground">{c.cnic}</td>
                      <td className="py-2.5 text-muted-foreground">{c.phone}</td>
                      <td className="py-2.5 text-muted-foreground">{c.city}</td>
                      <td className="py-2.5 tabular-nums font-medium">{formatPkr(c.totalPaid)}</td>
                      <td
                        className={cn(
                          "py-2.5 tabular-nums font-medium",
                          c.balance < 0 ? "text-destructive" : "text-success",
                        )}
                      >
                        {formatPkr(c.balance)}
                      </td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(c.createdAt)}</td>
                    </motion.tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      <NewCustomerDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
