"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Repeat, Trash2, UserCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { VoucherTypeBadge } from "@/components/vouchers/voucher-type-badge";
import { VoucherStatusBadge } from "@/components/vouchers/voucher-status-badge";
import { VoucherSummaryPanel } from "@/components/vouchers/voucher-summary-panel";
import { RejectVoucherDialog } from "@/components/vouchers/reject-voucher-dialog";
import { useAccounts, useVouchers } from "@/lib/hooks/use-data";
import { chartLeafAccounts } from "@/lib/chart-of-accounts";
import { voucherTypeMeta } from "@/lib/vouchers";
import { formatDate, formatPkr } from "@/lib/format";
import type { Voucher } from "@/lib/types";
import { toast } from "sonner";

export default function VoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: vouchers, isLoading } = useVouchers();
  const { data: accounts } = useAccounts();
  const [rejectOpen, setRejectOpen] = React.useState(false);

  const voucher = vouchers?.find((v) => v.id === id);
  const leafAccounts = React.useMemo(() => chartLeafAccounts(accounts ?? []), [accounts]);

  function decide(status: "approved" | "rejected", note?: string) {
    if (!voucher) return;
    queryClient.setQueryData<Voucher[]>(["vouchers"], (old = []) =>
      old.map((v) =>
        v.id === voucher.id
          ? {
              ...v,
              status,
              approvedBy: "You",
              approvedAt: new Date().toISOString().slice(0, 10),
              approvalNote: note,
            }
          : v,
      ),
    );
    toast.success(status === "approved" ? `${voucher.number} approved` : `${voucher.number} rejected`);
  }

  function deleteDraft() {
    if (!voucher) return;
    queryClient.setQueryData<Voucher[]>(["vouchers"], (old = []) => old.filter((v) => v.id !== voucher.id));
    toast.success(`${voucher.number} deleted`);
    router.push("/dashboard/vouchers");
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!voucher) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <Link href="/dashboard/vouchers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to vouchers
        </Link>
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">This voucher doesn&apos;t exist, or was deleted.</p>
        </Card>
      </div>
    );
  }

  const meta = voucherTypeMeta(voucher.type);

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/dashboard/vouchers"
            className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Vouchers
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-semibold">{voucher.number}</h1>
            <VoucherTypeBadge type={voucher.type} />
            <VoucherStatusBadge status={voucher.status} />
            {voucher.recurring && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="size-3" />
                Recurring
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Meta label="Voucher date" value={formatDate(voucher.date)} />
              {voucher.chequeDate && <Meta label="Cheque date" value={formatDate(voucher.chequeDate)} />}
              {voucher.partyName && <Meta label={meta.partyLabel ?? "Party"} value={voucher.partyName} />}
              <Meta label="Created by" value={voucher.createdBy} />
            </div>
            <Separator className="my-4" />
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Description</p>
              <p className="text-sm">{voucher.description || "—"}</p>
            </div>

            {voucher.status === "rejected" && voucher.approvalNote && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/[0.06] p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <XCircle className="size-3.5" />
                  Rejection note
                </p>
                <p className="text-sm text-destructive/90">{voucher.approvalNote}</p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">Line items</h3>
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="py-2 pl-3 font-medium">Account</th>
                    <th className="py-2 pr-2 font-medium">Remarks</th>
                    <th className="py-2 pr-2 font-medium">Cost Center</th>
                    <th className="py-2 pr-2 font-medium">Project</th>
                    <th className="py-2 pr-3 text-right font-medium">Debit</th>
                    <th className="py-2 pr-3 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {voucher.lines.map((line) => {
                    const account = leafAccounts.find((a) => a.id === line.accountId);
                    return (
                      <tr key={line.id} className="border-b border-border/40 last:border-0">
                        <td className="py-2.5 pl-3">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">{account?.code}</span>
                            {account?.name ?? "Unknown account"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 text-muted-foreground">{line.remarks || "—"}</td>
                        <td className="py-2.5 pr-2 text-muted-foreground">{line.costCenter || "—"}</td>
                        <td className="py-2.5 pr-2 text-muted-foreground">{line.project || "—"}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{line.debit ? formatPkr(line.debit) : "—"}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{line.credit ? formatPkr(line.credit) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <VoucherSummaryPanel lines={voucher.lines} />

          {voucher.status === "pending" && (
            <Card className="space-y-2.5 p-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Approval</p>
              <Button className="w-full gap-1.5" onClick={() => decide("approved")}>
                <CheckCircle2 className="size-4" />
                Approve
              </Button>
              <Button variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive" onClick={() => setRejectOpen(true)}>
                <XCircle className="size-4" />
                Un-Approve (Reject)
              </Button>
            </Card>
          )}

          {voucher.status === "draft" && (
            <Card className="p-4">
              <Button variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive" onClick={deleteDraft}>
                <Trash2 className="size-4" />
                Delete draft
              </Button>
            </Card>
          )}

          {(voucher.approvedBy || voucher.createdBy) && (
            <Card className="space-y-3 p-4 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Activity</p>
              <ActivityRow label={`Created by ${voucher.createdBy}`} date={voucher.createdAt} />
              {voucher.approvedBy && voucher.approvedAt && (
                <ActivityRow
                  label={`${voucher.status === "rejected" ? "Rejected" : "Approved"} by ${voucher.approvedBy}`}
                  date={voucher.approvedAt}
                />
              )}
            </Card>
          )}
        </div>
      </div>

      <RejectVoucherDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        voucherNumber={voucher.number}
        onConfirm={(note) => decide("rejected", note || undefined)}
      />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function ActivityRow({ label, date }: { label: string; date: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <UserCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="leading-snug">{label}</p>
        <p className="text-xs text-muted-foreground">{formatDate(date)}</p>
      </div>
    </div>
  );
}
