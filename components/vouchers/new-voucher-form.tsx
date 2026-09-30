"use client";

import { PageHeader } from "@/components/page-header";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoucherLineEditor } from "@/components/vouchers/voucher-line-editor";
import { VoucherSummaryPanel } from "@/components/vouchers/voucher-summary-panel";
import { VoucherTypeBadge } from "@/components/vouchers/voucher-type-badge";
import { useAccounts, useUnits, useVouchers } from "@/lib/hooks/use-data";
import { chartLeafAccounts } from "@/lib/chart-of-accounts";
import { emptyLine, isBalanced, VOUCHER_TYPES, voucherTypeMeta } from "@/lib/vouchers";
import type { Voucher, VoucherLine, VoucherType } from "@/lib/types";
import { toast } from "sonner";

function isVoucherType(v: string | null): v is VoucherType {
  return !!v && VOUCHER_TYPES.some((t) => t.type === v);
}

export function NewVoucherForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: accounts } = useAccounts();
  const { data: units } = useUnits();
  const { data: vouchers } = useVouchers();

  const initialType = searchParams.get("type");
  const [type, setType] = React.useState<VoucherType>(isVoucherType(initialType) ? initialType : "CPV");
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [chequeDate, setChequeDate] = React.useState("");
  const [partyName, setPartyName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [recurring, setRecurring] = React.useState(false);
  const [lines, setLines] = React.useState<VoucherLine[]>([emptyLine("line-1"), emptyLine("line-2")]);
  const [saving, setSaving] = React.useState<"draft" | "submit" | null>(null);

  const meta = voucherTypeMeta(type);
  const leafAccounts = React.useMemo(() => chartLeafAccounts(accounts ?? []), [accounts]);
  const projects = React.useMemo(
    () => Array.from(new Set((units ?? []).map((u) => u.project))).sort(),
    [units],
  );

  const nextNumber = React.useMemo(() => {
    const sameType = (vouchers ?? []).filter((v) => v.type === type);
    const maxSeq = sameType.reduce((max, v) => {
      const seq = Number(v.number.split("-")[1]);
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
    return `${type}-${String(maxSeq + 1).padStart(5, "0")}`;
  }, [vouchers, type]);

  const balanced = isBalanced(lines);
  const canSubmit = balanced && description.trim().length > 0 && (!meta.partyLabel || partyName.trim().length > 0);

  function persist(status: "draft" | "pending") {
    setSaving(status === "draft" ? "draft" : "submit");
    const id = `voucher-${Date.now()}`;
    const now = new Date().toISOString().slice(0, 10);
    const newVoucher: Voucher = {
      id,
      type,
      number: nextNumber,
      date,
      chequeDate: meta.showChequeDate && chequeDate ? chequeDate : undefined,
      partyName: meta.partyLabel ? partyName : undefined,
      description,
      lines: lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0)),
      status,
      recurring,
      createdBy: "You",
      createdAt: now,
    };

    window.setTimeout(() => {
      queryClient.setQueryData<Voucher[]>(["vouchers"], (old = []) => [newVoucher, ...old]);
      toast.success(
        status === "draft" ? `${nextNumber} saved as draft` : `${nextNumber} submitted for approval`,
        { description: meta.label },
      );
      router.push(`/dashboard/vouchers/${id}`);
    }, 400);
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={meta.icon}
        back={{ href: "/dashboard/vouchers", label: "Vouchers" }}
        title={`New ${meta.label}`}
        badge={<VoucherTypeBadge type={type} />}
        description={meta.description}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Voucher type</Label>
                <Select value={type} onValueChange={(v) => setType(v as VoucherType)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VOUCHER_TYPES.map((t) => (
                      <SelectItem key={t.type} value={t.type}>{t.label} ({t.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Voucher no.</Label>
                <Input value={nextNumber} disabled className="font-mono" />
              </div>

              <div>
                <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Voucher date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {meta.showChequeDate && (
                <div>
                  <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Cheque date</Label>
                  <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                </div>
              )}

              {meta.partyLabel && (
                <div className={meta.showChequeDate ? "sm:col-span-2" : ""}>
                  <Label className="mb-1.5 text-xs font-medium text-muted-foreground">{meta.partyLabel}</Label>
                  <Input
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    placeholder={meta.partyLabel === "Pay to" ? "Vendor or payee name" : "Payer or customer name"}
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this voucher for..."
                rows={2}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={recurring} onCheckedChange={(c) => setRecurring(c === true)} />
              <Repeat className="size-3.5" />
              Make this a recurring voucher
            </label>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">Line items</h3>
            <VoucherLineEditor lines={lines} onChange={setLines} accounts={leafAccounts} projects={projects} />
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <VoucherSummaryPanel lines={lines} />

          <Card className="space-y-2.5 p-4">
            <Button
              className="w-full"
              disabled={!canSubmit || saving !== null}
              onClick={() => persist("pending")}
            >
              {saving === "submit" ? "Submitting..." : "Submit for Approval"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={saving !== null}
              onClick={() => persist("draft")}
            >
              {saving === "draft" ? "Saving..." : "Save as Draft"}
            </Button>
            <Button variant="ghost" className="w-full" asChild disabled={saving !== null}>
              <Link href="/dashboard/vouchers">Cancel</Link>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
