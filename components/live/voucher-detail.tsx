"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Send, Trash2, Undo2, XCircle, FileEdit } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveVoucherStatusBadge, LiveVoucherTypeBadge } from "@/components/live/voucher-badges";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { discardVoucher, getVoucher, num, voucherAction } from "@/lib/api/finance";
import { liveVoucherMeta } from "@/lib/live-vouchers";
import { amountInWords } from "@/lib/amount-words";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { PrintLink } from "@/components/live/print-button";
import { AttachmentsButton } from "@/components/live/attachments";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium">{value}</p>
    </div>
  );
}

const INSTRUMENT_LABEL: Record<string, string> = {
  cheque: "Cheque",
  online_transfer: "Online transfer",
  pay_order: "Pay order",
  demand_draft: "Demand draft",
  cash_deposit: "Cash deposit",
  other: "Other",
};

export function LiveVoucherDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [busy, setBusy] = React.useState(false);
  const [dialog, setDialog] = React.useState<"reject" | "void" | null>(null);

  const q = useQuery({ queryKey: ["live", "voucher", id], queryFn: () => getVoucher(company.id, id), staleTime: 5_000 });

  async function run(action: "submit" | "recall" | "approve", message: string) {
    setBusy(true);
    try {
      await voucherAction(company.id, id, action);
      await invalidate();
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    try {
      await discardVoucher(company.id, id);
      await invalidate();
      toast.success("Voucher discarded");
      router.push("/dashboard/vouchers");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not discard it.");
      setBusy(false);
    }
  }

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  const v = q.data;
  if (!v) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <Link href="/dashboard/vouchers" className="text-sm text-muted-foreground hover:text-foreground">← Back to vouchers</Link>
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">{q.error instanceof Error ? q.error.message : "This voucher doesn't exist."}</p>
        </Card>
      </div>
    );
  }

  const meta = liveVoucherMeta(v.type);
  const total = num(v.total);
  const editable = v.status === "draft" || v.status === "rejected";

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <PrintLink kind="voucher" id={v.id} size="default" /><AttachmentsButton entityType="voucher" entityId={v.id} title={v.number} size="default" canEdit={can("accounts.edit")} categories={["Bill / invoice", "Cheque copy", "Payment proof", "Other"]} />
      {editable && can("accounts.edit") && (
        <>
          <Button variant="outline" className="gap-1.5" asChild>
            <Link href={`/dashboard/vouchers/new?edit=${v.id}`}><FileEdit className="size-4" /> Edit</Link>
          </Button>
          <Button variant="outline" className="gap-1.5 text-destructive" disabled={busy} onClick={() => void discard()}>
            <Trash2 className="size-4" /> Discard
          </Button>
        </>
      )}
      {editable && can("accounts.create") && (
        <Button className="gap-1.5" disabled={busy} onClick={() => void run("submit", `${v.number} sent for approval`)}>
          <Send className="size-4" /> Submit for approval
        </Button>
      )}
      {v.status === "pending" && can("accounts.create") && (
        <Button variant="outline" className="gap-1.5" disabled={busy} onClick={() => void run("recall", `${v.number} recalled to draft`)}>
          <Undo2 className="size-4" /> Recall
        </Button>
      )}
      {v.status === "pending" && can("accounts.approve") && (
        <>
          <Button variant="outline" className="gap-1.5 text-destructive" disabled={busy} onClick={() => setDialog("reject")}>
            <XCircle className="size-4" /> Reject
          </Button>
          <Button className="gap-1.5" disabled={busy} onClick={() => void run("approve", `${v.number} approved and posted`)}>
            <CheckCircle2 className="size-4" /> Approve &amp; post
          </Button>
        </>
      )}
      {v.status === "approved" && can("accounts.approve") && (
        <Button variant="outline" className="gap-1.5 text-destructive" disabled={busy} onClick={() => setDialog("void")}>
          <Ban className="size-4" /> Void
        </Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={meta.icon}
        back={{ href: "/dashboard/vouchers", label: "Vouchers" }}
        title={v.number}
        badge={<><LiveVoucherTypeBadge type={v.type} /><LiveVoucherStatusBadge status={v.status} /></>}
        description={`${meta.label} · ${formatDate(v.date)}`}
        actions={actions}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Fact label={meta.partyLabel ?? "Party"} value={v.partyName} />
              <Fact label="Bank account" value={v.bankName ? `${v.bankName} ${v.bankAccountNo ?? ""}` : null} />
              <Fact label={v.controlAccountId ? meta.fixedSideLabel ?? "Control account" : ""} value={v.controlAccountCode ? `${v.controlAccountCode} · ${v.controlAccountName}` : null} />
              <Fact label="Paid by" value={v.instrumentType ? INSTRUMENT_LABEL[v.instrumentType] : null} />
              <Fact label="Instrument no." value={v.instrumentNo} />
              <Fact label="Instrument bank" value={v.instrumentBank} />
              <Fact label="Cheque date" value={v.chequeDate ? formatDate(v.chequeDate) : null} />
              <Fact label="Reference" value={v.reference} />
              <Fact label="Invoice no." value={v.invoiceNo} />
              <Fact label="Due date" value={v.dueDate ? formatDate(v.dueDate) : null} />
            </div>
            {v.description && <p className="mt-4 border-t border-border/60 pt-3 text-sm text-muted-foreground">{v.description}</p>}
            {v.approvalNote && <p className="mt-2 text-sm text-muted-foreground">Note: {v.approvalNote}</p>}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-heading text-base font-semibold">{meta.linesTitle}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Account</th>
                    <th className="pb-2 font-medium">Party / Remarks</th>
                    <th className="pb-2 pe-3 text-end font-medium">Debit</th>
                    <th className="pb-2 pe-3 text-end font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {v.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 text-muted-foreground">{l.lineNo}</td>
                      <td className="py-2"><span className="font-mono text-xs text-muted-foreground">{l.accountCode}</span> {l.accountName}</td>
                      <td className="py-2 text-muted-foreground">{[l.partyName, l.remarks].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{num(l.debit) ? formatMoney(num(l.debit)) : ""}</td>
                      <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{num(l.credit) ? formatMoney(num(l.credit)) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {v.journal.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-1 font-heading text-base font-semibold">Posted to the books</h3>
              <p className="mb-3 text-xs text-muted-foreground">The entries this voucher created in the general ledger.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <tbody>
                    {v.journal.map((j) => (
                      <tr key={j.lineNo} className="border-b border-border/40 last:border-0">
                        <td className="py-2"><span className="font-mono text-xs text-muted-foreground">{j.accountCode}</span> {j.accountName}</td>
                        <td className="py-2 text-muted-foreground">{j.partyName ?? ""}</td>
                        <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{num(j.debit) ? formatMoney(num(j.debit)) : ""}</td>
                        <td className="whitespace-nowrap py-2 pe-3 text-end font-mono tabular-nums">{num(j.credit) ? formatMoney(num(j.credit)) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <Card className="h-fit p-5">
          <p className="text-xs text-muted-foreground">Total amount</p>
          <p className="mt-1 break-words font-heading text-2xl font-semibold tabular-nums">{formatMoney(total)}</p>
          <p className="mt-2 text-xs italic text-muted-foreground">{amountInWords(String(v.total))}</p>
          <div className="mt-4 space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {v.createdBy && <p>Prepared by {v.createdBy}</p>}
            {v.approvedBy && <p>{v.status === "rejected" ? "Rejected" : "Approved"} by {v.approvedBy}{v.approvedAt ? ` on ${formatDate(v.approvedAt)}` : ""}</p>}
          </div>
        </Card>
      </div>

      <ReasonDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && setDialog(null)}
        icon={XCircle}
        title={`Reject ${v.number}`}
        description="The preparer will see your reason and can fix and resubmit it."
        submitLabel="Reject voucher"
        onSubmit={async (reason) => {
          await voucherAction(company.id, id, "reject", { reason });
          await invalidate();
          toast.success(`${v.number} rejected`);
        }}
      />
      <ReasonDialog
        open={dialog === "void"}
        onOpenChange={(o) => !o && setDialog(null)}
        icon={Ban}
        title={`Void ${v.number}`}
        description="Posted entries are never deleted. A reversing entry is posted instead, dated as below."
        submitLabel="Void voucher"
        dateLabel="Reverse on"
        onSubmit={async (reason, date) => {
          await voucherAction(company.id, id, "void", { reason, date });
          await invalidate();
          toast.success(`${v.number} voided`);
        }}
      />
    </div>
  );
}
