"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { api } from "@/lib/api/client";
import { num } from "@/lib/api/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { ExportButton } from "@/components/live/export-button";
import { useT } from "@/lib/i18n/provider";
import { Ltr } from "@/components/ltr";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES, type LanguageCode } from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import { makeTranslate, type TranslateFn } from "@/lib/i18n/runtime";
import type { Messages } from "@/lib/i18n/messages/en";

interface Row {
  installmentId: string; seq: number; kind: string; dueDate: string; outstanding: string; daysLate: number; bookingId: string; bookingNo: string; partyId: string;
  customerName: string; phone: string | null; propertyCode: string; propertyTitle: string; lastReminderAt: string | null; reminders: number;
}
interface Collections { rows: Row[]; totals: { overdueCount: number; overdueAmount: string; weekCount: number; weekAmount: string } }

const BUCKETS = ["overdue", "week", "month"] as const;

/**
 * The message a customer gets, in the language chosen for the customer (not the one the staff member's screen is in).
 * Written to be polite and plain; staff can edit it in WhatsApp before sending.
 */
export function reminderText(tr: TranslateFn, r: Row, company: string) {
  return tr(r.daysLate > 0 ? "reminder.late" : "reminder.due", {
    name: r.customerName, company, property: r.propertyCode, seq: r.seq, amount: formatMoney(num(r.outstanding)), date: formatDate(r.dueDate),
  });
}

export function CollectionsTab() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [bucket, setBucket] = React.useState<(typeof BUCKETS)[number]>("overdue");
  // Customers are most often reached in Urdu; staff can pick any of the 8 languages per message.
  const [lang, setLang] = React.useState<LanguageCode>("ur");
  const [dict, setDict] = React.useState<{ lang: LanguageCode; messages: Partial<Messages> | null } | null>(null);
  React.useEffect(() => {
    let live = true;
    void loadMessages(lang).then((messages) => { if (live) setDict({ lang, messages }); });
    return () => { live = false; };
  }, [lang]);
  const q = useQuery({ queryKey: ["live", "collections", bucket], queryFn: () => api<Collections>(`/v1/collections?bucket=${bucket}`, { companyId: company.id }), staleTime: 15_000 });

  async function log(r: Row, channel: "whatsapp" | "call" | "sms", message?: string) {
    try {
      await api("/v1/reminders", { method: "POST", companyId: company.id, body: { bookingId: r.bookingId, installmentId: r.installmentId, channel, message } });
      await invalidate();
      toast.success(t("common.markedReminded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("deals.col.couldNotRecord"));
    }
  }

  function whatsapp(r: Row) {
    if (!r.phone) return;
    const text = reminderText(makeTranslate(lang, dict?.lang === lang ? dict.messages : null), r, company.shortName || company.name);
    window.open(`https://wa.me/${r.phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    if (can("deals.create")) void log(r, "whatsapp", text);
  }

  const totals = q.data?.totals;
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {BUCKETS.map((k) => (
            <Button key={k} size="sm" variant={bucket === k ? "default" : "outline"} className="h-7 rounded-full px-3 text-xs" onClick={() => setBucket(k)}>
              {t(`deals.col.${k}Bucket`)}{totals ? ` · ${k === "overdue" ? totals.overdueCount : k === "week" ? totals.weekCount : ""}` : ""}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExportButton name="collections" headers={[t("deals.col.exportCustomer"), t("deals.col.exportPhone"), t("deals.col.exportBooking"), t("deals.col.exportProperty"), t("deals.col.exportInstallment"), t("deals.col.exportDue"), t("deals.col.exportDaysLate"), t("deals.col.exportOwes")]} rows={(q.data?.rows ?? []).map((r) => [r.customerName, r.phone, r.bookingNo, r.propertyCode, r.seq, r.dueDate, r.daysLate, num(r.outstanding)])} />
          {t("deals.col.messageIn")}
          <Select value={lang} onValueChange={(v) => setLang(v as LanguageCode)}>
            <SelectTrigger size="sm" className="h-7 w-[130px] text-xs" aria-label={t("deals.col.messageIn")}><SelectValue /></SelectTrigger>
            <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}><span lang={l.code}>{l.native}</span></SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
              <th className="pb-2.5 font-medium">{t("deals.col.customer")}</th><th className="pb-2.5 font-medium">{t("deals.col.installment")}</th><th className="pb-2.5 font-medium">{t("deals.col.due")}</th>
              <th className="pb-2.5 pe-3 text-end font-medium">{t("deals.col.owes")}</th><th className="pb-2.5 font-medium">{t("deals.col.lastReminded")}</th><th className="pb-2.5" />
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : (q.data?.rows ?? []).map((r) => (
              <tr key={r.installmentId} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                <td className="py-2.5"><p className="font-medium">{r.customerName}</p><p className="text-xs text-muted-foreground"><Ltr>{r.phone ?? t("common.noPhone")}</Ltr> · <Ltr>{r.propertyCode}</Ltr></p></td>
                <td className="py-2.5"><span className="font-mono text-xs text-muted-foreground"><Ltr>{r.bookingNo}</Ltr></span> · <Ltr>#{r.seq}</Ltr></td>
                <td className={`py-2.5 ${r.daysLate > 0 ? "font-medium text-warning" : "text-muted-foreground"}`}>{formatDate(r.dueDate)}{r.daysLate > 0 && ` · ${t("deals.col.daysLate", { days: r.daysLate })}`}</td>
                <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{formatMoney(num(r.outstanding))}</td>
                <td className="py-2.5 text-xs text-muted-foreground">{r.lastReminderAt ? `${formatDate(r.lastReminderAt)} ${t("deals.col.times", { count: r.reminders })}` : t("deals.col.never")}</td>
                <td className="py-2.5 text-end">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" className="gap-1" disabled={!r.phone} onClick={() => whatsapp(r)}><MessageCircle className="size-3.5" /> {t("deals.col.whatsapp")}</Button>
                    {r.phone && <Button size="icon-sm" variant="ghost" aria-label={t("deals.col.call")} asChild><a href={`tel:${r.phone}`} onClick={() => can("deals.create") && void log(r, "call")}><Phone className="size-4" /></a></Button>}
                    {can("deals.create") && <Button size="icon-sm" variant="ghost" aria-label={t("deals.col.markReminded")} onClick={() => void log(r, "sms")}><Check className="size-4" /></Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && (q.data?.rows ?? []).length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{bucket === "overdue" ? t("deals.col.nothingOverdue") : t("deals.col.noneInPeriod")}</p>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("deals.col.footnote")}</p>
    </Card>
  );
}
