const carol = ID.carol, B = ID.coB;
const aAcc = (await raw("GET", "/v1/accounts", alice, A)).body.filter((a: any) => !(a.isGroup ?? a.is_group));
const bAcc = (await raw("GET", "/v1/accounts", carol, B)).body.filter((a: any) => !(a.isGroup ?? a.is_group));
const bProp = ID.propB1;
// records that live in company B
const bBook = (await raw("POST", "/v1/bookings", carol, B, { propertyId: bProp, customerId: ID.custB, paymentType: "installment" })).body;
await raw("POST", `/v1/bookings/${bBook.id}/schedule`, carol, B, { downPayment: "1000", installments: 2, firstDue: "2026-12-01" });
const bFull = (await raw("GET", `/v1/bookings/${bBook.id}`, carol, B)).body; const bInst = bFull.installments[0].id;
const bBank = (await raw("POST", "/v1/bank-accounts", carol, B, { accountTitle: "B Bank", accountNo: "B-12345", bankName: "Meezan Bank" })).body;
const bEmp = (await raw("POST", "/v1/employees", carol, B, { fullName: "B Employee", joinDate: "2026-01-01", basicSalary: "1000" })).body;
const bLeaveTypes = (await raw("GET", "/v1/leave/types", carol, B)).body;
const bBudget = (await raw("POST", "/v1/budgets", carol, B, { name: "B budget", kind: "project", projectId: ID.prjB, lines: [{ category: "x", accountId: bAcc[3].id, amount: "10" }] })).body;
const bRec = (await raw("POST", "/v1/receipts", carol, B, { bookingId: bBook.id, amount: "500", method: "cash" })).body;
const aCust = (await raw("POST", "/v1/parties", alice, A, { name: "QA xref cust", roles: ["customer"] })).body;
const aProp = await mkP("QA xref plot");
async function mkP(title: string) { return (await raw("POST", "/v1/properties", alice, A, { title, typeId: ID.typeA, projectId: ID.prjA, listPrice: "1000" })).body; }
const aBook = (await raw("POST", "/v1/bookings", alice, A, { propertyId: aProp.id, customerId: aCust.id, paymentType: "installment" })).body;
await raw("POST", `/v1/bookings/${aBook.id}/schedule`, alice, A, { downPayment: "100", installments: 2, firstDue: "2026-12-01" });
const aBank = (await raw("POST", "/v1/bank-accounts", alice, A, { accountTitle: "A Bank", accountNo: "A-12345", bankName: "Meezan Bank" })).body;
const aEmp = (await raw("POST", "/v1/employees", alice, A, { fullName: "A Employee", joinDate: "2026-01-01", basicSalary: "1000" })).body;
const aLt = (await raw("GET", "/v1/leave/types", alice, A)).body;
const aInst = (await raw("GET", `/v1/bookings/${aBook.id}`, alice, A)).body.installments[0].id;
const xr: [string, any][] = [];
const X = async (name: string, p: Promise<any>) => { const r = await p; xr.push([name, r]); };
await X("budget project of B", raw("POST", "/v1/budgets", alice, A, { name: "QA x-budget", kind: "project", projectId: ID.prjB }));
await X("budget line account of B", raw("POST", "/v1/budgets", alice, A, { name: "QA x-budget2", kind: "project", projectId: ID.prjA, lines: [{ category: "x", accountId: bAcc[0].id, amount: "5" }] }));
await X("quotation property of B", raw("POST", "/v1/quotations", alice, A, { partyId: aCust.id, propertyId: bProp, validUntil: "2026-12-31" }));
await X("quotation party of B", raw("POST", "/v1/quotations", alice, A, { partyId: ID.custB, propertyId: aProp.id, validUntil: "2026-12-31" }));
await X("cheque party of B", raw("POST", "/v1/cheques", alice, A, { chequeNo: "X-1", bankName: "HBL", partyId: ID.custB, amount: "5", chequeDate: "2026-12-01" }));
await X("cheque booking of B", raw("POST", "/v1/cheques", alice, A, { chequeNo: "X-2", bankName: "HBL", partyId: aCust.id, bookingId: bBook.id, amount: "5", chequeDate: "2026-12-01" }));
await X("service invoice customer of B", raw("POST", "/v1/service-invoices", alice, A, { customerId: ID.custB, dueDate: "2026-12-01", amount: "5" }));
await X("service invoice property of B", raw("POST", "/v1/service-invoices", alice, A, { customerId: aCust.id, propertyId: bProp, dueDate: "2026-12-01", amount: "5" }));
await X("service invoice revenue acct of B", raw("POST", "/v1/service-invoices", alice, A, { customerId: aCust.id, revenueAccountId: bAcc[0].id, dueDate: "2026-12-01", amount: "5" }));
await X("receipt booking of B", raw("POST", "/v1/receipts", alice, A, { bookingId: bBook.id, amount: "5", method: "cash" }));
await X("receipt allocation installment of B", raw("POST", "/v1/receipts", alice, A, { bookingId: aBook.id, amount: "5", method: "cash", allocations: [{ installmentId: bInst, amount: "5" }] }));
await X("receipt deposit account of B", raw("POST", "/v1/receipts", alice, A, { bookingId: aBook.id, amount: "5", method: "cash", depositAccountId: bAcc[0].id }));
await X("receipt bank account of B", raw("POST", "/v1/receipts", alice, A, { bookingId: aBook.id, amount: "5", method: "bank_transfer", bankAccountId: bBank.id }));
await X("receipt void of B's receipt", raw("POST", `/v1/receipts/${bRec.id}/void`, alice, A, { reason: "x-company void" }));
await X("reminder booking of B", raw("POST", "/v1/reminders", alice, A, { bookingId: bBook.id, channel: "call" }));
await X("reminder installment of B", raw("POST", "/v1/reminders", alice, A, { bookingId: aBook.id, installmentId: bInst, channel: "call" }));
await X("leave request employee of B", raw("POST", "/v1/leave/requests", alice, A, { employeeId: bEmp.id, leaveTypeId: aLt[0].id, fromDate: "2026-12-01", toDate: "2026-12-02" }));
await X("leave request leave-type of B", raw("POST", "/v1/leave/requests", alice, A, { employeeId: aEmp.id, leaveTypeId: bLeaveTypes[0].id, fromDate: "2026-12-01", toDate: "2026-12-02" }));
await X("booking dealer of B", raw("POST", "/v1/bookings", alice, A, { propertyId: (await mkP("QA xref plot 2")).id, customerId: aCust.id, paymentType: "cash", dealerId: ID.custB }));
await X("hold party of B", raw("POST", `/v1/properties/${(await mkP("QA xref plot 3")).id}/holds`, alice, A, { partyId: ID.custB }));
await X("booking transfer to party of B", raw("POST", `/v1/bookings/${aBook.id}/transfer`, alice, A, { toPartyId: ID.custB }));
await X("refund bank account of B", (async () => { const p = await mkP("QA xref plot 4"); const b = (await raw("POST", "/v1/bookings", alice, A, { propertyId: p.id, customerId: aCust.id, paymentType: "cash" })).body; await raw("POST", "/v1/receipts", alice, A, { bookingId: b.id, amount: "100", method: "cash" }); await raw("POST", `/v1/bookings/${b.id}/status`, alice, A, { to: "cancelled", reason: "QA x" }); return raw("POST", `/v1/bookings/${b.id}/refund`, alice, A, { refundAmount: "50", method: "bank_transfer", bankAccountId: bBank.id }); })());
await X("voucher line party of B", raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-11-03", lines: [{ accountId: aAcc[0].id, debit: "5", partyId: ID.custB }, { accountId: aAcc[1].id, credit: "5" }] }));
await X("voucher line project of B", raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-11-03", lines: [{ accountId: aAcc[0].id, debit: "5", projectId: ID.prjB }, { accountId: aAcc[1].id, credit: "5" }] }));
await X("voucher header party of B", raw("POST", "/v1/vouchers", alice, A, { type: "JV", date: "2026-11-03", partyId: ID.custB, lines: [{ accountId: aAcc[0].id, debit: "5" }, { accountId: aAcc[1].id, credit: "5" }] }));
await X("CPV bank account of B", raw("POST", "/v1/vouchers", alice, A, { type: "BPV", date: "2026-11-03", bankAccountId: bBank.id, lines: [{ accountId: aAcc[0].id, debit: "5" }] }));
await X("bank statement import on B's account", raw("POST", `/v1/bank-accounts/${bBank.id}/statements`, alice, A, { periodFrom: "2026-11-01", periodTo: "2026-11-30", openingBalance: "0", closingBalance: "5", lines: [{ date: "2026-11-10", credit: "5" }] }));
await X("attachment on record of B", raw("POST", "/v1/attachments", alice, A, { entityType: "party", entityId: ID.custB, fileName: "x.pdf", mime: "application/pdf", data: "UEsDBA==" }));
await X("property project of B", raw("POST", "/v1/properties", alice, A, { title: "QA x", typeId: ID.typeA, projectId: ID.prjB, listPrice: "1" }));
await X("property type of B", raw("POST", "/v1/properties", alice, A, { title: "QA x", typeId: ID.typeB, projectId: ID.prjA, listPrice: "1" }));
await X("property legal of B", raw("PUT", `/v1/properties/${bProp}/legal`, alice, A, { titleStatus: "clear" }));
await X("valuation on property of B", raw("POST", `/v1/properties/${bProp}/valuations`, alice, A, { valuedOn: "2026-11-01", value: "100" }));
await X("employee payroll line patch of B", raw("PATCH", `/v1/payroll/${ID.custB}/lines/${ID.custB}`, alice, A, { bonus: "1" }));
await X("party patch of B", raw("PATCH", `/v1/parties/${ID.custB}`, alice, A, { city: "HACK" }));
await X("budget-check account of B", raw("POST", "/v1/budget-check", alice, A, { accountId: bAcc[0].id, amount: "5" }));
await X("account ledger of B", raw("GET", `/v1/accounts/${bAcc[0].id}/ledger`, alice, A));
await X("bank ledger of B", raw("GET", `/v1/bank-accounts/${bBank.id}/ledger`, alice, A));
await X("receipt detail of B", raw("GET", `/v1/receipts/${bRec.id}`, alice, A));
await X("booking extras of B", raw("GET", `/v1/bookings/${bBook.id}/extras`, alice, A));
await X("audit rows of B entity", raw("GET", `/v1/audit?entityId=${ID.custB}`, alice, A));
await X("party statement of B", raw("GET", `/v1/parties/${ID.custB}/statement`, alice, A));
await X("collections", raw("GET", `/v1/collections?bucket=all`, alice, A));
await t("C3b", "Cross-company references on every create endpoint (alice in A sends B's ids)", async () => {
  const accepted = xr.filter(([n, r]) => r.status < 400 && !/^(budget-check|account ledger|bank ledger|receipt detail|booking extras|audit rows|party statement|collections)/.test(n));
  const leaks = xr.filter(([n, r]) => r.status < 400 && /^(account ledger|bank ledger|receipt detail|booking extras|audit rows|party statement)/.test(n) && JSON.stringify(r.body).length > 80 && !/"rows":\[\]|"lines":\[\]|\[\]$/.test(JSON.stringify(r.body)));
  return [accepted.length === 0 && leaks.length === 0, `ACCEPTED: ${accepted.map(([n, r]) => `${n}→${r.status}`).join("; ") || "none"} || LEAKS: ${leaks.map(([n, r]) => n + " " + JSON.stringify(r.body).slice(0, 80)).join("; ") || "none"} || ALL: ${xr.map(([n, r]) => `${n.replace(/ of B.*| on B.*/, "")}:${r.status}`).join(", ")}`];
});
const bt = await raw("GET", `/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31`, carol, B);
await t("C3c", "B's books unchanged by A's attempts", async () => {
  const rc = (await raw("GET", `/v1/receipts/${bRec.id}`, carol, B)).body; const bk = (await raw("GET", `/v1/bookings/${bBook.id}`, carol, B)).body; const pt = (await raw("GET", `/v1/parties/${ID.custB}`, carol, B)).body;
  return [rc.status === "posted" && !JSON.stringify(pt).includes("HACK") && bk.paidAmount === "500.00", `B receipt ${rc.status}, B booking paid ${bk.paidAmount}, B TB ${JSON.stringify(bt.body.totals)}, B party city ${pt.city}`];
});
// ── agent data scope on others' bookings
await t("B3d", "Agent (own-records scope) acting on a booking created by someone else", async () => {
  const dave = ID.dave; const o = aBook.id; const log: string[] = []; const bad: string[] = [];
  const tries: [string, Promise<any>][] = [
    ["view", raw("GET", `/v1/bookings/${o}`, dave, A)], ["extras", raw("GET", `/v1/bookings/${o}/extras`, dave, A)], ["receipt", raw("POST", "/v1/receipts", dave, A, { bookingId: o, amount: "1", method: "cash" })],
    ["schedule", raw("POST", `/v1/bookings/${o}/schedule`, dave, A, { downPayment: "1", installments: 3 })], ["confirm", raw("POST", `/v1/bookings/${o}/status`, dave, A, { to: "confirmed" })],
    ["transfer", raw("POST", `/v1/bookings/${o}/transfer`, dave, A, { toPartyId: ID.custA })], ["reminder", raw("POST", "/v1/reminders", dave, A, { bookingId: o, channel: "call" })],
    ["penalty", raw("POST", `/v1/installments/${aInst}/penalty`, dave, A, { amount: "1" })], ["attachments", raw("GET", `/v1/attachments?entityType=booking&entityId=${o}`, dave, A)],
    ["receipt list", raw("GET", `/v1/receipts?bookingId=${o}`, dave, A)], ["customer statement", raw("GET", `/v1/parties/${aCust.id}/statement`, dave, A)],
    ["booking from quotation list", raw("GET", `/v1/collections?bucket=all`, dave, A)],
  ];
  for (const [n, p] of tries) { const r = await p; log.push(`${n}:${r.status}`); if (r.status < 400 && !["receipt list", "attachments", "booking from quotation list", "customer statement"].includes(n)) bad.push(n); if (["receipt list", "collections", "booking from quotation list"].includes(n) && JSON.stringify(r.body).includes(aCust.id)) bad.push(n + " lists others' data"); }
  return [bad.length === 0, `allowed on someone else's booking: [${bad.join(",")}] — ${log.join(" ")}`];
});
// ── payroll totals
await t("I3b", "Payroll header totals vs lines; ledger entry amounts", async () => {
  await raw("POST", "/v1/employees", alice, A, { fullName: "QA Payroll One", joinDate: "2026-01-01", basicSalary: "40000", houseAllowance: "5000.55", incomeTax: "1000.10" });
  const p = await raw("POST", "/v1/payroll", alice, A, { month: "2026-09" }); const d0 = (await raw("GET", `/v1/payroll/${p.body.id}`, alice, A)).body;
  const lines = d0.lines ?? []; const keys = Object.keys(d0).join(",");
  await raw("POST", `/v1/payroll/${p.body.id}/approve`, alice, A); const d1 = (await raw("GET", `/v1/payroll/${p.body.id}`, alice, A)).body;
  const sum = (k: string) => lines.reduce((s: number, l: any) => s + Math.round(Number(l[k]) * 100), 0) / 100;
  const before = Number((await raw("GET", `/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31`, alice, A)).body.totals.debit);
  await raw("POST", `/v1/payroll/${p.body.id}/pay`, alice, A, {}); const d2 = (await raw("GET", `/v1/payroll/${p.body.id}`, alice, A)).body;
  const after = Number((await raw("GET", `/v1/reports/trial-balance?from=2000-01-01&to=2999-12-31`, alice, A)).body.totals.debit);
  return [Math.abs(Number(d1.totalNet ?? d1.netTotal ?? d1.total_net ?? NaN) - sum("netPay")) < 0.005, `header keys ${keys}; run status ${d0.status}→${d1.status}→${d2.status}; header net draft ${d0.totalNet ?? d0.netTotal} approved ${d1.totalNet ?? d1.netTotal} paid ${d2.totalNet ?? d2.netTotal}; sum(lines.netPay)=${sum("netPay")} sum(gross)=${sum("gross")}; ledger debit moved on pay ${(after - before).toFixed(2)}; line sample ${JSON.stringify(lines[0]).slice(0, 260)}`];
});
await t("D7b", "Price edit through PATCH (what fields does it accept?)", async () => {
  const c = (await raw("POST", "/v1/parties", alice, A, { name: "QA price2", roles: ["customer"] })).body; const p = await mkP("QA price plot");
  const b = (await raw("POST", "/v1/bookings", alice, A, { propertyId: p.id, customerId: c.id, paymentType: "cash" })).body;
  const e1 = await raw("PATCH", `/v1/properties/${p.id}`, alice, A, { price: "250000" }); const e2 = await raw("PATCH", `/v1/properties/${p.id}`, alice, A, { listPrice: "250000" });
  const g = (await raw("GET", `/v1/bookings/${b.id}`, alice, A)).body; const gp = (await raw("GET", `/v1/properties/${p.id}`, alice, A)).body;
  return [g.netPrice === "1000.00", `PATCH price ${e1.status} ${JSON.stringify(e1.body?.error?.details ?? "").slice(0, 100)}; listPrice ${e2.status}; property list price now ${gp.listPrice}; booking net ${g.netPrice}`];
});
await t("H9b", "Bank statement import (credit-only line) and duplicate re-import", async () => {
  const mk = () => raw("POST", `/v1/bank-accounts/${aBank.id}/statements`, alice, A, { label: "QA stmt", periodFrom: "2026-11-01", periodTo: "2026-11-30", openingBalance: "0", closingBalance: "20000", lines: [{ date: "2026-11-10", description: "QA deposit", reference: "QA-001", credit: "20000" }, { date: "2026-11-11", description: "QA fee", debit: "50.50" }] });
  const a = await mk(); const b = await mk(); const list = (await raw("GET", `/v1/bank-accounts/${aBank.id}/statements`, alice, A)).body;
  const bad = await raw("POST", `/v1/bank-accounts/${aBank.id}/statements`, alice, A, { periodFrom: "2026-11-01", periodTo: "2026-11-30", openingBalance: "0", closingBalance: "0", lines: [{ date: "2026-11-10", debit: "5", credit: "5" }, { date: "2026-11-10" }] });
  return [a.status === 201 && b.status >= 400, `first import ${a.status} ${a.status > 300 ? JSON.stringify(a.body).slice(0, 150) : ""}; identical re-import ${b.status} (statements listed: ${Array.isArray(list) ? list.length : list?.rows?.length}); line with both debit and credit / none ${bad.status} ${JSON.stringify(bad.body?.error?.details ?? bad.body?.error?.message ?? "").slice(0, 120)}`];
});
await t("O3b", "leads-summary leak on Basic plan (count only?)", async () => {
  const r = await raw("GET", "/v1/leads-summary", OWN_B, CO_B); const l = await raw("GET", "/v1/leads", OWN_B, CO_B);
  return [r.status === 403, `leads-summary ${r.status} ${JSON.stringify(r.body).slice(0, 120)}; leads ${l.status}`];
});
await t("I2b", "Overlapping leave: root cause of the 500", async () => {
  const e = (await raw("POST", "/v1/employees", alice, A, { fullName: "QA Leave", joinDate: "2026-01-01" })).body; const lt = (await raw("GET", "/v1/leave/types", alice, A)).body[0];
  await raw("POST", "/v1/leave/requests", alice, A, { employeeId: e.id, leaveTypeId: lt.id, fromDate: "2026-11-10", toDate: "2026-11-12" });
  const r = await raw("POST", "/v1/leave/requests", alice, A, { employeeId: e.id, leaveTypeId: lt.id, fromDate: "2026-11-11", toDate: "2026-11-13" });
  return [r.status === 409 || r.status === 422, `overlap → ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`];
});
const pass = out.filter((o) => o.ok).length;
console.log(`\nSUMMARY ${pass}/${out.length} pass`);
await h.close(); process.exit(0);
