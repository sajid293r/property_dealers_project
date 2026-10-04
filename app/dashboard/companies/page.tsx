"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  Building,
  Building2,
  FolderKanban,
  HandCoins,
  MapPin,
  Network,
  Plus,
  UserSquare2,
  Users2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SpotlightCard } from "@/components/spotlight-card";
import { CompanyAvatar } from "@/components/company-avatar";
import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewCompanyDialog } from "@/components/dialogs/new-company-dialog";
import { getDataset, getTrends } from "@/lib/mock-data/company-data";
import { useCompany } from "@/lib/providers/company-provider";
import { formatPkr } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function GroupOverviewPage() {
  const router = useRouter();
  const { companies, company: active, setCompanyId } = useCompany();
  const [addOpen, setAddOpen] = React.useState(false);

  const rows = React.useMemo(
    () =>
      companies.map((c) => {
        const ds = getDataset(c.id);
        return {
          company: c,
          projects: ds.projects.length,
          properties: ds.units.length,
          available: ds.units.filter((u) => u.status === "available").length,
          customers: ds.customers.length,
          staff: ds.staff.length,
          cash: ds.accounts.reduce((s, a) => s + a.balance, 0),
          collections: ds.deals.reduce((s, d) => s + d.paidAmount, 0),
          trend: getTrends(c.id).monthly.map((m) => m.collections),
        };
      }),
    [companies],
  );

  const totals = rows.reduce(
    (t, r) => ({
      projects: t.projects + r.projects,
      properties: t.properties + r.properties,
      cash: t.cash + r.cash,
      collections: t.collections + r.collections,
    }),
    { projects: 0, properties: 0, cash: 0, collections: 0 },
  );

  function open(id: string) {
    setCompanyId(id);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        icon={Network}
        eyebrow="Group"
        title="Group Overview"
        description={`${companies.length} companies under one login — each with fully separate projects, properties, people and books.`}
        actions={
          <Button className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            Add Company
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Companies" value={companies.length} format={(n) => n.toString()} icon={Building} index={0} />
        <KpiCard label="Projects (all)" value={totals.projects} format={(n) => n.toString()} icon={FolderKanban} index={1} accent="gold" />
        <KpiCard label="Properties (all)" value={totals.properties} format={(n) => n.toString()} icon={Building2} index={2} />
        <KpiCard
          label="Group collections"
          value={totals.collections}
          format={(n) => formatPkr(n, { compact: true })}
          icon={HandCoins}
          index={3}
          accent="gold"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {rows.map((r, i) => {
          const isActive = r.company.id === active.id;
          const share = totals.collections > 0 ? Math.round((r.collections / totals.collections) * 100) : 0;
          return (
            <motion.div
              key={r.company.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <SpotlightCard
                className={cn("group/co flex h-full flex-col overflow-hidden p-0", isActive && "ring-2 ring-gold/60")}
              >
                <div
                  className="relative min-h-[13rem] overflow-hidden px-5 pb-5 pt-5 text-white"
                  style={{
                    background: `linear-gradient(135deg, color-mix(in oklch, ${r.company.accent}, black 20%), color-mix(in oklch, ${r.company.accent}, black 62%))`,
                  }}
                >
                  <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-white/10 blur-2xl transition-transform duration-500 group-hover/co:scale-125" />
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.1]"
                    style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "16px 16px" }}
                  />
                  <div className="relative flex items-start gap-3">
                    <CompanyAvatar company={r.company} className="size-12 rounded-2xl text-base" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-heading text-lg font-semibold">{r.company.name}</h3>
                      <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-white/70">
                        <MapPin className="size-3 shrink-0" />
                        <span className="truncate">{r.company.city} · {r.company.industry}</span>
                      </p>
                    </div>
                    {isActive && (
                      <Badge className="border-0 bg-gold text-gold-foreground">Open now</Badge>
                    )}
                  </div>
                  <div className="relative mt-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Collections</p>
                    <p className="font-heading text-2xl font-semibold tabular-nums">
                      {formatPkr(r.collections, { compact: true })}
                    </p>
                    <Sparkline data={r.trend} stroke="oklch(0.88 0.12 88)" height={36} className="mt-1 opacity-90" />
                  </div>
                </div>

                <div className="grid flex-1 grid-cols-3 gap-3 px-5 py-4 text-center">
                  <Stat icon={FolderKanban} label="Projects" value={r.projects} />
                  <Stat icon={Building2} label="Properties" value={r.properties} />
                  <Stat icon={Users2} label="Customers" value={r.customers} />
                  <Stat icon={UserSquare2} label="Staff" value={r.staff} />
                  <Stat icon={Building2} label="Available" value={r.available} />
                  <Stat icon={Banknote} label="Cash" value={formatPkr(r.cash, { compact: true })} />
                </div>

                <div className="flex items-center gap-3 border-t border-border/60 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>Share of group collections</span>
                      <span className="font-medium text-foreground">{share}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-gold"
                        initial={{ width: 0 }}
                        animate={{ width: `${share}%` }}
                        transition={{ duration: 1, delay: 0.3 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                  </div>
                  <Button size="sm" variant={isActive ? "outline" : "default"} className="group gap-1" onClick={() => open(r.company.id)}>
                    {isActive ? "Go to dashboard" : "Open workspace"}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </div>
              </SpotlightCard>
            </motion.div>
          );
        })}

        <motion.button
          type="button"
          onClick={() => setAddOpen(true)}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + rows.length * 0.08, duration: 0.5 }}
          className="group flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-all hover:border-gold/60 hover:bg-gold/5 hover:text-foreground"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary transition-transform duration-300 group-hover:rotate-90 group-hover:bg-gold group-hover:text-gold-foreground">
            <Plus className="size-5" />
          </span>
          <span className="font-heading text-base font-semibold">Add another company</span>
          <span className="max-w-[16rem] text-center text-xs">
            Starts as an empty, fully separate workspace.
          </span>
        </motion.button>
      </div>

      <NewCompanyDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <Icon className="mx-auto size-3.5 text-muted-foreground" />
      <p className="mt-1 font-heading text-base font-semibold tabular-nums">{value}</p>
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
    </div>
  );
}
