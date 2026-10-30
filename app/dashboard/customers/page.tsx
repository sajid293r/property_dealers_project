"use client";

import { useCompany } from "@/lib/providers/company-provider";
import { LiveCustomers } from "@/components/live/customers-live";

import { Wallet as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Users2 as KpiUsers2, HandCoins as KpiHandCoins, Scale as KpiScale, MapPin as KpiMapPin } from "lucide-react";
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
import { useT } from "@/lib/i18n/provider";
import { Ltr } from "@/components/ltr";

function DemoCustomersPage() {
  const t = useT();
  const { data: customers, isLoading } = useCustomers();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const totalPaid = customers?.reduce((s, c) => s + c.totalPaid, 0) ?? 0;
  const owed = customers?.reduce((s, c) => s + (c.balance < 0 ? -c.balance : 0), 0) ?? 0;
  const cities = new Set((customers ?? []).map((c) => c.city)).size;

  const filtered = (customers ?? []).filter((c) =>
    `${c.name} ${c.cnic} ${c.phone}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow={t("nav.section.people")}
        title={t("customers.title")}
        description={t("customers.demoDescription", { count: customers?.length ?? 0 })}
        actions={<>
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <PlusCircle className="size-4" />
          {t("customers.addCustomer")}
        </Button>
        </>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t("customers.kpi.customers")} value={customers?.length ?? 0} format={(n) => n.toString()} icon={KpiUsers2} index={0} />
        <KpiCard label={t("customers.kpi.received")} value={totalPaid} format={(n) => formatPkr(n, { compact: true })} icon={KpiHandCoins} accent="gold" index={1} />
        <KpiCard label={t("customers.kpi.receivable")} value={owed} format={(n) => formatPkr(n, { compact: true })} icon={KpiScale} index={2} />
        <KpiCard label={t("customers.kpi.cities")} value={cities} format={(n) => n.toString()} icon={KpiMapPin} accent="gold" index={3} />
      </div>

      <Card className="p-4">
        <div className="mb-4">
          <DataTableSearch value={search} onChange={setSearch} placeholder={t("customers.searchDemo")} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">{t("customers.col.name")}</th>
                <th className="pb-2.5 font-medium">{t("customers.col.cnic")}</th>
                <th className="pb-2.5 font-medium">{t("customers.col.phone")}</th>
                <th className="pb-2.5 font-medium">{t("customers.col.city")}</th>
                <th className="pb-2.5 font-medium">{t("customers.col.totalPaid")}</th>
                <th className="pb-2.5 font-medium">{t("customers.col.balance")}</th>
                <th className="pb-2.5 font-medium">{t("customers.col.since")}</th>
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
                      <td className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-gold/30 text-[11px] font-semibold text-primary">
                            {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </span>
                          <span className="font-medium">{c.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 font-mono text-xs text-muted-foreground"><Ltr>{c.cnic}</Ltr></td>
                      <td className="py-2.5 text-muted-foreground"><Ltr>{c.phone}</Ltr></td>
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

export default function Page() {
  const { live } = useCompany();
  return live ? <LiveCustomers /> : <DemoCustomersPage />;
}
