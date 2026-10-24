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

interface Row {
  installmentId: string; seq: number; kind: string; dueDate: string; outstanding: string; daysLate: number; bookingId: string; bookingNo: string; partyId: string;
  customerName: string; phone: string | null; propertyCode: string; propertyTitle: string; lastReminderAt: string | null; reminders: number;
}
interface Collections { rows: Row[]; totals: { overdueCount: number; overdueAmount: string; weekCount: number; weekAmount: string } }

const BUCKETS = [["overdue", "Overdue"], ["week", "Due this week"], ["month", "Due this month"]] as const;

/** The message a customer gets. Written to be polite and plain; staff can edit it in WhatsApp before sending. */
export function reminderText(lang: "en" | "ur", r: Row, company: string) {
  const amount = formatMoney(num(r.outstanding));
  const date = formatDate(r.dueDate);
  const late = r.daysLate > 0;
  if (lang === "ur") {
    return `السلام علیکم ${r.customerName}،\n${company} کی طرف سے یاددہانی: پلاٹ ${r.propertyCode} کی قسط نمبر ${r.seq} مبلغ ${amount} ${late ? `${date} کو واجب الادا تھی` : `${date} کو واجب الادا ہے`}۔ براہِ کرم ادائیگی فرما دیں۔ شکریہ۔`;
  }
  return `Assalam o Alaikum ${r.customerName},\nA reminder from ${company}: installment ${r.seq} of ${amount} for ${r.propertyCode} ${late ? `was due on ${date}` : `is due on ${date}`}. Please arrange the payment at your earliest convenience. JazakAllah.`;
}

export function CollectionsTab() {
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [bucket, setBucket] = React.useState<(typeof BUCKETS)[number][0]>("overdue");
  const [lang, setLang] = React.useState<"en" | "ur">("en");
  const q = useQuery({ queryKey: ["live", "collections", bucket], queryFn: () => api<Collections>(`/v1/collections?bucket=${bucket}`, { companyId: company.id }), staleTime: 15_000 });

  async function log(r: Row, channel: "whatsapp" | "call" | "sms", message?: string) {
    try {
      await api("/v1/reminders", { method: "POST", companyId: company.id, body: { bookingId: r.bookingId, installmentId: r.installmentId, channel, message } });
      await invalidate();
      toast.success("Marked as reminded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record it.");
    }
  }

  function whatsapp(r: Row) {
    if (!r.phone) return;
    const text = reminderText(lang, r, company.shortName || company.name);
    window.open(`https://wa.me/${r.phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    if (can("deals.create")) void log(r, "whatsapp", text);
  }

  const t = q.data?.totals;
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {BUCKETS.map(([k, l]) => (
            <Button key={k} size="sm" variant={bucket === k ? "default" : "outline"} className="h-7 rounded-full px-3 text-xs" onClick={() => setBucket(k)}>
              {l}{t ? ` · ${k === "overdue" ? t.overdueCount : k === "week" ? t.weekCount : ""}` : ""}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExportButton name="collections" headers={["Customer", "Phone", "Booking", "Property", "Installment", "Due", "Days late", "Owes"]} rows={(q.data?.rows ?? []).map((r) => [r.customerName, r.phone, r.bookingNo, r.propertyCode, r.seq, r.dueDate, r.daysLate, num(r.outstanding)])} />
          Message in
          {(["en", "ur"] as const).map((l) => <Button key={l} size="sm" variant={lang === l ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => setLang(l)}>{l === "en" ? "English" : "اردو"}</Button>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
              <th className="pb-2.5 font-medium">Customer</th><th className="pb-2.5 font-medium">Installment</th><th className="pb-2.5 font-medium">Due</th>
              <th className="pb-2.5 pr-3 text-right font-medium">Owes</th><th className="pb-2.5 font-medium">Last reminded</th><th className="pb-2.5" />
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : (q.data?.rows ?? []).map((r) => (
              <tr key={r.installmentId} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                <td className="py-2.5"><p className="font-medium">{r.customerName}</p><p className="text-xs text-muted-foreground">{r.phone ?? "No phone number"} · {r.propertyCode}</p></td>
                <td className="py-2.5"><span className="font-mono text-xs text-muted-foreground">{r.bookingNo}</span> · #{r.seq}</td>
                <td className={`py-2.5 ${r.daysLate > 0 ? "font-medium text-warning" : "text-muted-foreground"}`}>{formatDate(r.dueDate)}{r.daysLate > 0 && ` · ${r.daysLate}d late`}</td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums">{formatMoney(num(r.outstanding))}</td>
                <td className="py-2.5 text-xs text-muted-foreground">{r.lastReminderAt ? `${formatDate(r.lastReminderAt)} (${r.reminders}×)` : "Never"}</td>
                <td className="py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" className="gap-1" disabled={!r.phone} onClick={() => whatsapp(r)}><MessageCircle className="size-3.5" /> WhatsApp</Button>
                    {r.phone && <Button size="icon-sm" variant="ghost" aria-label="Call" asChild><a href={`tel:${r.phone}`} onClick={() => can("deals.create") && void log(r, "call")}><Phone className="size-4" /></a></Button>}
                    {can("deals.create") && <Button size="icon-sm" variant="ghost" aria-label="Mark as reminded" onClick={() => void log(r, "sms")}><Check className="size-4" /></Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && (q.data?.rows ?? []).length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{bucket === "overdue" ? "Nothing overdue. 🎉" : "No installments fall in this period."}</p>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">WhatsApp opens with the message ready — you press send from your own number. The reminder is recorded on the booking so nobody is chased twice by mistake.</p>
    </Card>
  );
}
