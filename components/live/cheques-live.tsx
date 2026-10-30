"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, CalendarClock, CheckCircle2, Landmark, Plus, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTableSearch } from "@/components/data-table/data-table-toolbar";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { AmountInput } from "@/components/live/amount-input";
import { SearchSelect } from "@/components/live/search-select";
import { PartySelect } from "@/components/live/party-select";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { BankSelect, type BankValue } from "@/components/live/bank-select";
import { useCompany } from "@/lib/providers/company-provider";
import { useBankAccounts, useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { chequeAction, createCheque, listCheques, type ChequeRow, type ChequeStatus } from "@/lib/api/modules";
import { listBookings } from "@/lib/api/sales";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { ExportButton } from "@/components/live/export-button";
import { AttachmentsButton } from "@/components/live/attachments";
import { useT } from "@/lib/i18n/provider";

const STATUS: Record<ChequeStatus, { cls: string }> = {
  in_hand: { cls: "bg-primary/12 text-primary" },
  deposited: { cls: "bg-gold/15 text-gold" },
  cleared: { cls: "bg-success/12 text-success" },
  bounced: { cls: "bg-destructive/10 text-destructive" },
  returned: { cls: "bg-muted text-muted-foreground" },
  cancelled: { cls: "bg-muted text-muted-foreground" },
};

export function LiveCheques() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [dir, setDir] = React.useState<"received" | "issued">("received");
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [depositing, setDepositing] = React.useState<ChequeRow | null>(null);
  const [bouncing, setBouncing] = React.useState<ChequeRow | null>(null);
  const [bankAccount, setBankAccount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const banks = useBankAccounts();
  const q = useQuery({ queryKey: ["live", "cheques"], queryFn: () => listCheques(company.id), staleTime: 15_000 });

  const all = q.data ?? [];
  const mine = all.filter((c) => c.direction === dir && (!search.trim() || `${c.chequeNo} ${c.partyName} ${c.bankName}`.toLowerCase().includes(search.trim().toLowerCase())));
  const pending = all.filter((c) => c.direction === "received" && (c.status === "in_hand" || c.status === "deposited"));
  const dueNow = pending.filter((c) => c.chequeDate <= todayIso() && c.status === "in_hand");

  async function act(c: ChequeRow, action: "clear" | "return", ok: string) {
    setBusy(true);
    try { await chequeAction(company.id, c.id, action); await invalidate(); toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : t("common.thatDidNotWork")); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader icon={CalendarClock} eyebrow={t("nav.section.sales")} title={t("chq.title")} description={t("chq.description")}
        actions={can("deals.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" /> {t("chq.add")}</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={CalendarClock} label={t("chq.tile.toCollect")} value={pending.length} />
        <StatTile icon={AlertTriangle} label={t("chq.tile.ready")} value={dueNow.length} accent={dueNow.length ? "warning" : "muted"} />
        <StatTile icon={Landmark} label={t("chq.tile.pending")} value={formatMoney(pending.reduce((s, c) => s + num(c.amount), 0), { compact: true })} accent="gold" />
        <StatTile icon={Ban} label={t("chq.tile.bounced")} value={all.filter((c) => c.status === "bounced").length} accent="muted" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Tabs value={dir} onValueChange={(v) => setDir(v as typeof dir)}>
            <TabsList><TabsTrigger value="received">{t("chq.tab.received")}</TabsTrigger><TabsTrigger value="issued">{t("chq.tab.issued")}</TabsTrigger></TabsList>
          </Tabs>
          <div className="flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder={t("chq.search")} /><ExportButton name="cheques" headers={[t("chq.csv.cheque"), t("chq.csv.direction"), t("chq.csv.party"), t("chq.csv.bank"), t("chq.csv.date"), t("common.amount"), t("common.status")]} rows={mine.map((c) => [c.chequeNo, t(`chq.tab.${c.direction}`), c.partyName, c.bankName, c.chequeDate, num(c.amount), t(`chq.status.${c.status}`)])} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">{t("chq.col.cheque")}</th><th className="pb-2.5 font-medium">{dir === "received" ? t("chq.col.from") : t("chq.col.to")}</th><th className="pb-2.5 font-medium">{t("chq.col.date")}</th>
                <th className="pb-2.5 pe-3 text-end font-medium">{t("common.amount")}</th><th className="pb-2.5 font-medium">{t("common.status")}</th><th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : mine.map((c) => {
                const ready = c.status === "in_hand" && c.chequeDate <= todayIso();
                return (
                  <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                    <td className="py-2.5"><p className="font-mono font-medium">{c.chequeNo}</p><p className="text-xs text-muted-foreground">{c.bankName}</p></td>
                    <td className="py-2.5"><p>{c.partyName}</p>{c.bookingNo && <p className="text-xs text-muted-foreground">{c.bookingNo}</p>}</td>
                    <td className={`py-2.5 ${ready ? "font-medium text-warning" : "text-muted-foreground"}`}>{formatDate(c.chequeDate)}{ready && ` · ${t("chq.readyMark")}`}</td>
                    <td className="whitespace-nowrap py-2.5 pe-3 text-end font-mono tabular-nums">{formatMoney(num(c.amount))}</td>
                    <td className="py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[c.status].cls}`}>{t(`chq.status.${c.status}`)}</span>
                      {c.status === "bounced" && c.bounceReason && <p className="mt-0.5 text-xs text-destructive">{c.bounceReason}</p>}
                      {c.status === "deposited" && c.depositBank && <p className="mt-0.5 text-xs text-muted-foreground">{t("chq.inBank", { bank: c.depositBank, account: c.depositAccountNo ?? "" })}</p>}
                    </td>
                    <td className="py-2.5 text-end">
                      {can("deals.edit") && (
                        <div className="flex justify-end gap-1.5">
                          <AttachmentsButton entityType="cheque" entityId={c.id} title={t("chq.attachTitle", { no: c.chequeNo })} iconOnly canEdit categories={["Cheque image", "Deposit slip", "Bank advice"]} />
                          {c.direction === "received" && c.status === "in_hand" && <Button size="sm" variant="outline" onClick={() => { setBankAccount(banks.data?.[0]?.id ?? ""); setDepositing(c); }}>{t("chq.deposit")}</Button>}
                          {((c.direction === "received" && c.status === "deposited") || (c.direction === "issued" && c.status === "in_hand")) && <Button size="sm" className="gap-1" disabled={busy} onClick={() => void act(c, "clear", t("chq.clearedDone"))}><CheckCircle2 className="size-3.5" /> {t("chq.cleared")}</Button>}
                          {(c.status === "in_hand" || c.status === "deposited") && c.direction === "received" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setBouncing(c)}>{t("chq.bounced")}</Button>}
                          {c.status === "in_hand" && <Button size="icon-sm" variant="ghost" aria-label={t("chq.returnAria")} disabled={busy} onClick={() => void act(c, "return", c.direction === "issued" ? t("chq.cancelledDone") : t("chq.returnedDone"))}><Undo2 className="size-4" /></Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!q.isLoading && mine.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t("chq.empty")}</p>}
        </div>
      </Card>

      <NewChequeDialog open={creating} onOpenChange={setCreating} />

      <FormDialog open={!!depositing} onOpenChange={(o) => !o && setDepositing(null)} icon={Landmark} title={t("chq.deposit.title")} description={t("chq.deposit.description", { no: depositing?.chequeNo ?? "", amount: formatMoney(num(depositing?.amount)) })}
        submitLabel={t("chq.deposit.submit")} submitDisabled={!bankAccount}
        onSubmit={async () => { await chequeAction(company.id, depositing!.id, "deposit", { bankAccountId: bankAccount }); await invalidate(); toast.success(t("chq.deposit.done")); }}>
        <Field label={t("chq.deposit.into")}>
          <Select value={bankAccount} onValueChange={setBankAccount}>
            <SelectTrigger><SelectValue placeholder={t("chq.deposit.chooseBank")} /></SelectTrigger>
            <SelectContent>{(banks.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} · {b.accountNo}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </FormDialog>

      <ReasonDialog open={!!bouncing} onOpenChange={(o) => !o && setBouncing(null)} icon={Ban} title={t("chq.bounce.title", { no: bouncing?.chequeNo ?? "" })} description={t("chq.bounce.description")} submitLabel={t("chq.bounce.submit")} reasonLabel={t("chq.bounce.reason")}
        onSubmit={async (reason) => { await chequeAction(company.id, bouncing!.id, "bounce", { reason }); await invalidate(); toast.success(t("chq.bounce.done")); }} />
    </div>
  );
}

function NewChequeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [direction, setDirection] = React.useState<"received" | "issued">("received");
  const [no, setNo] = React.useState("");
  const [bank, setBank] = React.useState<BankValue>({ bankId: null, bankName: "" });
  const [partyId, setPartyId] = React.useState<string | null>(null);
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const bookings = useQuery({ queryKey: ["live", "bookings", "all"], queryFn: () => listBookings(company.id), enabled: open && direction === "received", staleTime: 15_000 });
  const mine = (bookings.data ?? []).filter((b) => b.status !== "cancelled" && (!partyId || b.customerId === partyId));

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={CalendarClock} title={t("chq.add")} description={t("chq.new.description")}
      submitLabel={t("chq.new.submit")} submitDisabled={!no.trim() || !bank.bankName.trim() || !partyId || num(amount) <= 0}
      onSubmit={async () => {
        await createCheque(company.id, { direction, chequeNo: no.trim(), bankName: bank.bankName.trim(), partyId, bookingId: direction === "received" ? bookingId || undefined : undefined, amount, chequeDate: date });
        await invalidate();
        toast.success(t("chq.new.saved"));
        setNo(""); setAmount("");
      }}>
      <Field label={t("chq.new.whose")}>
        <div className="flex gap-1.5">
          {(["received", "issued"] as const).map((d) => <Button key={d} type="button" size="sm" variant={direction === d ? "default" : "outline"} onClick={() => setDirection(d)}>{d === "received" ? t("chq.new.givenToUs") : t("chq.new.givenByUs")}</Button>)}
        </div>
      </Field>
      <Field label={direction === "received" ? t("common.customer") : t("chq.new.supplierOrContractor")}>
        <PartySelect value={partyId} onChange={(id) => { setPartyId(id); setBookingId(null); }} role={direction === "received" ? "customer" : undefined} placeholder={t("chq.new.choose")} />
      </Field>
      {direction === "received" && (
        <Field label={t("chq.new.booking")}>
          <SearchSelect options={mine.map((b) => ({ value: b.id, label: `${b.bookingNo} — ${b.customerName}`, hint: b.propertyCode }))} value={bookingId} onChange={setBookingId} placeholder={t("chq.new.chooseBooking")} searchPlaceholder={t("common.search")} emptyText={t("chq.new.noBooking")} clearable />
        </Field>
      )}
      <FieldRow>
        <Field label={t("chq.new.number")}><Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="000123" /></Field>
        <Field label={t("chq.new.date")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </FieldRow>
      <Field label={t("chq.new.bank")}><BankSelect value={bank} onChange={setBank} /></Field>
      <Field label={t("common.amount")}><AmountInput value={amount} onChange={setAmount} /></Field>
    </FormDialog>
  );
}
