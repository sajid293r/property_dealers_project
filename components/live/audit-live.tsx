"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/lib/providers/company-provider";
import { api } from "@/lib/api/client";
import { formatDate, formatTime } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { tOr } from "@/lib/i18n/runtime";

interface AuditRow { id: string; at: string; userName: string | null; action: string; entityType: string; entityId: string | null; changes: { field: string; from: unknown; to: unknown }[] }
interface AuditResponse { entityTypes: string[]; rows: AuditRow[] }

const ACTION_CLS: Record<string, string> = {
  create: "bg-success/12 text-success",
  update: "bg-primary/12 text-primary",
  status_change: "bg-warning/12 text-warning",
  delete: "bg-destructive/10 text-destructive",
};
const pretty = (f: string) => f.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const show = (v: unknown) => (v === undefined || v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function LiveAudit() {
  const t = useT();
  const entityLabel = (type: string) => tOr(t, `audit.entity.${type}`, pretty(type));
  const { company } = useCompany();
  const [type, setType] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const qs = new URLSearchParams({ limit: "100" });
  if (type !== "all") qs.set("entityType", type);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const q = useQuery({ queryKey: ["live", "audit", type, from, to], queryFn: () => api<AuditResponse>(`/v1/audit?${qs}`, { companyId: company.id }), staleTime: 10_000 });

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageHeader icon={History} eyebrow={t("nav.section.administration")} title={t("audit.title")} description={t("audit.description")} />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("audit.everything")}</SelectItem>
            {(q.data?.entityTypes ?? []).map((et) => <SelectItem key={et} value={et}>{entityLabel(et)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("acc.ledger.from")} />
        <span className="text-sm text-muted-foreground">{t("acc.ledger.toWord")}</span>
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("acc.ledger.to")} />
      </div>
      <Card className="divide-y divide-border/50 p-0">
        {q.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (q.data?.rows ?? []).map((r) => {
          const a = { text: tOr(t, `audit.action.${r.action}`, r.action), cls: ACTION_CLS[r.action] ?? "bg-muted text-muted-foreground" };
          const isOpen = open === r.id;
          return (
            <div key={r.id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm hover:bg-secondary/40">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${a.cls}`}>{a.text}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{entityLabel(r.entityType)}</span>
                  <span className="text-muted-foreground">{t("audit.byUser", { name: r.userName ?? t("audit.system") })}</span>
                  {r.changes.length > 0 && <span className="block truncate text-xs text-muted-foreground">{r.changes.slice(0, 4).map((c) => pretty(c.field)).join(", ")}{r.changes.length > 4 ? "…" : ""}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(r.at)} {formatTime(new Date(r.at))}</span>
                <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="bg-secondary/30 px-4 pb-3 pt-1">
                  <table className="w-full text-xs">
                    <tbody>
                      {r.changes.map((c) => (
                        <tr key={c.field} className="border-b border-border/40 last:border-0">
                          <td className="w-40 py-1.5 pe-3 font-medium">{pretty(c.field)}</td>
                          <td className="py-1.5 pe-3 text-muted-foreground">{r.action === "create" ? "" : show(c.from)}</td>
                          <td className="py-1.5">{r.action === "delete" ? "" : `→ ${show(c.to)}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {!q.isLoading && (q.data?.rows ?? []).length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t("audit.empty")}</p>}
      </Card>
    </div>
  );
}
