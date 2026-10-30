"use client";

import { useCompany } from "@/lib/providers/company-provider";
import { LiveVoucherDetail } from "@/components/live/voucher-detail";

import { PageHeader } from "@/components/page-header";
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
import { useT } from "@/lib/i18n/provider";

function DemoVoucherDetailPage() {
  const t = useT();
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
          <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
          {t("dm.back_to_vouchers")}
        </Link>
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("dm.v.missing")}</p>
        </Card>
      </div>
    );
  }

  const meta = voucherTypeMeta(voucher.type);

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={meta.icon}
        back={{ href: "/dashboard/vouchers", label: t("vch.title") }}
        title={voucher.number}
        badge={
          <>
            <VoucherTypeBadge type={voucher.type} />
            <VoucherStatusBadge status={voucher.status} />
            {voucher.recurring && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="size-3" />
                {t("dm.recurring")}
              </span>
            )}
          </>
        }
        description={meta.label}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Meta label={t("vch.f.voucherDate")} value={formatDate(voucher.date)} />
              {voucher.chequeDate && <Meta label={t("chq.csv.date")} value={formatDate(voucher.chequeDate)} />}
              {voucher.partyName && <Meta label={meta.partyLabel ?? "Party"} value={voucher.partyName} />}
              <Meta label={t("dm.created_by")} value={voucher.createdBy} />
            </div>
            <Separator className="my-4" />
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t("rec.st.colDescription")}</p>
              <p className="text-sm">{voucher.description || "—"}</p>
            </div>

            {voucher.status === "rejected" && voucher.approvalNote && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/[0.06] p-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <XCircle className="size-3.5" />
                  {t("dm.rejection_note")}
                </p>
                <p className="text-sm text-destructive/90">{voucher.approvalNote}</p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">{t("dm.line_items")}</h3>
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/50 text-start text-xs text-muted-foreground">
                    <th className="py-2 ps-3 font-medium">{t("account.eyebrow")}</th>
                    <th className="py-2 pe-2 font-medium">{t("dm.remarks")}</th>
                    <th className="py-2 pe-2 font-medium">{t("dm.cost_center")}</th>
                    <th className="py-2 pe-2 font-medium">{t("audit.entity.projects")}</th>
                    <th className="py-2 pe-3 text-end font-medium">{t("vch.d.colDebit")}</th>
                    <th className="py-2 pe-3 text-end font-medium">{t("vch.d.colCredit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {voucher.lines.map((line) => {
                    const account = leafAccounts.find((a) => a.id === line.accountId);
                    return (
                      <tr key={line.id} className="border-b border-border/40 last:border-0">
                        <td className="py-2.5 ps-3">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">{account?.code}</span>
                            {account?.name ?? t("dm.v.unknown_account")}
                          </span>
                        </td>
                        <td className="py-2.5 pe-2 text-muted-foreground">{line.remarks || "—"}</td>
                        <td className="py-2.5 pe-2 text-muted-foreground">{line.costCenter || "—"}</td>
                        <td className="py-2.5 pe-2 text-muted-foreground">{line.project || "—"}</td>
                        <td className="py-2.5 pe-3 text-end tabular-nums">{line.debit ? formatPkr(line.debit) : "—"}</td>
                        <td className="py-2.5 pe-3 text-end tabular-nums">{line.credit ? formatPkr(line.credit) : "—"}</td>
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
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t("dm.approval")}</p>
              <Button className="w-full gap-1.5" onClick={() => decide("approved")}>
                <CheckCircle2 className="size-4" />
                {t("perm.action.approve")}
              </Button>
              <Button variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive" onClick={() => setRejectOpen(true)}>
                <XCircle className="size-4" />
                {t("dm.un_approve_reject")}
              </Button>
            </Card>
          )}

          {voucher.status === "draft" && (
            <Card className="p-4">
              <Button variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive" onClick={deleteDraft}>
                <Trash2 className="size-4" />
                {t("dm.delete_draft")}
              </Button>
            </Card>
          )}

          {(voucher.approvedBy || voucher.createdBy) && (
            <Card className="space-y-3 p-4 text-sm">
              <p className="text-xs font-medium text-muted-foreground">{t("dm.activity")}</p>
              <ActivityRow label={t("dm.v.created_by", { name: voucher.createdBy })} date={voucher.createdAt} />
              {voucher.approvedBy && voucher.approvedAt && (
                <ActivityRow
                  label={t(voucher.status === "rejected" ? "vch.d.rejectedBy" : "vch.d.approvedBy", { name: voucher.approvedBy ?? "" })}
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

export default function Page() {
  const { live } = useCompany();
  return live ? <LiveVoucherDetail /> : <DemoVoucherDetailPage />;
}
