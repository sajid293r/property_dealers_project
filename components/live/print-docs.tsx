"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PrintShell, Fact, PrintTable } from "@/components/live/print-shell";
import { useCompany } from "@/lib/providers/company-provider";
import { getVoucher, num, partyStatement } from "@/lib/api/finance";
import { getBooking, getReceipt, listReceipts } from "@/lib/api/sales";
import { getPayroll, listContracts, listQuotations, listServiceInvoices } from "@/lib/api/modules";
import { instrumentLabel, localMeta } from "@/lib/live-vouchers";
import { useT } from "@/lib/i18n/provider";
import { tOr } from "@/lib/i18n/runtime";
import { methodLabel } from "@/lib/live-sales";
import { amountInWords } from "@/lib/amount-words";
import { fiscalYearOf, todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";

const m = (n: string | number | null | undefined) => formatMoney(num(n));
function Loading() {
  const t = useT();
  return <p className="py-20 text-center text-neutral-500">{t("print.preparing")}</p>;
}
function Missing() {
  const t = useT();
  return <p className="py-20 text-center text-neutral-500">{t("print.missing")}</p>;
}

function Words({ amount }: { amount: string | number }) {
  return <p className="mt-2 italic text-neutral-700">{amountInWords(String(amount))}</p>;
}

// ───────────────────────────────────────────── receipt
export function ReceiptDoc({ id }: { id: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "receipt", id], queryFn: () => getReceipt(company.id, id) });
  const r = q.data;
  const b = useQuery({ queryKey: ["live", "print", "receipt-booking", r?.bookingId], queryFn: () => getBooking(company.id, r!.bookingId!), enabled: !!r?.bookingId });
  if (q.isLoading) return <Loading />;
  if (!r) return <Missing />;
  return (
    <PrintShell title={r.status === "void" ? t("print.receipt.titleVoid") : t("print.receipt.title")} number={r.receiptNo} date={formatDate(r.receivedOn)} signatures={[t("print.sig.receivedBy"), t("print.sig.customer")]} ready={!r.bookingId || !!b.data}>
      <div className="grid grid-cols-2 gap-5">
        <Fact label={t("print.receipt.from")}>{r.customerName}</Fact>
        <Fact label={t("print.receipt.booking")}>{r.bookingNo}{b.data ? ` · ${b.data.propertyCode} ${b.data.propertyTitle}` : ""}</Fact>
        <Fact label={t("print.receipt.paidBy")}>{methodLabel(r.method)}{r.instrumentRef ? ` · ${r.instrumentRef}` : ""}</Fact>
        <Fact label={t("print.receipt.into")}>{r.depositAccountName}</Fact>
      </div>
      <div className="my-6 rounded border-2 border-neutral-800 p-4">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">{t("print.receipt.amount")}</p>
        <p className="font-mono text-3xl font-semibold">{m(r.amount)}</p>
        <Words amount={r.amount} />
      </div>
      {r.allocations.length > 0 && (
        <>
          <p className="mb-1 font-semibold">{t("print.receipt.appliedTo")}</p>
          <PrintTable head={[t("print.receipt.colInstallment"), t("print.col.due"), t("print.col.amount")]} right={[2]} rows={r.allocations.map((a) => [`${tOr(t, `deals.kind.${a.kind}`, a.kind)} #${a.seq}`, formatDate(a.dueDate), m(a.amount)])} />
        </>
      )}
      {b.data && (
        <p className="mt-4 text-neutral-600">{t("print.receipt.balanceAfter", { balance: m(num(b.data.netPrice) - num(b.data.paidAmount)), total: m(b.data.netPrice) })}</p>
      )}
      {r.status === "void" && <p className="mt-4 font-semibold text-red-700">{r.voidReason ? t("print.receipt.voidedReason", { reason: r.voidReason }) : t("print.receipt.voided")}</p>}
    </PrintShell>
  );
}

// ───────────────────────────────────────────── voucher
export function VoucherDoc({ id }: { id: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "voucher", id], queryFn: () => getVoucher(company.id, id) });
  const v = q.data;
  if (q.isLoading) return <Loading />;
  if (!v) return <Missing />;
  const meta = localMeta(v.type);
  const lines = v.journal.length ? v.journal : null;
  return (
    <PrintShell title={meta.label} number={v.number} date={formatDate(v.date)} signatures={[t("print.sig.preparedBy"), t("print.sig.checkedBy"), t("print.sig.approvedBy"), t("print.sig.receivedBy")]}>
      <div className="grid grid-cols-3 gap-5">
        <Fact label={meta.partyLabel ?? t("print.voucher.party")}>{v.partyName}</Fact>
        <Fact label={t("vch.d.bankAccount")}>{v.bankName ? `${v.bankName} ${v.bankAccountNo ?? ""}` : null}</Fact>
        <Fact label={t("print.voucher.instrument")}>{v.instrumentType ? `${instrumentLabel(v.instrumentType)} ${v.instrumentNo ?? ""}` : null}</Fact>
        <Fact label={t("vch.d.reference")}>{v.reference}</Fact>
        <Fact label={t("vch.d.invoiceNo")}>{v.invoiceNo}</Fact>
        <Fact label={t("common.status")}>{t(`vch.status.${v.status}`)}</Fact>
      </div>
      {v.description && <p className="mt-4 rounded bg-neutral-50 p-2.5">{v.description}</p>}
      <div className="mt-5">
        <PrintTable
          head={[t("print.voucher.colAccount"), t("print.col.details"), t("vch.d.colDebit"), t("vch.d.colCredit")]}
          right={[2, 3]}
          rows={(lines ?? v.lines.map((l) => ({ accountCode: l.accountCode, accountName: l.accountName, partyName: l.partyName, memo: l.remarks, debit: l.debit, credit: l.credit }))).map((l) => [
            `${l.accountCode} ${l.accountName}`, [l.partyName, l.memo].filter(Boolean).join(" · "), num(l.debit) ? m(l.debit) : "", num(l.credit) ? m(l.credit) : "",
          ])}
          foot={[t("common.total"), "", m((lines ?? v.lines).reduce((s, l) => s + num(l.debit), 0)), m((lines ?? v.lines).reduce((s, l) => s + num(l.credit), 0))]}
        />
      </div>
      <Words amount={v.total} />
    </PrintShell>
  );
}

// ───────────────────────────────────────────── service invoice
export function ServiceInvoiceDoc({ id }: { id: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "service-invoices"], queryFn: () => listServiceInvoices(company.id) });
  const i = q.data?.find((x) => x.id === id);
  if (q.isLoading) return <Loading />;
  if (!i) return <Missing />;
  return (
    <PrintShell title={i.status === "void" ? t("print.invoice.titleVoid") : t("print.invoice.title")} number={i.number} date={formatDate(i.issueDate)} signatures={[t("print.sig.authorised")]}>
      <div className="grid grid-cols-2 gap-5">
        <Fact label={t("print.invoice.billTo")}>{i.customerName}</Fact>
        <Fact label={t("print.invoice.dueDate")}>{formatDate(i.dueDate)}</Fact>
        <Fact label={t("print.invoice.property")}>{[i.propertyCode, i.propertyTitle].filter(Boolean).join(" · ")}</Fact>
        <Fact label={t("print.invoice.for")}>{i.periodLabel}</Fact>
      </div>
      <div className="mt-5">
        <PrintTable head={[t("print.invoice.description"), t("print.col.amount")]} right={[1]} rows={[[i.description || i.periodLabel || t("print.invoice.defaultItem"), m(i.amount)]]} foot={[t("common.total"), m(i.amount)]} />
      </div>
      <div className="mt-4 ms-auto w-64 space-y-1 text-end">
        <p>{t("print.invoice.paid")} <span className="font-mono">{m(i.paidAmount)}</span></p>
        <p className="font-semibold">{t("print.invoice.balanceDue")} <span className="font-mono">{m(i.balance)}</span></p>
      </div>
      <Words amount={i.amount} />
    </PrintShell>
  );
}

// ───────────────────────────────────────────── booking: payment plan and receipts
export function BookingDoc({ id }: { id: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "booking", id], queryFn: () => getBooking(company.id, id) });
  const rec = useQuery({ queryKey: ["live", "print", "booking-receipts", id], queryFn: () => listReceipts(company.id, { bookingId: id, status: "posted" }) });
  const b = q.data;
  if (q.isLoading) return <Loading />;
  if (!b) return <Missing />;
  return (
    <PrintShell title={t("print.plan.title")} number={b.bookingNo} date={formatDate(b.bookingDate)} signatures={[t("print.sig.company"), t("print.plan.customer")]} ready={!!rec.data}>
      <div className="grid grid-cols-3 gap-5">
        <Fact label={t("print.plan.customer")}>{b.customerName}</Fact>
        <Fact label={t("print.plan.property")}>{b.propertyCode} · {b.propertyTitle}</Fact>
        <Fact label={t("print.plan.project")}>{b.projectName}</Fact>
        <Fact label={t("print.plan.listPrice")}>{m(b.listPrice)}</Fact>
        <Fact label={t("print.plan.discount")}>{m(b.discount)}</Fact>
        <Fact label={t("print.plan.netPrice")}>{m(b.netPrice)}</Fact>
      </div>
      <p className="mb-1 mt-6 font-semibold">{t("print.plan.installments")}</p>
      <PrintTable
        head={["#", t("print.col.what"), t("print.col.due"), t("print.col.amount"), t("print.col.paid"), t("common.status")]}
        right={[3, 4]}
        rows={b.installments.map((i) => [i.seq, tOr(t, `deals.kind.${i.kind}`, i.kind), formatDate(i.dueDate), m(i.amount), num(i.paidAmount) ? m(i.paidAmount) : "", tOr(t, `status.${i.status}`, i.status)])}
        foot={["", t("common.total"), "", m(b.installments.reduce((s, i) => s + num(i.amount), 0)), m(b.installments.reduce((s, i) => s + num(i.paidAmount), 0)), ""]}
      />
      {(rec.data ?? []).length > 0 && (
        <>
          <p className="mb-1 mt-6 font-semibold">{t("print.plan.paymentsReceived")}</p>
          <PrintTable head={[t("print.col.receipt"), t("common.date"), t("print.receipt.paidBy"), t("print.col.amount")]} right={[3]} rows={(rec.data ?? []).map((r) => [r.receiptNo, formatDate(r.receivedOn), methodLabel(r.method), m(r.amount)])} />
        </>
      )}
      <p className="mt-4 font-semibold">{t("print.plan.balanceToPay")} <span className="font-mono">{m(num(b.netPrice) - num(b.paidAmount))}</span></p>
    </PrintShell>
  );
}

// ───────────────────────────────────────────── customer / supplier statement
export function StatementDoc({ id }: { id: string }) {
  const t = useT();
  const { company } = useCompany();
  const fy = fiscalYearOf(todayIso());
  const q = useQuery({ queryKey: ["live", "print", "statement", id], queryFn: () => partyStatement(company.id, id, "2000-01-01", todayIso()) });
  const s = q.data;
  if (q.isLoading) return <Loading />;
  if (!s) return <Missing />;
  const closing = s.lines.length ? num(s.lines[s.lines.length - 1]!.balance) : num(s.openingBalance);
  void fy;
  return (
    <PrintShell title={t("print.statement.title")} date={t("print.statement.asOf", { date: formatDate(todayIso()) })} signatures={[]}>
      <div className="grid grid-cols-3 gap-5">
        <Fact label={t("print.statement.accountOf")}>{s.party.name}</Fact>
        <Fact label={t("common.phone")}>{s.party.phone}</Fact>
        <Fact label={t("customers.col.city")}>{s.party.city}</Fact>
      </div>
      <div className="mt-5">
        <PrintTable
          head={[t("common.date"), t("print.statement.entry"), t("vch.d.colDebit"), t("vch.d.colCredit"), t("acc.col.balance")]}
          right={[2, 3, 4]}
          rows={[["", t("print.statement.opening"), "", "", m(s.openingBalance)], ...s.lines.map((l) => [formatDate(l.date), `${l.number} ${l.accountName}`, num(l.debit) ? m(l.debit) : "", num(l.credit) ? m(l.credit) : "", m(l.balance)])]}
          foot={["", t("print.statement.closing"), "", "", m(closing)]}
        />
      </div>
      <p className="mt-3 text-neutral-600">{closing > 0 ? t("print.statement.dueFrom") : closing < 0 ? t("print.statement.dueTo") : t("print.statement.nothing")}</p>
    </PrintShell>
  );
}

// ───────────────────────────────────────────── quotation
export function QuotationDoc({ id }: { id: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "quotations"], queryFn: () => listQuotations(company.id) });
  const x = q.data?.find((r) => r.id === id);
  if (q.isLoading) return <Loading />;
  if (!x) return <Missing />;
  const rest = num(x.netPrice) - num(x.downPayment);
  return (
    <PrintShell title={t("print.quote.title")} number={x.quoteNo} date={formatDate(x.quoteDate)} signatures={[t("print.sig.forCompany"), t("print.sig.acceptance")]}>
      <div className="grid grid-cols-2 gap-5">
        <Fact label={t("print.quote.preparedFor")}>{x.customerName ?? x.leadName}</Fact>
        <Fact label={t("print.quote.validUntil")}>{formatDate(x.validUntil)}</Fact>
        <Fact label={t("print.plan.property")}>{x.propertyCode} · {x.propertyTitle}</Fact>
        <Fact label={t("print.plan.project")}>{x.projectName}</Fact>
      </div>
      <div className="mt-5">
        <PrintTable
          head={[t("print.col.item"), t("print.col.amount")]}
          right={[1]}
          rows={[[t("print.quote.listPrice"), m(x.listPrice)], ...(num(x.discount) ? [[t("print.quote.discount"), `− ${m(x.discount)}`]] : []), ...(x.installments > 0 ? [[t("print.quote.down"), m(x.downPayment)], [t("print.quote.plan", { count: x.installments, amount: m(rest / x.installments), months: x.intervalMonths, date: x.firstDue ? formatDate(x.firstDue) : "—" }), m(rest)]] : [])]}
          foot={[t("print.quote.total"), m(x.netPrice)]}
        />
      </div>
      <Words amount={x.netPrice} />
      {x.notes && <p className="mt-4 rounded bg-neutral-50 p-2.5">{x.notes}</p>}
      <p className="mt-6 text-xs text-neutral-500">{t("print.quote.validNote", { date: formatDate(x.validUntil) })}</p>
    </PrintShell>
  );
}

// ───────────────────────────────────────────── contract
export function ContractDoc({ id }: { id: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "contracts"], queryFn: () => listContracts(company.id) });
  const c = q.data?.find((r) => r.id === id);
  if (q.isLoading) return <Loading />;
  if (!c) return <Missing />;
  return (
    <PrintShell title={t("print.contract.title")} number={c.contractNo} date={c.signedOn ? t("print.contract.signed", { date: formatDate(c.signedOn) }) : t("print.contract.draft")} signatures={[t("print.sig.forCompany"), c.partyName ?? t("print.sig.otherParty"), t("print.sig.witness")]}>
      <h2 className="mb-3 font-heading text-lg font-semibold">{c.title}</h2>
      <div className="grid grid-cols-3 gap-5">
        <Fact label={t("print.contract.with")}>{c.partyName}</Fact>
        <Fact label={t("print.contract.starts")}>{formatDate(c.startDate)}</Fact>
        <Fact label={t("print.contract.ends")}>{c.endDate ? formatDate(c.endDate) : t("print.contract.open")}</Fact>
        <Fact label={t("print.contract.value")}>{num(c.value) ? m(c.value) : null}</Fact>
        <Fact label={t("print.plan.property")}>{c.propertyCode}</Fact>
        <Fact label={t("print.receipt.booking")}>{c.bookingNo}</Fact>
      </div>
      <p className="mb-1 mt-6 font-semibold">{t("print.contract.terms")}</p>
      <p className="whitespace-pre-wrap">{c.terms || t("print.contract.defaultTerms")}</p>
    </PrintShell>
  );
}

// ───────────────────────────────────────────── payslip
export function PayslipDoc({ id, lineId }: { id: string; lineId: string }) {
  const t = useT();
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "payroll", id], queryFn: () => getPayroll(company.id, id) });
  const run = q.data;
  const l = run?.lines.find((x) => x.id === lineId);
  if (q.isLoading) return <Loading />;
  if (!run || !l) return <Missing />;
  const earn = num(l.basic) + num(l.allowances) + num(l.bonus);
  return (
    <PrintShell title={t("print.payslip.title")} number={run.runNo} date={run.month} signatures={[t("print.sig.accounts"), t("print.sig.employee")]}>
      <div className="grid grid-cols-3 gap-5">
        <Fact label={t("print.sig.employee")}>{l.fullName}</Fact>
        <Fact label={t("print.payslip.empNo")}>{l.empNo}</Fact>
        <Fact label={t("print.payslip.designation")}>{l.designation}</Fact>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-6">
        <PrintTable head={[t("print.payslip.earnings"), t("print.col.amount")]} right={[1]} rows={[[t("print.payslip.basic"), m(l.basic)], [t("pay.sheet.allowances"), m(l.allowances)], ...(num(l.bonus) ? [[t("pay.sheet.bonus"), m(l.bonus)]] : [])]} foot={[t("print.payslip.totalEarnings"), m(earn)]} />
        <PrintTable head={[t("print.payslip.deductions"), t("print.col.amount")]} right={[1]} rows={[[t("print.payslip.tax"), m(l.tax)], ...(num(l.unpaidDeduction) ? [[t("print.payslip.unpaidLeave", { days: num(l.unpaidLeaveDays) }), m(l.unpaidDeduction)]] : [])]} foot={[t("print.payslip.totalDeductions"), m(num(l.tax) + num(l.unpaidDeduction))]} />
      </div>
      <div className="mt-6 rounded border-2 border-neutral-800 p-4"><p className="text-[11px] uppercase tracking-wide text-neutral-500">{t("print.payslip.net")}</p><p className="font-mono text-2xl font-semibold">{m(l.net)}</p><Words amount={l.net} /></div>
    </PrintShell>
  );
}
