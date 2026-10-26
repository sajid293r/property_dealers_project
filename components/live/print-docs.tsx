"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PrintShell, Fact, PrintTable } from "@/components/live/print-shell";
import { useCompany } from "@/lib/providers/company-provider";
import { getVoucher, num, partyStatement } from "@/lib/api/finance";
import { getBooking, getReceipt, listReceipts } from "@/lib/api/sales";
import { getPayroll, listContracts, listQuotations, listServiceInvoices } from "@/lib/api/modules";
import { liveVoucherMeta } from "@/lib/live-vouchers";
import { INSTALLMENT_KIND_LABEL, methodLabel } from "@/lib/live-sales";
import { amountInWords } from "@/lib/amount-words";
import { fiscalYearOf, todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";

const m = (n: string | number | null | undefined) => formatMoney(num(n));
const Loading = () => <p className="py-20 text-center text-neutral-500">Preparing the document…</p>;
const Missing = ({ what }: { what: string }) => <p className="py-20 text-center text-neutral-500">{what} could not be found, or you do not have access to it.</p>;

function Words({ amount }: { amount: string | number }) {
  return <p className="mt-2 italic text-neutral-700">{amountInWords(String(amount))}</p>;
}

// ───────────────────────────────────────────── receipt
export function ReceiptDoc({ id }: { id: string }) {
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "receipt", id], queryFn: () => getReceipt(company.id, id) });
  const r = q.data;
  const b = useQuery({ queryKey: ["live", "print", "receipt-booking", r?.bookingId], queryFn: () => getBooking(company.id, r!.bookingId!), enabled: !!r?.bookingId });
  if (q.isLoading) return <Loading />;
  if (!r) return <Missing what="This receipt" />;
  return (
    <PrintShell title={r.status === "void" ? "Receipt (VOID)" : "Receipt"} number={r.receiptNo} date={formatDate(r.receivedOn)} signatures={["Received by", "Customer's signature"]} ready={!r.bookingId || !!b.data}>
      <div className="grid grid-cols-2 gap-5">
        <Fact label="Received from">{r.customerName}</Fact>
        <Fact label="Booking">{r.bookingNo}{b.data ? ` · ${b.data.propertyCode} ${b.data.propertyTitle}` : ""}</Fact>
        <Fact label="Paid by">{methodLabel(r.method)}{r.instrumentRef ? ` · ${r.instrumentRef}` : ""}</Fact>
        <Fact label="Deposited into">{r.depositAccountName}</Fact>
      </div>
      <div className="my-6 rounded border-2 border-neutral-800 p-4">
        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Amount received</p>
        <p className="font-mono text-3xl font-semibold">{m(r.amount)}</p>
        <Words amount={r.amount} />
      </div>
      {r.allocations.length > 0 && (
        <>
          <p className="mb-1 font-semibold">Applied to</p>
          <PrintTable head={["Installment", "Due", "Amount"]} right={[2]} rows={r.allocations.map((a) => [`${INSTALLMENT_KIND_LABEL[a.kind] ?? a.kind} #${a.seq}`, formatDate(a.dueDate), m(a.amount)])} />
        </>
      )}
      {b.data && (
        <p className="mt-4 text-neutral-600">Balance on this booking after this receipt: <span className="font-mono font-medium text-neutral-900">{m(num(b.data.netPrice) - num(b.data.paidAmount))}</span> of {m(b.data.netPrice)}.</p>
      )}
      {r.status === "void" && <p className="mt-4 font-semibold text-red-700">This receipt was cancelled{r.voidReason ? `: ${r.voidReason}` : ""}.</p>}
    </PrintShell>
  );
}

// ───────────────────────────────────────────── voucher
export function VoucherDoc({ id }: { id: string }) {
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "voucher", id], queryFn: () => getVoucher(company.id, id) });
  const v = q.data;
  if (q.isLoading) return <Loading />;
  if (!v) return <Missing what="This voucher" />;
  const meta = liveVoucherMeta(v.type);
  const lines = v.journal.length ? v.journal : null;
  return (
    <PrintShell title={meta.label} number={v.number} date={formatDate(v.date)} signatures={["Prepared by", "Checked by", "Approved by", "Received by"]}>
      <div className="grid grid-cols-3 gap-5">
        <Fact label={meta.partyLabel ?? "Party"}>{v.partyName}</Fact>
        <Fact label="Bank account">{v.bankName ? `${v.bankName} ${v.bankAccountNo ?? ""}` : null}</Fact>
        <Fact label="Instrument">{v.instrumentType ? `${v.instrumentType.replace(/_/g, " ")} ${v.instrumentNo ?? ""}` : null}</Fact>
        <Fact label="Reference">{v.reference}</Fact>
        <Fact label="Invoice no.">{v.invoiceNo}</Fact>
        <Fact label="Status">{v.status}</Fact>
      </div>
      {v.description && <p className="mt-4 rounded bg-neutral-50 p-2.5">{v.description}</p>}
      <div className="mt-5">
        <PrintTable
          head={["Account", "Details", "Debit", "Credit"]}
          right={[2, 3]}
          rows={(lines ?? v.lines.map((l) => ({ accountCode: l.accountCode, accountName: l.accountName, partyName: l.partyName, memo: l.remarks, debit: l.debit, credit: l.credit }))).map((l) => [
            `${l.accountCode} ${l.accountName}`, [l.partyName, l.memo].filter(Boolean).join(" · "), num(l.debit) ? m(l.debit) : "", num(l.credit) ? m(l.credit) : "",
          ])}
          foot={["Total", "", m((lines ?? v.lines).reduce((s, l) => s + num(l.debit), 0)), m((lines ?? v.lines).reduce((s, l) => s + num(l.credit), 0))]}
        />
      </div>
      <Words amount={v.total} />
    </PrintShell>
  );
}

// ───────────────────────────────────────────── service invoice
export function ServiceInvoiceDoc({ id }: { id: string }) {
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "service-invoices"], queryFn: () => listServiceInvoices(company.id) });
  const i = q.data?.find((x) => x.id === id);
  if (q.isLoading) return <Loading />;
  if (!i) return <Missing what="This invoice" />;
  return (
    <PrintShell title={i.status === "void" ? "Invoice (VOID)" : "Invoice"} number={i.number} date={formatDate(i.issueDate)} signatures={["Authorised signature"]}>
      <div className="grid grid-cols-2 gap-5">
        <Fact label="Bill to">{i.customerName}</Fact>
        <Fact label="Due date">{formatDate(i.dueDate)}</Fact>
        <Fact label="Property">{[i.propertyCode, i.propertyTitle].filter(Boolean).join(" · ")}</Fact>
        <Fact label="For">{i.periodLabel}</Fact>
      </div>
      <div className="mt-5">
        <PrintTable head={["Description", "Amount"]} right={[1]} rows={[[i.description || i.periodLabel || "Service charges", m(i.amount)]]} foot={["Total", m(i.amount)]} />
      </div>
      <div className="mt-4 ms-auto w-64 space-y-1 text-end">
        <p>Paid: <span className="font-mono">{m(i.paidAmount)}</span></p>
        <p className="font-semibold">Balance due: <span className="font-mono">{m(i.balance)}</span></p>
      </div>
      <Words amount={i.amount} />
    </PrintShell>
  );
}

// ───────────────────────────────────────────── booking: payment plan and receipts
export function BookingDoc({ id }: { id: string }) {
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "booking", id], queryFn: () => getBooking(company.id, id) });
  const rec = useQuery({ queryKey: ["live", "print", "booking-receipts", id], queryFn: () => listReceipts(company.id, { bookingId: id, status: "posted" }) });
  const b = q.data;
  if (q.isLoading) return <Loading />;
  if (!b) return <Missing what="This booking" />;
  return (
    <PrintShell title="Payment plan" number={b.bookingNo} date={formatDate(b.bookingDate)} signatures={["Company", "Customer"]} ready={!!rec.data}>
      <div className="grid grid-cols-3 gap-5">
        <Fact label="Customer">{b.customerName}</Fact>
        <Fact label="Property">{b.propertyCode} · {b.propertyTitle}</Fact>
        <Fact label="Project">{b.projectName}</Fact>
        <Fact label="List price">{m(b.listPrice)}</Fact>
        <Fact label="Discount">{m(b.discount)}</Fact>
        <Fact label="Net price">{m(b.netPrice)}</Fact>
      </div>
      <p className="mb-1 mt-6 font-semibold">Installments</p>
      <PrintTable
        head={["#", "What", "Due", "Amount", "Paid", "Status"]}
        right={[3, 4]}
        rows={b.installments.map((i) => [i.seq, INSTALLMENT_KIND_LABEL[i.kind] ?? i.kind, formatDate(i.dueDate), m(i.amount), num(i.paidAmount) ? m(i.paidAmount) : "", i.status])}
        foot={["", "Total", "", m(b.installments.reduce((s, i) => s + num(i.amount), 0)), m(b.installments.reduce((s, i) => s + num(i.paidAmount), 0)), ""]}
      />
      {(rec.data ?? []).length > 0 && (
        <>
          <p className="mb-1 mt-6 font-semibold">Payments received</p>
          <PrintTable head={["Receipt", "Date", "Paid by", "Amount"]} right={[3]} rows={(rec.data ?? []).map((r) => [r.receiptNo, formatDate(r.receivedOn), methodLabel(r.method), m(r.amount)])} />
        </>
      )}
      <p className="mt-4 font-semibold">Balance to pay: <span className="font-mono">{m(num(b.netPrice) - num(b.paidAmount))}</span></p>
    </PrintShell>
  );
}

// ───────────────────────────────────────────── customer / supplier statement
export function StatementDoc({ id }: { id: string }) {
  const { company } = useCompany();
  const fy = fiscalYearOf(todayIso());
  const q = useQuery({ queryKey: ["live", "print", "statement", id], queryFn: () => partyStatement(company.id, id, "2000-01-01", todayIso()) });
  const s = q.data;
  if (q.isLoading) return <Loading />;
  if (!s) return <Missing what="This statement" />;
  const closing = s.lines.length ? num(s.lines[s.lines.length - 1]!.balance) : num(s.openingBalance);
  void fy;
  return (
    <PrintShell title="Statement of account" date={`As of ${formatDate(todayIso())}`} signatures={[]}>
      <div className="grid grid-cols-3 gap-5">
        <Fact label="Account of">{s.party.name}</Fact>
        <Fact label="Phone">{s.party.phone}</Fact>
        <Fact label="City">{s.party.city}</Fact>
      </div>
      <div className="mt-5">
        <PrintTable
          head={["Date", "Entry", "Debit", "Credit", "Balance"]}
          right={[2, 3, 4]}
          rows={[["", "Opening balance", "", "", m(s.openingBalance)], ...s.lines.map((l) => [formatDate(l.date), `${l.number} ${l.accountName}`, num(l.debit) ? m(l.debit) : "", num(l.credit) ? m(l.credit) : "", m(l.balance)])]}
          foot={["", "Closing balance", "", "", m(closing)]}
        />
      </div>
      <p className="mt-3 text-neutral-600">{closing > 0 ? "Amount due from the customer." : closing < 0 ? "Amount due to the party (credit balance)." : "Nothing outstanding."}</p>
    </PrintShell>
  );
}

// ───────────────────────────────────────────── quotation
export function QuotationDoc({ id }: { id: string }) {
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "quotations"], queryFn: () => listQuotations(company.id) });
  const x = q.data?.find((r) => r.id === id);
  if (q.isLoading) return <Loading />;
  if (!x) return <Missing what="This quotation" />;
  const rest = num(x.netPrice) - num(x.downPayment);
  return (
    <PrintShell title="Quotation" number={x.quoteNo} date={formatDate(x.quoteDate)} signatures={["For the company", "Customer's acceptance"]}>
      <div className="grid grid-cols-2 gap-5">
        <Fact label="Prepared for">{x.customerName ?? x.leadName}</Fact>
        <Fact label="Valid until">{formatDate(x.validUntil)}</Fact>
        <Fact label="Property">{x.propertyCode} · {x.propertyTitle}</Fact>
        <Fact label="Project">{x.projectName}</Fact>
      </div>
      <div className="mt-5">
        <PrintTable
          head={["Item", "Amount"]}
          right={[1]}
          rows={[["List price", m(x.listPrice)], ...(num(x.discount) ? [["Discount", `− ${m(x.discount)}`]] : []), ...(x.installments > 0 ? [["Down payment", m(x.downPayment)], [`${x.installments} installments of about ${m(rest / x.installments)} every ${x.intervalMonths} month${x.intervalMonths === 1 ? "" : "s"}, from ${x.firstDue ? formatDate(x.firstDue) : "—"}`, m(rest)]] : [])]}
          foot={["Total payable", m(x.netPrice)]}
        />
      </div>
      <Words amount={x.netPrice} />
      {x.notes && <p className="mt-4 rounded bg-neutral-50 p-2.5">{x.notes}</p>}
      <p className="mt-6 text-xs text-neutral-500">This offer is valid until {formatDate(x.validUntil)} and is subject to the property being available.</p>
    </PrintShell>
  );
}

// ───────────────────────────────────────────── contract
export function ContractDoc({ id }: { id: string }) {
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "contracts"], queryFn: () => listContracts(company.id) });
  const c = q.data?.find((r) => r.id === id);
  if (q.isLoading) return <Loading />;
  if (!c) return <Missing what="This contract" />;
  return (
    <PrintShell title="Agreement" number={c.contractNo} date={c.signedOn ? `Signed ${formatDate(c.signedOn)}` : "Draft"} signatures={["For the company", c.partyName ?? "Other party", "Witness"]}>
      <h2 className="mb-3 font-heading text-lg font-semibold">{c.title}</h2>
      <div className="grid grid-cols-3 gap-5">
        <Fact label="With">{c.partyName}</Fact>
        <Fact label="Starts">{formatDate(c.startDate)}</Fact>
        <Fact label="Ends">{c.endDate ? formatDate(c.endDate) : "Open"}</Fact>
        <Fact label="Value">{num(c.value) ? m(c.value) : null}</Fact>
        <Fact label="Property">{c.propertyCode}</Fact>
        <Fact label="Booking">{c.bookingNo}</Fact>
      </div>
      <p className="mb-1 mt-6 font-semibold">Terms</p>
      <p className="whitespace-pre-wrap">{c.terms || "As agreed between the parties."}</p>
    </PrintShell>
  );
}

// ───────────────────────────────────────────── payslip
export function PayslipDoc({ id, lineId }: { id: string; lineId: string }) {
  const { company } = useCompany();
  const q = useQuery({ queryKey: ["live", "print", "payroll", id], queryFn: () => getPayroll(company.id, id) });
  const run = q.data;
  const l = run?.lines.find((x) => x.id === lineId);
  if (q.isLoading) return <Loading />;
  if (!run || !l) return <Missing what="This payslip" />;
  const earn = num(l.basic) + num(l.allowances) + num(l.bonus);
  return (
    <PrintShell title="Payslip" number={run.runNo} date={run.month} signatures={["Accounts", "Employee"]}>
      <div className="grid grid-cols-3 gap-5">
        <Fact label="Employee">{l.fullName}</Fact>
        <Fact label="Employee no.">{l.empNo}</Fact>
        <Fact label="Designation">{l.designation}</Fact>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-6">
        <PrintTable head={["Earnings", "Amount"]} right={[1]} rows={[["Basic salary", m(l.basic)], ["Allowances", m(l.allowances)], ...(num(l.bonus) ? [["Bonus", m(l.bonus)]] : [])]} foot={["Total earnings", m(earn)]} />
        <PrintTable head={["Deductions", "Amount"]} right={[1]} rows={[["Income tax", m(l.tax)], ...(num(l.unpaidDeduction) ? [[`Unpaid leave (${num(l.unpaidLeaveDays)} days)`, m(l.unpaidDeduction)]] : [])]} foot={["Total deductions", m(num(l.tax) + num(l.unpaidDeduction))]} />
      </div>
      <div className="mt-6 rounded border-2 border-neutral-800 p-4"><p className="text-[11px] uppercase tracking-wide text-neutral-500">Net pay</p><p className="font-mono text-2xl font-semibold">{m(l.net)}</p><Words amount={l.net} /></div>
    </PrintShell>
  );
}
