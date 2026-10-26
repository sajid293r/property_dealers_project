"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { HandCoins, Plus, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { StatTile } from "@/components/live/stat-tile";
import { NewPartyDialog } from "@/components/live/party-dialog";
import { useParties, usePermissions } from "@/lib/hooks/use-live";
import { num, type PartyRole } from "@/lib/api/finance";
import { formatMoney } from "@/lib/format";
import { ExportButton } from "@/components/live/export-button";
import { AttachmentsButton } from "@/components/live/attachments";

const TABS: { value: "all" | PartyRole; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "customer", label: "Customers" },
  { value: "vendor", label: "Suppliers" },
  { value: "dealer", label: "Dealers" },
  { value: "contractor", label: "Contractors" },
];
const ROLE_LABEL: Partial<Record<PartyRole, string>> = { customer: "Customer", vendor: "Supplier", dealer: "Dealer", contractor: "Contractor", employee: "Employee", lead: "Lead", investor: "Investor", landowner: "Landowner" };

export function LiveCustomers() {
  const { can } = usePermissions();
  const [tab, setTab] = React.useState<"all" | PartyRole>("all");
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const all = useParties();
  const everyone = all.data ?? [];
  const shown = everyone.filter((p) => (tab === "all" || p.roles.includes(tab)) && (!search.trim() || `${p.name} ${p.phone ?? ""} ${p.city ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())));
  const receivable = everyone.reduce((s, p) => s + Math.max(num(p.balance), 0), 0);
  const payable = everyone.reduce((s, p) => s + Math.max(-num(p.balance), 0), 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={Users}
        eyebrow="People"
        title="Customers & Suppliers"
        description={`${everyone.length} people and businesses in your address book`}
        actions={can("customers.create") ? <Button className="gap-1.5" onClick={() => setOpen(true)}><Plus className="size-4" /> Add new</Button> : undefined}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Users} label="In address book" value={everyone.length} />
        <StatTile icon={HandCoins} label="To receive" value={formatMoney(receivable, { compact: true })} accent="success" />
        <StatTile icon={Wallet} label="To pay" value={formatMoney(payable, { compact: true })} accent="warning" />
      </div>
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="flex-wrap">{TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
          </Tabs>
          <div className="flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder="Search name, phone, city…" /><ExportButton name="customers" headers={["Name", "Roles", "Phone", "City", "Email", "Balance (positive = owes us)"]} rows={shown.map((p) => [p.name, p.roles.join(" / "), p.phone, p.city, p.email, num(p.balance)])} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Name</th>
                <th className="pb-2.5 font-medium">Role</th>
                <th className="pb-2.5 font-medium">Phone</th>
                <th className="pb-2.5 font-medium">City</th>
                <th className="pb-2.5 pe-1" /><th className="pb-2.5 pe-3 text-end font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {all.isLoading
                ? Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-9 w-full" /></td></tr>)
                : shown.map((p, i) => {
                    const bal = num(p.balance);
                    return (
                      <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.025 }} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                        <td className="py-2.5">
                          <p className="font-medium">{p.name}</p>
                          {p.cnicLast4 && <p className="text-xs text-muted-foreground">CNIC ••••• {p.cnicLast4}</p>}
                        </td>
                        <td className="py-2.5"><div className="flex flex-wrap gap-1">{p.roles.map((r) => <Badge key={r} variant="outline" className="text-[10.5px]">{ROLE_LABEL[r] ?? r}</Badge>)}</div></td>
                        <td className="whitespace-nowrap py-2.5 text-muted-foreground">{p.phone ?? "—"}</td>
                        <td className="py-2.5 text-muted-foreground">{p.city ?? "—"}</td>
                        <td className="py-2.5 text-end"><AttachmentsButton entityType="party" entityId={p.id} title={p.name} iconOnly canEdit={can("customers.edit")} categories={["CNIC copy", "Agreement", "Photo", "Other"]} /></td>
                        <td className={`whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums ${bal > 0 ? "text-success" : bal < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {bal === 0 ? "—" : `${formatMoney(Math.abs(bal))} ${bal > 0 ? "Dr" : "Cr"}`}
                        </td>
                      </motion.tr>
                    );
                  })}
            </tbody>
          </table>
          {!all.isLoading && shown.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">{everyone.length === 0 ? "Nobody here yet. Use “Add new” to add your first customer or supplier." : "No one matches your search."}</p>
          )}
        </div>
      </Card>
      <NewPartyDialog open={open} onOpenChange={setOpen} defaultRoles={tab === "all" ? ["customer"] : [tab]} />
    </div>
  );
}
