"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { differenceInCalendarDays } from "date-fns";
import {
  PlusCircle,
  FileSignature,
  FileCheck2,
  AlertTriangle,
  FileX2,
  Download,
  RefreshCcw,
  Ban,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { NewContractDialog } from "@/components/dialogs/new-contract-dialog";
import { useContracts } from "@/lib/hooks/use-data";
import { formatPkr, formatDate } from "@/lib/format";
import type { Contract, ContractStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_STYLES: Record<ContractStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  expiring: "bg-warning/15 text-warning border-warning/30",
  expired: "bg-destructive/10 text-destructive border-destructive/30",
};

function expiryMeta(endDate: string, status: ContractStatus) {
  const days = differenceInCalendarDays(new Date(endDate), new Date());
  if (status === "expired" || days < 0) {
    return { label: `Expired ${Math.abs(days)}d ago`, tone: STATUS_STYLES.expired };
  }
  if (days === 0) return { label: "Expires today", tone: STATUS_STYLES.expiring };
  if (days <= 30) return { label: `Expires in ${days}d`, tone: STATUS_STYLES.expiring };
  return { label: `Renews ${formatDate(endDate)}`, tone: STATUS_STYLES.active };
}

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts();
  const [search, setSearch] = React.useState("");
  const [type, setType] = React.useState("all");
  const [status, setStatus] = React.useState<"all" | ContractStatus>("all");
  const [newOpen, setNewOpen] = React.useState(false);

  const types = React.useMemo(
    () => Array.from(new Set((contracts ?? []).map((c) => c.type))),
    [contracts],
  );

  const filtered = React.useMemo(() => {
    return (contracts ?? []).filter((c) => {
      if (type !== "all" && c.type !== type) return false;
      if (status !== "all" && c.status !== status) return false;
      if (search && !`${c.title} ${c.partyName}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [contracts, type, status, search]);

  const total = contracts?.length ?? 0;
  const active = contracts?.filter((c) => c.status === "active").length ?? 0;
  const expiring = contracts?.filter((c) => c.status === "expiring").length ?? 0;
  const expired = contracts?.filter((c) => c.status === "expired").length ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Contracts</h1>
          <p className="text-sm text-muted-foreground">
            {total} agreements on record — sale, lease and dealer contracts in one place.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setNewOpen(true)}>
          <PlusCircle className="size-4" />
          New Contract
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Contracts"
          value={total}
          format={(n) => n.toString()}
          icon={FileSignature}
          index={0}
          onClick={() => setStatus("all")}
        />
        <KpiCard
          label="Active"
          value={active}
          format={(n) => n.toString()}
          icon={FileCheck2}
          index={1}
          onClick={() => setStatus("active")}
        />
        <KpiCard
          label="Expiring Soon"
          value={expiring}
          format={(n) => n.toString()}
          icon={AlertTriangle}
          index={2}
          accent="gold"
          onClick={() => setStatus("expiring")}
        />
        <KpiCard
          label="Expired"
          value={expired}
          format={(n) => n.toString()}
          icon={FileX2}
          index={3}
          onClick={() => setStatus("expired")}
        />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search title, party..." />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger size="sm" className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expiring">Expiring</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Contract</th>
                <th className="pb-2.5 font-medium">Type</th>
                <th className="pb-2.5 font-medium">Party</th>
                <th className="pb-2.5 font-medium">Start</th>
                <th className="pb-2.5 font-medium">Value</th>
                <th className="pb-2.5 font-medium">Expiry</th>
                <th className="pb-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={7} className="py-2.5"><Skeleton className="h-9 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((contract, i) => (
                    <ContractRow key={contract.id} contract={contract} index={i} />
                  ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No contracts match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <NewContractDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function ContractRow({ contract, index }: { contract: Contract; index: number }) {
  const expiry = expiryMeta(contract.endDate, contract.status);

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index, 10) * 0.03 }}
      className="group border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
    >
      <td className="py-3 font-medium">{contract.title}</td>
      <td className="py-3">
        <Badge variant="outline" className="text-[10px]">{contract.type}</Badge>
      </td>
      <td className="py-3 text-muted-foreground">{contract.partyName}</td>
      <td className="py-3 text-muted-foreground">{formatDate(contract.startDate)}</td>
      <td className="py-3 tabular-nums font-medium">{formatPkr(contract.value)}</td>
      <td className="py-3">
        <Badge variant="outline" className={cn("text-[10px]", expiry.tone)}>
          {expiry.label}
        </Badge>
      </td>
      <td className="py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => toast.success(`${contract.title} renewed for 1 year`)}>
              <RefreshCcw className="size-3.5" />
              Renew
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.success(`${contract.title} PDF downloaded`)}>
              <Download className="size-3.5" />
              Download PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => toast.success(`${contract.title} marked as terminated`)}
            >
              <Ban className="size-3.5" />
              Mark Terminated
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </motion.tr>
  );
}
