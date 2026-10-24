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

const STATUS: Record<ChequeStatus, { label: string; cls: string }> = {
  in_hand: { label: "In hand", cls: "bg-primary/12 text-primary" },
  deposited: { label: "Deposited", cls: "bg-gold/15 text-gold" },
  cleared: { label: "Cleared", cls: "bg-success/12 text-success" },
  bounced: { label: "Bounced", cls: "bg-destructive/10 text-destructive" },
  returned: { label: "Returned", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
};

export function LiveCheques() {
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
    try { await chequeAction(company.id, c.id, action); await invalidate(); toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : "That did not work."); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader icon={CalendarClock} eyebrow="Sales & CRM" title="Post-dated cheques" description="Cheques given to you and by you, from receipt to clearing"
        actions={can("deals.create") ? <Button className="gap-1.5" onClick={() => setCreating(true)}><Plus className="size-4" /> Add cheque</Button> : undefined} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={CalendarClock} label="Cheques to collect" value={pending.length} />
        <StatTile icon={AlertTriangle} label="Ready to deposit" value={dueNow.length} accent={dueNow.length ? "warning" : "muted"} />
        <StatTile icon={Landmark} label="Value pending" value={formatMoney(pending.reduce((s, c) => s + num(c.amount), 0), { compact: true })} accent="gold" />
        <StatTile icon={Ban} label="Bounced" value={all.filter((c) => c.status === "bounced").length} accent="muted" />
      </div>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Tabs value={dir} onValueChange={(v) => setDir(v as typeof dir)}>
            <TabsList><TabsTrigger value="received">Received from customers</TabsTrigger><TabsTrigger value="issued">Issued by us</TabsTrigger></TabsList>
          </Tabs>
          <div className="flex items-center gap-2"><DataTableSearch value={search} onChange={setSearch} placeholder="Search cheque no., name, bank…" /><ExportButton name="cheques" headers={["Cheque", "Direction", "Party", "Bank", "Cheque date", "Amount", "Status"]} rows={mine.map((c) => [c.chequeNo, c.direction, c.partyName, c.bankName, c.chequeDate, num(c.amount), c.status])} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Cheque</th><th className="pb-2.5 font-medium">{dir === "received" ? "From" : "To"}</th><th className="pb-2.5 font-medium">Cheque date</th>
                <th className="pb-2.5 pr-3 text-right font-medium">Amount</th><th className="pb-2.5 font-medium">Status</th><th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={6} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>) : mine.map((c) => {
                const ready = c.status === "in_hand" && c.chequeDate <= todayIso();
                return (
                  <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                    <td className="py-2.5"><p className="font-mono font-medium">{c.chequeNo}</p><p className="text-xs text-muted-foreground">{c.bankName}</p></td>
                    <td className="py-2.5"><p>{c.partyName}</p>{c.bookingNo && <p className="text-xs text-muted-foreground">{c.bookingNo}</p>}</td>
                    <td className={`py-2.5 ${ready ? "font-medium text-warning" : "text-muted-foreground"}`}>{formatDate(c.chequeDate)}{ready && " · ready"}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right font-mono tabular-nums">{formatMoney(num(c.amount))}</td>
                    <td className="py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
                      {c.status === "bounced" && c.bounceReason && <p className="mt-0.5 text-xs text-destructive">{c.bounceReason}</p>}
                      {c.status === "deposited" && c.depositBank && <p className="mt-0.5 text-xs text-muted-foreground">in {c.depositBank} {c.depositAccountNo}</p>}
                    </td>
                    <td className="py-2.5 text-right">
                      {can("deals.edit") && (
                        <div className="flex justify-end gap-1.5">
                          <AttachmentsButton entityType="cheque" entityId={c.id} title={`Cheque ${c.chequeNo}`} iconOnly canEdit categories={["Cheque image", "Deposit slip", "Bank advice"]} />
                          {c.direction === "received" && c.status === "in_hand" && <Button size="sm" variant="outline" onClick={() => { setBankAccount(banks.data?.[0]?.id ?? ""); setDepositing(c); }}>Deposit</Button>}
                          {((c.direction === "received" && c.status === "deposited") || (c.direction === "issued" && c.status === "in_hand")) && <Button size="sm" className="gap-1" disabled={busy} onClick={() => void act(c, "clear", "Cheque cleared")}><CheckCircle2 className="size-3.5" /> Cleared</Button>}
                          {(c.status === "in_hand" || c.status === "deposited") && c.direction === "received" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setBouncing(c)}>Bounced</Button>}
                          {c.status === "in_hand" && <Button size="icon-sm" variant="ghost" aria-label="Return or cancel" disabled={busy} onClick={() => void act(c, "return", c.direction === "issued" ? "Cheque cancelled" : "Cheque returned")}><Undo2 className="size-4" /></Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!q.isLoading && mine.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No cheques here yet.</p>}
        </div>
      </Card>

      <NewChequeDialog open={creating} onOpenChange={setCreating} />

      <FormDialog open={!!depositing} onOpenChange={(o) => !o && setDepositing(null)} icon={Landmark} title="Deposit cheque" description={`Cheque ${depositing?.chequeNo ?? ""} for ${formatMoney(num(depositing?.amount))}. It is recorded as received when the bank clears it.`}
        submitLabel="Mark deposited" submitDisabled={!bankAccount}
        onSubmit={async () => { await chequeAction(company.id, depositing!.id, "deposit", { bankAccountId: bankAccount }); await invalidate(); toast.success("Marked as deposited"); }}>
        <Field label="Deposited into">
          <Select value={bankAccount} onValueChange={setBankAccount}>
            <SelectTrigger><SelectValue placeholder="Choose a bank account" /></SelectTrigger>
            <SelectContent>{(banks.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} · {b.accountNo}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </FormDialog>

      <ReasonDialog open={!!bouncing} onOpenChange={(o) => !o && setBouncing(null)} icon={Ban} title={`Cheque ${bouncing?.chequeNo ?? ""} bounced`} description="Nothing is booked. The installment stays due and you can chase the customer." submitLabel="Record bounce" reasonLabel="Why did it bounce?"
        onSubmit={async (reason) => { await chequeAction(company.id, bouncing!.id, "bounce", { reason }); await invalidate(); toast.success("Bounce recorded"); }} />
    </div>
  );
}

function NewChequeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
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
    <FormDialog open={open} onOpenChange={onOpenChange} icon={CalendarClock} title="Add cheque" description="Record a cheque so it is never forgotten before its date."
      submitLabel="Save cheque" submitDisabled={!no.trim() || !bank.bankName.trim() || !partyId || num(amount) <= 0}
      onSubmit={async () => {
        await createCheque(company.id, { direction, chequeNo: no.trim(), bankName: bank.bankName.trim(), partyId, bookingId: direction === "received" ? bookingId || undefined : undefined, amount, chequeDate: date });
        await invalidate();
        toast.success("Cheque saved");
        setNo(""); setAmount("");
      }}>
      <Field label="Whose cheque?">
        <div className="flex gap-1.5">
          {(["received", "issued"] as const).map((d) => <Button key={d} type="button" size="sm" variant={direction === d ? "default" : "outline"} onClick={() => setDirection(d)}>{d === "received" ? "Given to us" : "Given by us"}</Button>)}
        </div>
      </Field>
      <Field label={direction === "received" ? "Customer" : "Supplier or contractor"}>
        <PartySelect value={partyId} onChange={(id) => { setPartyId(id); setBookingId(null); }} role={direction === "received" ? "customer" : undefined} placeholder="Choose" />
      </Field>
      {direction === "received" && (
        <Field label="Booking it pays for (optional)">
          <SearchSelect options={mine.map((b) => ({ value: b.id, label: `${b.bookingNo} — ${b.customerName}`, hint: b.propertyCode }))} value={bookingId} onChange={setBookingId} placeholder="Choose a booking" searchPlaceholder="Search" emptyText="No booking" clearable />
        </Field>
      )}
      <FieldRow>
        <Field label="Cheque number"><Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="000123" /></Field>
        <Field label="Cheque date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </FieldRow>
      <Field label="Bank on the cheque"><BankSelect value={bank} onChange={setBank} /></Field>
      <Field label="Amount"><AmountInput value={amount} onChange={setAmount} /></Field>
    </FormDialog>
  );
}
