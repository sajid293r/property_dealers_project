"use client";

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

const STAGES: { id: LeadStatus; label: string }[] = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "negotiation", label: "Negotiation" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

const STAGE_DOT: Record<LeadStatus, string> = {
  new: "bg-primary",
  contacted: "bg-muted-foreground",
  negotiation: "bg-gold",
  won: "bg-success",
  lost: "bg-destructive",
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
    return { label: `Overdue ${Math.abs(days)}d`, tone: "bg-destructive/10 text-destructive border-destructive/30" };
  }
  if (days === 0) return { label: "Due today", tone: "bg-warning/15 text-warning border-warning/30" };
  if (days === 1) return { label: "Tomorrow", tone: "bg-warning/15 text-warning border-warning/30" };
  if (days <= 3) return { label: `In ${days}d`, tone: "bg-gold/15 text-gold border-gold/30" };
  return { label: formatDate(dateStr), tone: "bg-secondary text-secondary-foreground border-border" };
}

export default function CrmPage() {
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
    toast.success(`${lead.name} moved to ${STAGES.find((s) => s.id === next)?.label}`);
  }

  const columns = STAGES.map((stage) => ({
    ...stage,
    leads: filtered.filter((l) => statusOf(l) === stage.id),
  }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Leads (CRM)</h1>
          <p className="text-sm text-muted-foreground">
            {leads?.length ?? 0} leads across all sources — track from first contact to a closed deal.
          </p>
        </div>
        <Button className="gap-1.5">
          <PlusCircle className="size-4" />
          Add Lead
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <DataTableSearch value={search} onChange={setSearch} placeholder="Search name, phone..." />
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agent} onValueChange={setAgent}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder="Assigned to" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
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
              <div key={col.id} className="w-72 shrink-0">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn("size-2 rounded-full", STAGE_DOT[col.id])} />
                  <h3 className="font-heading text-sm font-semibold">{col.label}</h3>
                  <Badge variant="secondary" className="ml-auto text-[10px] tabular-nums">
                    {col.leads.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {col.leads.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                      No leads here
                    </div>
                  )}
                  {col.leads.map((lead, i) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      status={col.id}
                      index={i}
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
  onMove,
}: {
  lead: Lead;
  status: LeadStatus;
  index: number;
  onMove: (next: LeadStatus) => void;
}) {
  const followUp = followUpMeta(lead.nextFollowUp);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.04 }}
    >
      <Card className="group p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{lead.name}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="-mr-1 -mt-1 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[11px]">Move to</DropdownMenuLabel>
              {STAGES.filter((s) => s.id !== status).map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => onMove(s.id)}>
                  <ArrowRight className="size-3.5" />
                  {s.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => toast.success(`WhatsApp reminder queued for ${lead.name}`)}
              >
                <MessageCircle className="size-3.5" />
                Message on WhatsApp
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
