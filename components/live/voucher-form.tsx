"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Plus, Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountInput, formatAmountText } from "@/components/live/amount-input";
import { AccountPicker } from "@/components/live/account-picker";
import { BankAccountDialog } from "@/components/live/bank-account-dialog";
import { BankSelect, type BankValue } from "@/components/live/bank-select";
import { PartySelect } from "@/components/live/party-select";
import { SearchSelect } from "@/components/live/search-select";
import { LiveVoucherTypeBadge } from "@/components/live/voucher-badges";
import { useBankAccounts, useChartAccounts, useInvalidateFinance } from "@/lib/hooks/use-live";
import { useProjects } from "@/lib/hooks/use-data";
import { useCompany } from "@/lib/providers/company-provider";
import { createVoucher, getVoucher, updateVoucher, voucherAction, type ChartAccount, type InstrumentType, type VoucherInput, type VoucherType } from "@/lib/api/finance";
import { ApiError } from "@/lib/api/client";
import { INSTRUMENTS, LIVE_VOUCHER_TYPES, isVoucherType, liveVoucherMeta } from "@/lib/live-vouchers";
import { amountInWords } from "@/lib/amount-words";
import { toast } from "sonner";

interface FormLine {
  key: string;
  accountId: string;
  amount: string;
  partyId: string;
  projectId: string;
  remarks: string;
}
const newLine = (): FormLine => ({ key: crypto.randomUUID(), accountId: "", amount: "", partyId: "", projectId: "", remarks: "" });
const cents = (s: string) => Math.round(parseFloat(s || "0") * 100) || 0;
const fromCents = (c: number) => (c / 100).toFixed(2);
const money = (c: number) => formatAmountText(fromCents(c));

const today = () => new Date().toISOString().slice(0, 10);

type LineSet = React.Dispatch<React.SetStateAction<FormLine[]>>;

/** One editable table of voucher lines. Lives at module level so typing never remounts the fields. */
function VoucherLineTable({
  list, set, title, hint, onlyAccounts, side, accounts, headerPartyId, projectOptions, remountKey,
}: {
  list: FormLine[]; set: LineSet; title: string; hint?: string; onlyAccounts: (a: ChartAccount) => boolean; side: "debit" | "credit";
  accounts: ChartAccount[]; headerPartyId: string; projectOptions: { value: string; label: string; hint?: string }[]; remountKey: string;
}) {
  const updateLine = (key: string, patch: Partial<FormLine>) => set((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => set((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  const sum = list.reduce((t, l) => t + cents(l.amount), 0);
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/50 text-start text-xs text-muted-foreground">
              <th className="w-[32%] py-2 ps-3 font-medium">Account</th>
              <th className="w-[22%] py-2 pe-2 text-end font-medium">{side === "debit" ? "Debit" : "Credit"} amount</th>
              <th className="py-2 ps-2 pe-2 font-medium">Narration</th>
              {projectOptions.length > 0 && <th className="w-[16%] py-2 pe-2 font-medium">Project</th>}
              <th className="w-9 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((l) => {
              const account = accounts.find((a) => a.id === l.accountId);
              const needsParty = !!account?.requiresParty && !headerPartyId;
              return (
                <React.Fragment key={l.key}>
                  <tr className="align-top">
                    <td className="py-1.5 ps-3 pe-2">
                      <AccountPicker key={remountKey} value={l.accountId} only={onlyAccounts} onChange={(id) => updateLine(l.key, { accountId: id })} />
                    </td>
                    <td className="py-1.5 pe-2">
                      <AmountInput value={l.amount} onChange={(v) => updateLine(l.key, { amount: v })} aria-label={`${side} amount`} />
                    </td>
                    <td className="py-1.5 ps-2 pe-2">
                      <Input value={l.remarks} onChange={(e) => updateLine(l.key, { remarks: e.target.value })} placeholder="Optional" maxLength={300} />
                    </td>
                    {projectOptions.length > 0 && (
                      <td className="py-1.5 pe-2">
                        <SearchSelect options={projectOptions} value={l.projectId} placeholder="—" clearable onChange={(v) => updateLine(l.key, { projectId: v })} />
                      </td>
                    )}
                    <td className="py-1.5 pe-2 text-end">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeLine(l.key)} disabled={list.length <= 1} aria-label="Remove line">
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                  {needsParty && (
                    <tr>
                      <td colSpan={projectOptions.length > 0 ? 5 : 4} className="pb-2 ps-3 pe-2">
                        <div className="flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2">
                          <span className="text-xs">{account?.name} needs a customer / supplier:</span>
                          <div className="w-64">
                            <PartySelect value={l.partyId} onChange={(id) => updateLine(l.key, { partyId: id })} placeholder="Choose…" />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => set((ls) => [...ls, newLine()])}>
          <Plus className="size-3.5" /> Add line
        </Button>
        <p className="text-sm text-muted-foreground">
          {side === "debit" ? "Debit" : "Credit"} total <span className="ms-1 font-mono text-base font-semibold tabular-nums text-foreground">{money(sum)}</span>
        </p>
      </div>
    </div>
  );
}

export function LiveVoucherForm() {
  const router = useRouter();
  const search = useSearchParams();
  const editId = search.get("edit");
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const { data: accounts } = useChartAccounts();
  const { data: bankAccounts } = useBankAccounts();
  const { data: projects } = useProjects();

  const initialType = search.get("type");
  const [type, setType] = React.useState<VoucherType>(isVoucherType(initialType) ? initialType : "CPV");
  const [savedId, setSavedId] = React.useState<string | null>(editId);
  const [number, setNumber] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(today);
  const [description, setDescription] = React.useState("");
  const [partyId, setPartyId] = React.useState("");
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [controlAccountId, setControlAccountId] = React.useState("");
  const [instrumentType, setInstrumentType] = React.useState<InstrumentType | "">("");
  const [instrumentNo, setInstrumentNo] = React.useState("");
  const [chequeDate, setChequeDate] = React.useState("");
  const [instrumentBank, setInstrumentBank] = React.useState<BankValue>({ bankId: null, bankName: "" });
  const [reference, setReference] = React.useState("");
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [lines, setLines] = React.useState<FormLine[]>([newLine()]);
  const [debitLines, setDebitLines] = React.useState<FormLine[]>([newLine()]);
  const [creditLines, setCreditLines] = React.useState<FormLine[]>([newLine()]);
  const [taxRate, setTaxRate] = React.useState("");
  const [addingBank, setAddingBank] = React.useState(false);
  const [busy, setBusy] = React.useState<"draft" | "submit" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const meta = liveVoucherMeta(type);

  // editing an existing draft or rejected voucher: load it once
  const existing = useQuery({ queryKey: ["live", "voucher", editId], queryFn: () => getVoucher(company.id, editId!), enabled: !!editId, staleTime: Infinity });
  const loadedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    const v = existing.data;
    if (!v || loadedFor.current === v.id) return;
    loadedFor.current = v.id;
    const m = liveVoucherMeta(v.type);
    /* eslint-disable react-hooks/set-state-in-effect */
    setType(v.type);
    setNumber(v.number);
    setDate(v.date);
    setDescription(v.description ?? "");
    setPartyId(v.partyId ?? "");
    setBankAccountId(v.bankAccountId ?? "");
    setControlAccountId(m.layout === "cash" || m.layout === "contra" ? (v.controlAccountId ?? "") : "");
    setInstrumentType(v.instrumentType ?? "");
    setInstrumentNo(v.instrumentNo ?? "");
    setChequeDate(v.chequeDate ?? "");
    setInstrumentBank({ bankId: null, bankName: v.instrumentBank ?? "" });
    setReference(v.reference ?? "");
    setInvoiceNo(v.invoiceNo ?? "");
    setDueDate(v.dueDate ?? "");
    const toLine = (l: (typeof v.lines)[number], side: "debit" | "credit"): FormLine => ({
      key: l.id, accountId: l.accountId, amount: side === "debit" ? l.debit : l.credit, partyId: l.partyId ?? "", projectId: l.projectId ?? "", remarks: l.remarks ?? "",
    });
    if (m.side === null) {
      setDebitLines(v.lines.filter((l) => Number(l.debit) > 0).map((l) => toLine(l, "debit")));
      setCreditLines(v.lines.filter((l) => Number(l.credit) > 0).map((l) => toLine(l, "credit")));
    } else {
      setLines(v.lines.map((l) => toLine(l, m.side!)));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [existing.data]);

  const cashAccounts = React.useMemo(() => (accounts ?? []).filter((a) => a.category === "asset_cash" && !a.isGroup), [accounts]);
  const effectiveControl = controlAccountId || (meta.layout === "cash" ? cashAccounts[0]?.id ?? "" : "");
  const bankAccount = bankAccounts?.find((b) => b.id === bankAccountId);
  const byCode = React.useMemo(() => Object.fromEntries((accounts ?? []).map((a) => [a.code, a])), [accounts]);
  const accountName = (id: string) => accounts?.find((a) => a.id === id)?.name ?? "";

  // ── totals (in whole paisa, so nothing is ever rounded by a float)
  const typedLines = meta.side === null ? [] : lines;
  const typedTotal = typedLines.reduce((t, l) => t + cents(l.amount), 0);
  const debitTotal = debitLines.reduce((t, l) => t + cents(l.amount), 0);
  const creditTotal = creditLines.reduce((t, l) => t + cents(l.amount), 0);
  const total = meta.side === null ? debitTotal : typedTotal;
  const difference = debitTotal - creditTotal;

  function changeType(next: VoucherType) {
    setType(next);
    setPartyId("");
    setLines([newLine()]);
    setError(null);
    setInstrumentType("");
    setInstrumentNo("");
    setChequeDate("");
    setInstrumentBank({ bankId: null, bankName: "" });
  }

  const usable = (l: FormLine) => l.accountId && cents(l.amount) > 0;
  function problems(): string[] {
    const out: string[] = [];
    if (!date) out.push("Choose the voucher date.");
    if (meta.partyRequired && !partyId) out.push(`Choose the ${meta.partyLabel?.toLowerCase()}.`);
    if (meta.layout === "bank") {
      if (!bankAccountId) out.push("Choose the bank account.");
      if (instrumentType === "cheque" && !instrumentNo.trim()) out.push("Enter the cheque number.");
    }
    if (meta.layout === "contra" && !controlAccountId) out.push("Choose the account the money moves from.");
    if (meta.layout === "contra" && lines.some((l) => l.accountId && l.accountId === controlAccountId)) out.push("The money must move to a different account.");
    if (meta.side === null) {
      if (!debitLines.some(usable) || !creditLines.some(usable)) out.push("Enter at least one debit and one credit line.");
      else if (difference !== 0) out.push(`Debits and credits differ by ${money(Math.abs(difference))}.`);
    } else if (!lines.some(usable)) {
      out.push("Add at least one line with an account and an amount.");
    }
    return out;
  }
  const blockers = problems();

  function buildInput(): VoucherInput {
    const mapLine = (l: FormLine, side: "debit" | "credit") => ({
      accountId: l.accountId,
      [side]: fromCents(cents(l.amount)),
      partyId: l.partyId || null,
      projectId: l.projectId || null,
      remarks: l.remarks.trim() || null,
    });
    const typed =
      meta.side === null
        ? [...debitLines.filter(usable).map((l) => mapLine(l, "debit")), ...creditLines.filter(usable).map((l) => mapLine(l, "credit"))]
        : lines.filter(usable).map((l) => mapLine(l, meta.side!));
    return {
      date,
      description: description.trim() || null,
      partyId: partyId || null,
      controlAccountId: meta.layout === "cash" ? effectiveControl || null : meta.layout === "contra" ? controlAccountId || null : null,
      bankAccountId: meta.layout === "bank" ? bankAccountId || null : null,
      instrumentType: meta.layout === "bank" && instrumentType ? instrumentType : null,
      instrumentNo: meta.layout === "bank" ? instrumentNo.trim() || null : null,
      instrumentBank: meta.layout === "bank" ? instrumentBank.bankName.trim() || null : null,
      chequeDate: meta.layout === "bank" && instrumentType === "cheque" ? chequeDate || null : null,
      reference: reference.trim() || null,
      invoiceNo: type === "PIV" ? invoiceNo.trim() || null : null,
      dueDate: meta.layout === "invoice" ? dueDate || null : null,
      lines: typed,
    };
  }

  async function persist(submit: boolean) {
    setError(null);
    setBusy(submit ? "submit" : "draft");
    try {
      const input = buildInput();
      if (input.lines.length === 0) throw new Error("Add at least one line with an account and an amount.");
      const saved = savedId ? await updateVoucher(company.id, savedId, input) : await createVoucher(company.id, type, input);
      setSavedId(saved.id);
      setNumber(saved.number);
      if (submit) {
        await voucherAction(company.id, saved.id, "submit");
      }
      await invalidate();
      toast.success(submit ? `${saved.number} submitted for approval` : `${saved.number} saved as draft`, { description: meta.label });
      router.push(`/dashboard/vouchers/${saved.id}`);
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  function addTaxLine() {
    const rate = parseFloat(taxRate);
    const code = type === "SV" || type === "CN" ? "02.01.03.0001" : "03.01.05.0001";
    const account = byCode[code];
    if (!account || !(rate > 0)) return;
    const base = lines.filter((l) => l.accountId && l.accountId !== account.id).reduce((t, l) => t + cents(l.amount), 0);
    const tax = Math.round((base * rate) / 100);
    setLines((ls) => [...ls.filter((l) => l.accountId !== account.id || cents(l.amount) > 0), { ...newLine(), accountId: account.id, amount: fromCents(tax), remarks: `Tax at ${taxRate}%` }]);
    setTaxRate("");
  }

  const projectOptions = React.useMemo(() => (projects ?? []).map((p) => ({ value: p.id, label: p.name, hint: p.code })), [projects]);

  if (editId && existing.isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (editId && existing.error) {
    return <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">This voucher could not be opened. It may have been deleted, or you may not have access.</div>;
  }

  const instrument = INSTRUMENTS.find((i) => i.value === instrumentType);
  const showInstrumentBank =
    meta.layout === "bank" && ((type === "BRV" && ["cheque", "pay_order", "demand_draft"].includes(instrumentType)) || (type === "BPV" && ["online_transfer", "pay_order", "demand_draft"].includes(instrumentType)));
  const words = amountInWords(fromCents(total));
  const grouped = ["Cash & bank", "Sales", "Purchases", "Other"] as const;

  return (
    <div className="mx-auto max-w-[1240px] space-y-5">
      <PageHeader
        icon={meta.icon}
        back={{ href: "/dashboard/vouchers", label: "Vouchers" }}
        title={`${savedId ? "Edit" : "New"} ${meta.label}`}
        badge={<LiveVoucherTypeBadge type={type} />}
        description={meta.description}
      />

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-5">
          <Card className="space-y-5 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Voucher type</Label>
                <Select value={type} onValueChange={(v) => changeType(v as VoucherType)} disabled={!!savedId}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {grouped.map((g) => (
                      <SelectGroup key={g}>
                        <SelectLabel>{g}</SelectLabel>
                        {LIVE_VOUCHER_TYPES.filter((t) => t.group === g).map((t) => (
                          <SelectItem key={t.type} value={t.type}>{t.label} ({t.type})</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Voucher no.</Label>
                <Input value={number ?? "Given when saved"} disabled className="font-mono" />
              </div>

              <div>
                <Label htmlFor="v-date" className="mb-1.5 text-xs font-medium text-muted-foreground">{meta.layout === "invoice" ? "Invoice date" : "Voucher date"}</Label>
                <Input id="v-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {meta.layout === "invoice" && (
                <div>
                  <Label htmlFor="v-due" className="mb-1.5 text-xs font-medium text-muted-foreground">Due date</Label>
                  <Input id="v-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              )}

              {meta.partyLabel && (
                <div className={meta.layout === "invoice" ? "" : "sm:col-span-2"}>
                  <Label className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {meta.partyLabel}
                    {!meta.partyRequired && <span className="ms-1 font-normal">(optional)</span>}
                  </Label>
                  <PartySelect key={type} value={partyId} role={meta.partyRole} onChange={(id) => setPartyId(id)} placeholder={`Choose ${meta.partyLabel.toLowerCase()}`} />
                </div>
              )}
              {type === "PIV" && (
                <div>
                  <Label htmlFor="v-inv" className="mb-1.5 text-xs font-medium text-muted-foreground">Supplier&apos;s invoice no.</Label>
                  <Input id="v-inv" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-5521" maxLength={60} />
                </div>
              )}
              {meta.layout === "invoice" && type !== "PIV" && (
                <div>
                  <Label htmlFor="v-ref" className="mb-1.5 text-xs font-medium text-muted-foreground">{type === "SV" ? "Reference (plot / booking)" : "Against invoice no."}</Label>
                  <Input id="v-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
                </div>
              )}
            </div>

            {/* cash vouchers: which cash account */}
            {meta.layout === "cash" && (
              <div className="sm:max-w-sm">
                <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Cash account</Label>
                <AccountPicker value={effectiveControl} only={(a) => a.category === "asset_cash"} onChange={(id) => setControlAccountId(id)} placeholder="Choose the cash account" />
              </div>
            )}

            {/* contra: where the money comes from */}
            {meta.layout === "contra" && (
              <div className="sm:max-w-sm">
                <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Money moves from</Label>
                <AccountPicker value={controlAccountId} only={(a) => a.category === "asset_cash" || a.category === "asset_bank"} onChange={(id) => setControlAccountId(id)} placeholder="Cash or bank account" />
              </div>
            )}

            {/* bank vouchers: the bank account and the instrument */}
            {meta.layout === "bank" && (
              <div className="space-y-4 rounded-xl border border-border/70 bg-secondary/30 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5 text-xs font-medium text-muted-foreground">{type === "BPV" ? "Pay from bank account" : "Deposit into bank account"}</Label>
                    <SearchSelect
                      options={(bankAccounts ?? []).filter((b) => b.active).map((b) => ({ value: b.id, label: `${b.bankName} — ${b.accountNo}`, hint: b.bankShortName ?? undefined, group: undefined }))}
                      value={bankAccountId}
                      placeholder={bankAccounts && bankAccounts.length === 0 ? "Add your bank account first" : "Choose the bank account"}
                      searchPlaceholder="Search your bank accounts"
                      emptyText="No bank account yet"
                      onChange={(id) => setBankAccountId(id)}
                      onCreate={() => setAddingBank(true)}
                      createLabel="Add a bank account (choose from all Pakistani banks)"
                    />
                    {bankAccount && <p className="mt-1.5 text-xs text-muted-foreground">{bankAccount.accountTitle}{bankAccount.branchName ? ` · ${bankAccount.branchName}` : ""} · ledger {bankAccount.glCode}</p>}
                  </div>
                  <div>
                    <Label className="mb-1.5 text-xs font-medium text-muted-foreground">{type === "BPV" ? "Paid by" : "Received by"}</Label>
                    <Select value={instrumentType || undefined} onValueChange={(v) => setInstrumentType(v as InstrumentType)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Cheque, transfer, pay order…" /></SelectTrigger>
                      <SelectContent>
                        {INSTRUMENTS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {instrument?.needsNumber && (
                    <div>
                      <Label className="mb-1.5 text-xs font-medium text-muted-foreground">{instrument.label} number</Label>
                      <Input value={instrumentNo} onChange={(e) => setInstrumentNo(e.target.value)} placeholder="000123" maxLength={60} className="font-mono" />
                    </div>
                  )}
                  {instrumentType === "cheque" && (
                    <div>
                      <Label className="mb-1.5 text-xs font-medium text-muted-foreground">Cheque date</Label>
                      <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                    </div>
                  )}
                  {showInstrumentBank && (
                    <div className="sm:col-span-2">
                      <Label className="mb-1.5 text-xs font-medium text-muted-foreground">{type === "BRV" ? "Drawn on (the payer's bank)" : "Payee's bank (optional)"}</Label>
                      <BankSelect value={instrumentBank} onChange={setInstrumentBank} placeholder="Choose the bank" />
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <Label className="mb-1.5 text-xs font-medium text-muted-foreground">
                      {instrumentType === "online_transfer" ? "Transaction / reference no." : instrumentType === "cash_deposit" ? "Deposit slip no." : "Reference (optional)"}
                    </Label>
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="v-desc" className="mb-1.5 text-xs font-medium text-muted-foreground">Narration</Label>
              <Textarea id="v-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this voucher for…" rows={2} maxLength={500} />
            </div>
          </Card>

          {meta.side === null ? (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Card className="p-5">
                <VoucherLineTable list={debitLines} set={setDebitLines} title="Debit entries" hint="Accounts that receive value." onlyAccounts={meta.lineAccounts} side="debit" accounts={accounts ?? []} headerPartyId={partyId} projectOptions={projectOptions} remountKey={`${type}-debit`} />
              </Card>
              <Card className="p-5">
                <VoucherLineTable list={creditLines} set={setCreditLines} title="Credit entries" hint="Accounts that give value." onlyAccounts={meta.lineAccounts} side="credit" accounts={accounts ?? []} headerPartyId={partyId} projectOptions={projectOptions} remountKey={`${type}-credit`} />
              </Card>
            </div>
          ) : (
            <Card className="space-y-4 p-5">
              <VoucherLineTable list={lines} set={setLines} title={meta.linesTitle} hint={meta.linesHint} onlyAccounts={meta.lineAccounts} side={meta.side} accounts={accounts ?? []} headerPartyId={partyId} projectOptions={projectOptions} remountKey={`${type}-lines`} />
              {meta.layout === "invoice" && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border bg-secondary/30 p-3">
                  <div>
                    <Label htmlFor="tax-rate" className="mb-1 block text-xs font-medium text-muted-foreground">Tax rate % (as per your tax setup)</Label>
                    <Input id="tax-rate" value={taxRate} onChange={(e) => setTaxRate(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="e.g. 16" className="w-32" />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addTaxLine} disabled={!(parseFloat(taxRate) > 0) || !lines.some((l) => usable(l))}>
                    Add {type === "SV" || type === "CN" ? "sales tax" : "input tax"} line
                  </Button>
                  <p className="text-xs text-muted-foreground">Works out the tax on the lines above and adds it as a line you can still edit.</p>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* summary + actions */}
        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card className="space-y-4 p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Voucher total</p>
              <p className="mt-1 break-all font-heading text-3xl font-semibold tabular-nums">Rs {money(total)}</p>
              {words && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{words}</p>}
            </div>
            <div className="space-y-2 border-t border-border/70 pt-3 text-sm">
              {meta.side === null ? (
                <>
                  <SummaryRow label="Total debits" value={money(debitTotal)} />
                  <SummaryRow label="Total credits" value={money(creditTotal)} />
                  <div className={difference === 0 && debitTotal > 0 ? "flex items-center gap-1.5 text-success" : "flex items-center gap-1.5 text-warning"}>
                    {difference === 0 && debitTotal > 0 ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
                    <span className="text-xs font-medium">{difference === 0 && debitTotal > 0 ? "Balanced" : difference === 0 ? "Enter amounts" : `Out of balance by ${money(Math.abs(difference))}`}</span>
                  </div>
                </>
              ) : (
                <>
                  <SummaryRow label={meta.side === "debit" ? "Debited (your lines)" : "Credited (your lines)"} value={money(typedTotal)} />
                  <SummaryRow
                    label={meta.fixedSideLabel ?? "Other side"}
                    value={money(typedTotal)}
                    sub={
                      meta.layout === "bank" ? (bankAccount ? `${bankAccount.bankName} ${bankAccount.accountNo}` : "choose the bank account")
                        : meta.layout === "cash" ? accountName(effectiveControl) || "choose the cash account"
                        : meta.layout === "contra" ? accountName(controlAccountId) || "choose the account"
                        : type === "SV" || type === "CN" ? "Customer's receivable" : "Supplier's payable"
                    }
                  />
                </>
              )}
            </div>
            {blockers.length > 0 && (
              <ul className="space-y-1 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                {blockers.map((b) => (
                  <li key={b} className="flex items-start gap-1.5"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-warning" />{b}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-2.5 p-4">
            <Button className="w-full gap-1.5" disabled={blockers.length > 0 || busy !== null} onClick={() => void persist(true)}>
              <Send className="size-4" />
              {busy === "submit" ? "Submitting…" : "Submit for approval"}
            </Button>
            <Button variant="outline" className="w-full" disabled={busy !== null} onClick={() => void persist(false)}>
              {busy === "draft" ? "Saving…" : "Save as draft"}
            </Button>
            <Button variant="ghost" className="w-full" asChild disabled={busy !== null}>
              <Link href="/dashboard/vouchers">Cancel</Link>
            </Button>
          </Card>
        </div>
      </div>

      <BankAccountDialog open={addingBank} onOpenChange={setAddingBank} onCreated={(b) => setBankAccountId(b.id)} />
    </div>
  );
}

function SummaryRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-muted-foreground">{label}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground/80">{sub}</p>}
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
