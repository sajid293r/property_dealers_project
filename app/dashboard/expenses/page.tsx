"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NewExpenseDialog } from "@/components/dialogs/new-expense-dialog";
import { useExpenses } from "@/lib/hooks/use-data";
import { formatPkr, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ExpensesPage() {
  const { data: expenses, isLoading } = useExpenses();
  const unpaidTotal = expenses?.filter((e) => e.status === "unpaid").reduce((s, e) => s + e.amount, 0) ?? 0;
  const [open, setOpen] = React.useState(false);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            {expenses?.length ?? 0} vouchers ·{" "}
            <span className="text-warning">{formatPkr(unpaidTotal)} unpaid</span>
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          New Expense
        </Button>
      </div>

      <Card className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Title</th>
                <th className="pb-2.5 font-medium">Type</th>
                <th className="pb-2.5 font-medium">Paid via</th>
                <th className="pb-2.5 font-medium">Amount</th>
                <th className="pb-2.5 font-medium">Date</th>
                <th className="pb-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={6} className="py-2.5"><Skeleton className="h-8 w-full" /></td>
                    </tr>
                  ))
                : expenses?.map((e, i) => (
                    <motion.tr
                      key={e.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 10) * 0.03 }}
                      className="border-b border-border/40 last:border-0 hover:bg-secondary/40"
                    >
                      <td className="py-2.5 font-medium">{e.title}</td>
                      <td className="py-2.5 text-muted-foreground">{e.type}</td>
                      <td className="py-2.5 text-muted-foreground">{e.paidVia}</td>
                      <td className="py-2.5 tabular-nums font-medium">{formatPkr(e.amount)}</td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(e.date)}</td>
                      <td className="py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            e.status === "paid"
                              ? "bg-success/15 text-success border-success/30"
                              : "bg-warning/15 text-warning border-warning/30",
                          )}
                        >
                          {e.status}
                        </Badge>
                      </td>
                    </motion.tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      <NewExpenseDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
