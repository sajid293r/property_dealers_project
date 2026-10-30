"use client";

import { useCompany } from "@/lib/providers/company-provider";
import { LiveLeads } from "@/components/live/leads-live";

import { Users2 as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import * as React from "react";
import { motion } from "framer-motion";
import { differenceInCalendarDays } from "date-fns";
import {
  PlusCircle,
  Phone,
  Building2,
  Clock,
  MoreHorizontal,
  MessageCircle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { useLeads } from "@/lib/hooks/use-data";
import { formatDate } from "@/lib/format";
import type { Lead, LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { translate } from "@/lib/i18n/runtime";
import { useT } from "@/lib/i18n/provider";

const STAGES: { id: LeadStatus; label: string }[] = [
  { id: "new", label: "leads.stage.new" },
  { id: "contacted", label: "leads.stage.contacted" },
  { id: "negotiation", label: "leads.stage.negotiation" },
  { id: "won", label: "leads.stage.won" },
  { id: "lost", label: "leads.stage.lost" },
];

const STAGE_DOT: Record<LeadStatus, string> = {
  new: "bg-primary",
  contacted: "bg-muted-foreground",
  negotiation: "bg-gold",
  won: "bg-success",
  lost: "bg-destructive",
};

const STAGE_TINT: Record<LeadStatus, string> = {
  new: "from-primary/10",
  contacted: "from-muted-foreground/10",
  negotiation: "from-gold/15",
  won: "from-success/12",
  lost: "from-destructive/10",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function followUpMeta(dateStr?: string) {
  if (!dateStr) return null;
  const days = differenceInCalendarDays(new Date(dateStr), new Date());
  if (days < 0) {
    return { label: translate("dm.crm.overdue_days", { days: Math.abs(days) }), tone: "bg-destructive/10 text-destructive border-destructive/30" };
  }
  if (days === 0) return { label: translate("dm.crm.due_today"), tone: "bg-warning/15 text-warning border-warning/30" };
  if (days === 1) return { label: translate("common.tomorrow"), tone: "bg-warning/15 text-warning border-warning/30" };
  if (days <= 3) return { label: translate("dm.crm.in_days", { days }), tone: "bg-gold/15 text-gold border-gold/30" };
  return { label: formatDate(dateStr), tone: "bg-secondary text-secondary-foreground border-border" };
}

function DemoCrmPage() {
  const t = useT();
  const { data: leads, isLoading } = useLeads();
  const [search, setSearch] = React.useState("");
  const [source, setSource] = React.useState("all");
  const [agent, setAgent] = React.useState("all");
  const [overrides, setOverrides] = React.useState<Record<string, LeadStatus>>({});

  const sources = React.useMemo(
    () => Array.from(new Set((leads ?? []).map((l) => l.source))),
    [leads],
  );
  const agents = React.useMemo(
    () => Array.from(new Set((leads ?? []).map((l) => l.assignedTo))),
    [leads],
  );

  const filtered = React.useMemo(() => {
    return (leads ?? []).filter((l) => {
      if (source !== "all" && l.source !== source) return false;
      if (agent !== "all" && l.assignedTo !== agent) return false;
      if (search && !`${l.name} ${l.phone}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [leads, source, agent, search]);

  function statusOf(lead: Lead): LeadStatus {
    return overrides[lead.id] ?? lead.status;
  }

  function moveLead(lead: Lead, next: LeadStatus) {
    setOverrides((prev) => ({ ...prev, [lead.id]: next }));
    toast.success(t("dm.crm.moved", { name: lead.name, stage: t(STAGES.find((s) => s.id === next)!.label) }));
  }

  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<LeadStatus | null>(null);

  function handleDrop(col: LeadStatus) {
    const lead = leads?.find((l) => l.id === dragId);
    setOverCol(null);
    setDragId(null);
    if (lead && statusOf(lead) !== col) moveLead(lead, col);
  }

  const columns = STAGES.map((stage) => ({
    ...stage,
    leads: filtered.filter((l) => statusOf(l) === stage.id),
  }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow={t("nav.section.sales")}
        title={t("plan.feature.leads")}
        description={t("dm.crm.description", { count: leads?.length ?? 0 })}
        actions={<>
        <Button className="gap-1.5">
          <PlusCircle className="size-4" />
          {t("dashboard.hero.addLead")}
        </Button>
        </>}
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder={t("dm.search_name_phone")} />
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder={t("leads.csv.source")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dm.all_sources")}</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agent} onValueChange={setAgent}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder={t("dm.assigned_to")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dm.all_agents")}</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {isLoading
          ? STAGES.map((stage) => (
              <div key={stage.id} className="w-72 shrink-0 space-y-3">
                <Skeleton className="h-6 w-24" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-xl" />
                ))}
              </div>
            ))
          : columns.map((col) => (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overCol !== col.id) setOverCol(col.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
                }}
                onDrop={() => handleDrop(col.id)}
                className={cn(
                  "w-72 shrink-0 rounded-2xl bg-gradient-to-b to-transparent p-2 transition-all duration-200",
                  STAGE_TINT[col.id],
                  overCol === col.id && dragId && "scale-[1.01] ring-2 ring-gold/60 ring-offset-2 ring-offset-background",
                )}
              >
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn("size-2 rounded-full", STAGE_DOT[col.id])} />
                  <h3 className="font-heading text-sm font-semibold">{t(col.label)}</h3>
                  <Badge variant="secondary" className="ms-auto text-[10px] tabular-nums">
                    {col.leads.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {col.leads.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                      {dragId ? t("dm.crm.drop_here") : t("leads.nobody")}
                    </div>
                  )}
                  {col.leads.map((lead, i) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      status={col.id}
                      index={i}
                      dragging={dragId === lead.id}
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                      }}
                      onMove={(next) => moveLead(lead, next)}
                    />
                  ))}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  status,
  index,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  lead: Lead;
  status: LeadStatus;
  index: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (next: LeadStatus) => void;
}) {
  const t = useT();
  const followUp = followUpMeta(lead.nextFollowUp);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.04 }}
    >
      <Card
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "group cursor-grab p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:ring-gold/40 active:cursor-grabbing",
          dragging && "rotate-2 scale-95 opacity-40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{lead.name}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="-me-1 -mt-1 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[11px]">{t("dm.move_to")}</DropdownMenuLabel>
              {STAGES.filter((s) => s.id !== status).map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => onMove(s.id)}>
                  <ArrowRight className="size-3.5 rtl:-scale-x-100" />
                  {t(s.label)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => toast.success(t("dm.crm.whatsapp_queued", { name: lead.name }))}
              >
                <MessageCircle className="size-3.5" />
                {t("dm.message_on_whatsapp")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="size-3" />
          <span className="font-mono">{lead.phone}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="size-3" />
          <span className="truncate">{lead.interestedIn}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {lead.source}
          </Badge>
          {followUp && (
            <Badge variant="outline" className={cn("gap-1 text-[10px]", followUp.tone)}>
              <Clock className="size-2.5" />
              {followUp.label}
            </Badge>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1.5 border-t border-border/50 pt-2.5">
          <Avatar size="sm">
            <AvatarFallback className="text-[9px]">{initials(lead.assignedTo)}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground">{lead.assignedTo}</span>
        </div>
      </Card>
    </motion.div>
  );
}

export default function Page() {
  const { live } = useCompany();
  return live ? <LiveLeads /> : <DemoCrmPage />;
}
