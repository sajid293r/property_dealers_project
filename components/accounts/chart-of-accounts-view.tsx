"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Landmark,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  buildChartOfAccounts,
  accountClassLabel,
  formatLedgerBalance,
} from "@/lib/chart-of-accounts";
import { useAccounts, useContracts, useCustomers, useExpenses, useStaff, useTransactions, useUnits } from "@/lib/hooks/use-data";
import { formatDate } from "@/lib/format";
import type { AccountClass, LedgerAccountBalance } from "@/lib/types";
import { cn } from "@/lib/utils";

const CLASS_STYLES: Record<AccountClass, string> = {
  asset: "bg-primary/10 text-primary border-primary/30",
  liability: "bg-destructive/10 text-destructive border-destructive/30",
  equity: "bg-gold/15 text-gold-foreground border-gold/30",
  income: "bg-success/15 text-success border-success/30",
  expense: "bg-warning/15 text-warning border-warning/30",
};

export function ChartOfAccountsView() {
  const { data: units, isLoading: l1 } = useUnits();
  const { data: customers, isLoading: l2 } = useCustomers();
  const { data: staff, isLoading: l3 } = useStaff();
  const { data: accounts, isLoading: l4 } = useAccounts();
  const { data: transactions, isLoading: l5 } = useTransactions();
  const { data: expenses, isLoading: l6 } = useExpenses();
  const { data: contracts, isLoading: l7 } = useContracts();

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

  const [search, setSearch] = React.useState("");
  const [classFilter, setClassFilter] = React.useState<"all" | AccountClass>("all");
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<LedgerAccountBalance | null>(null);

  const tree = React.useMemo(() => {
    if (isLoading) return [];
    return buildChartOfAccounts({
      units: units ?? [],
      customers: customers ?? [],
      staff: staff ?? [],
      accounts: accounts ?? [],
      transactions: transactions ?? [],
      expenses: expenses ?? [],
      contracts: contracts ?? [],
    });
  }, [isLoading, units, customers, staff, accounts, transactions, expenses, contracts]);

  const byId = React.useMemo(() => new Map(tree.map((n) => [n.id, n])), [tree]);

  const totalAssets = byId.get("03")?.balance ?? 0;
  const totalLiabilities = byId.get("02")?.balance ?? 0;
  const totalEquity = byId.get("01")?.balance ?? 0;
  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;

  function isAncestorCollapsed(node: LedgerAccountBalance): boolean {
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    while (current) {
      if (collapsed.has(current.id)) return true;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return false;
  }

  const matchesSearch = (n: LedgerAccountBalance) =>
    !search ||
    `${n.code} ${n.name}`.toLowerCase().includes(search.toLowerCase());

  const visible = tree.filter((n) => {
    if (classFilter !== "all" && n.accountClass !== classFilter) return false;
    if (search && !matchesSearch(n)) return false;
    if (!search && isAncestorCollapsed(n)) return false;
    return true;
  });

  // Precomputed so the render below never mutates a variable mid-map — each
  // leaf row's position among leaves only, for the zebra stripe.
  const leafZebraIndex = new Map<string, number>();
  visible.forEach((n) => {
    const hasChildren = tree.some((c) => c.parentId === n.id);
    if (!hasChildren) leafZebraIndex.set(n.id, leafZebraIndex.size);
  });

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Assets" value={totalAssets} format={(n) => formatLedgerBalance(n)} icon={Landmark} index={0} />
        <KpiCard label="Total Liabilities" value={totalLiabilities} format={(n) => formatLedgerBalance(n)} icon={TrendingDown} index={1} />
        <KpiCard label="Total Equity" value={totalEquity} format={(n) => formatLedgerBalance(n)} icon={TrendingUp} index={2} accent="gold" />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 3 * 0.06 }}
          className={cn(
            "flex items-center gap-3 rounded-xl border p-4 shadow-sm",
            balanced ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
          )}
        >
          <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", balanced ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
            {balanced ? <CheckCircle2 className="size-4.5" /> : <AlertTriangle className="size-4.5" />}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Balance check</p>
            <p className="mt-0.5 text-sm font-semibold">
              {balanced ? "Assets = Liabilities + Equity" : "Out of balance"}
            </p>
          </div>
        </motion.div>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search code or account name..." />
          <Select value={classFilter} onValueChange={(v) => setClassFilter(v as typeof classFilter)}>
            <SelectTrigger size="sm" className="w-40"><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              <SelectItem value="asset">Assets</SelectItem>
              <SelectItem value="liability">Liabilities</SelectItem>
              <SelectItem value="equity">Equity</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-secondary/40 text-left text-xs text-muted-foreground">
                <th className="py-2.5 pl-3 font-medium">Code</th>
                <th className="py-2.5 font-medium">Account</th>
                <th className="py-2.5 font-medium">Class</th>
                <th className="py-2.5 pr-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((n, i) => {
                  const hasChildren = tree.some((c) => c.parentId === n.id);
                  const isCollapsed = collapsed.has(n.id);
                  const negative = n.balance < 0;

                  // Darker shading for higher-level groups, a light zebra
                  // stripe for leaf accounts — mirrors how level-wise COA
                  // screens (e.g. Numbers ERP) shade folder vs. account rows.
                  const rowBg = hasChildren
                    ? ["bg-secondary/60", "bg-secondary/40", "bg-secondary/20"][Math.min(n.depth, 2)]
                    : (leafZebraIndex.get(n.id) ?? 0) % 2 === 0
                      ? "bg-transparent"
                      : "bg-secondary/10";

                  return (
                    <motion.tr
                      key={n.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 12) * 0.02 }}
                      className={cn(
                        "border-b border-border/30 transition-colors last:border-0",
                        rowBg,
                        !hasChildren && "cursor-pointer hover:bg-secondary/40",
                      )}
                      onClick={() => !hasChildren && setSelected(n)}
                    >
                      <td className="py-2 pl-3 font-mono text-xs text-muted-foreground">{n.code}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          {Array.from({ length: n.depth }).map((_, d) => (
                            <span key={d} className="flex h-4 w-4 shrink-0 items-center justify-center">
                              <span className="h-full w-px bg-border/50" />
                            </span>
                          ))}
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(n.id);
                              }}
                              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                            >
                              {isCollapsed ? <ChevronRight className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0" />}
                              {isCollapsed ? (
                                <Folder className="size-3.5 shrink-0 text-primary/70" />
                              ) : (
                                <FolderOpen className="size-3.5 shrink-0 text-primary/70" />
                              )}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1.5 pl-[19px] text-muted-foreground/60">
                              <FileText className="size-3.5 shrink-0" />
                            </span>
                          )}
                          <span
                            className={cn(
                              hasChildren ? "font-semibold" : "font-medium",
                              n.depth === 0 && "text-[15px]",
                            )}
                          >
                            {n.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2">
                        <Badge variant="outline" className={cn("text-[10px] capitalize", CLASS_STYLES[n.accountClass])}>
                          {n.accountClass}
                        </Badge>
                      </td>
                      <td
                        className={cn(
                          "py-2 pr-3 text-right tabular-nums",
                          hasChildren ? "font-semibold" : "font-medium",
                          negative && "text-destructive",
                        )}
                      >
                        {negative ? "-" : ""}{formatLedgerBalance(n.balance)}
                      </td>
                    </motion.tr>
                  );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AccountDetailDialog account={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

function AccountDetailDialog({
  account,
  onOpenChange,
}: {
  account: LedgerAccountBalance | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!account} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{account?.code}</span>
            <Badge variant="outline" className={cn("text-[10px] capitalize", account && CLASS_STYLES[account.accountClass])}>
              {account && accountClassLabel(account.accountClass)}
            </Badge>
          </div>
          <DialogTitle>{account?.name}</DialogTitle>
          <DialogDescription>
            Current balance: <span className="font-medium text-foreground">{account && formatLedgerBalance(account.balance)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {account?.drillDown.length ? (
            account.drillDown.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.detail}
                    {item.date ? ` · ${formatDate(item.date)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums font-medium">{formatLedgerBalance(item.amount)}</span>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No underlying records — this is a fixed opening balance.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
