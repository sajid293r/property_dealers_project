"use client";

import { HardHat as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import * as React from "react";
import { motion } from "framer-motion";
import { Banknote, HardHat, PlusCircle, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { NewContractorDialog } from "@/components/dialogs/new-contractor-dialog";
import { useContractors, useConstructionContracts } from "@/lib/hooks/use-data";
import { CONTRACTOR_TRADE_ICON } from "@/lib/projects";
import { formatPkr } from "@/lib/format";

export default function ContractorsPage() {
  const { data: contractors, isLoading } = useContractors();
  const { data: contracts } = useConstructionContracts();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const filtered = (contractors ?? []).filter((c) =>
    `${c.name} ${c.companyName} ${c.trade}`.toLowerCase().includes(search.toLowerCase()),
  );

  const stats = React.useMemo(() => {
    const activeContracts = (contracts ?? []).filter((c) => c.status === "active");
    return {
      total: contractors?.length ?? 0,
      activeContracts: activeContracts.length,
      totalValue: activeContracts.reduce((s, c) => s + c.contractValue, 0),
    };
  }, [contractors, contracts]);

  function activeContractsFor(contractorId: string) {
    return (contracts ?? []).filter((c) => c.contractorId === contractorId && c.status === "active").length;
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="Projects"
        title="Contractors"
        description={<>{contractors?.length ?? 0} construction vendors on your roster</>}
        actions={<>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          Add Contractor
        </Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={HardHat} label="Total contractors" value={stats.total} />
        <StatTile icon={ShieldCheck} label="Active contracts" value={stats.activeContracts} accent="success" />
        <StatTile icon={Banknote} label="Active contract value" value={formatPkr(stats.totalValue, { compact: true })} accent="gold" />
      </div>

      <Card className="p-4">
        <div className="mb-4">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search name, company, trade..." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Contractor</th>
                <th className="pb-2.5 font-medium">Trade</th>
                <th className="pb-2.5 font-medium">Contact</th>
                <th className="pb-2.5 font-medium">Rating</th>
                <th className="pb-2.5 font-medium">Active contracts</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td colSpan={5} className="py-2.5"><Skeleton className="h-9 w-full" /></td>
                    </tr>
                  ))
                : filtered.map((c, i) => {
                    const TradeIcon = CONTRACTOR_TRADE_ICON[c.trade];
                    return (
                      <motion.tr
                        key={c.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i, 10) * 0.03 }}
                        className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/40"
                      >
                        <td className="py-2.5">
                          <p className="font-medium">{c.companyName}</p>
                          <p className="text-xs text-muted-foreground">{c.name}</p>
                        </td>
                        <td className="py-2.5">
                          <Badge variant="outline" className="gap-1 capitalize">
                            <TradeIcon className="size-3" />
                            {c.trade}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-muted-foreground">{c.phone}</td>
                        <td className="py-2.5">
                          <span className="flex items-center gap-1 tabular-nums">
                            <Star className="size-3.5 fill-gold text-gold" />
                            {c.rating.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-2.5 tabular-nums">{activeContractsFor(c.id)}</td>
                      </motion.tr>
                    );
                  })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No contractors match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <NewContractorDialog open={open} onOpenChange={setOpen} />
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
