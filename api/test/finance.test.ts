import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ID, startHarness, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});

const A = ID.coA;
const B = ID.coB;
const owner = { as: ID.alice, company: A };
const accountant = { as: ID.frank, company: A };

/** account ids by code, for company A */
async function codes(company = A, as = ID.alice): Promise<Record<string, string>> {
  const r = await h.call("GET", "/v1/accounts", { as, company });
  return Object.fromEntries(r.body.map((a: { code: string; id: string }) => [a.code, a.id]));
}

describe("what a person may do", () => {
  it("tells the screens which actions this person has, per company", async () => {
    const owner_ = await h.call("GET", "/v1/access", owner);
    expect(owner_.body.permissions).toEqual(expect.arrayContaining(["accounts.approve", "accounts.create", "customers.view", "reports.view"]));
    const acct = await h.call("GET", "/v1/access", accountant);
    expect(acct.body.permissions).toContain("accounts.create");
    expect(acct.body.permissions).not.toContain("accounts.approve");
    expect((await h.call("GET", "/v1/access", { as: ID.carol, company: A })).status).toBe(403);
  });
});

describe("customers and suppliers", () => {
  it("stores a CNIC encrypted, shows only the last four digits, and refuses the same CNIC twice", async () => {
    const r = await h.call("POST", "/v1/parties", { ...owner, body: { name: "Ahmed Khan", roles: ["customer"], cnic: "35201-1234567-1", phone: "0300-1234567", city: "Lahore" } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: "Ahmed Khan", cnicLast4: "5671", phone: "+923001234567", roles: ["customer"], balance: "0" });
    expect(JSON.stringify(r.body)).not.toContain("3520112345671");
    const stored = await h.admin((c) => c.query(`select cnic_enc, cnic_hash from parties where id = $1`, [r.body.id]));
    expect(stored.rows[0].cnic_enc).not.toContain("3520112345671");
    expect(stored.rows[0].cnic_hash).toMatch(/^[0-9a-f]{64}$/);
    const dup = await h.call("POST", "/v1/parties", { ...owner, body: { name: "Ahmed K.", cnic: "3520112345671" } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe("A customer with this CNIC already exists.");
  });

  it("refuses a malformed CNIC or phone, and the same phone twice", async () => {
    expect((await h.call("POST", "/v1/parties", { ...owner, body: { name: "Bad Cnic", cnic: "12345" } })).body.error.code).toBe("invalid_cnic");
    expect((await h.call("POST", "/v1/parties", { ...owner, body: { name: "Bad Phone", phone: "abc" } })).body.error.code).toBe("invalid_phone");
    const dup = await h.call("POST", "/v1/parties", { ...owner, body: { name: "Same Phone", phone: "+92 300 1234567" } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toMatch(/Ahmed Khan already has this phone number/);
  });

  it("keeps suppliers and customers in one address book, filtered by role", async () => {
    await h.call("POST", "/v1/parties", { ...owner, body: { name: "Lahore Steel Traders", roles: ["vendor"], kind: "organization", ntn: "1234567-8" } });
    const vendors = await h.call("GET", "/v1/parties?role=vendor", owner);
    expect(vendors.body.map((p: { name: string }) => p.name)).toEqual(["Lahore Steel Traders"]);
    const found = await h.call("GET", "/v1/parties?search=5671", owner);
    expect(found.body.map((p: { name: string }) => p.name)).toEqual(["Ahmed Khan"]);
  });

  it("stays inside the company, and a viewer role without the module cannot create", async () => {
    const theirs = (await h.call("GET", "/v1/parties", { as: ID.carol, company: B })).body.map((p: { name: string }) => p.name);
    expect(theirs).toEqual(["Customer of B"]); // only its own address book
    const viewer = await h.call("POST", "/v1/parties", { as: ID.bob, company: A, body: { name: "Nope" } });
    expect(viewer.status).toBe(403);
  });
});

describe("the chart of accounts", () => {
  it("every new company has a standard chart (headings and accounts)", async () => {
    const all = await h.call("GET", "/v1/accounts", owner);
    expect(all.body.length).toBeGreaterThan(80);
    const postable = await h.call("GET", "/v1/accounts?postable=1", owner);
    expect(postable.body.every((a: { isGroup: boolean }) => !a.isGroup)).toBe(true);
    const cash = all.body.find((a: { code: string }) => a.code === "03.01.01.0001");
    expect(cash).toMatchObject({ name: "Cash in Hand", class: "asset", category: "asset_cash", isGroup: false });
  });

  it("numbers a new account for you, and keeps the structure honest", async () => {
    const ids = await codes();
    const r = await h.call("POST", "/v1/accounts", { ...owner, body: { parentId: ids["03.01.04"], name: "Prepaid Insurance" } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ code: "03.01.04.0002", name: "Prepaid Insurance", class: "asset", category: "asset_prepayments", isGroup: false });
    const tooHigh = await h.call("POST", "/v1/accounts", { ...owner, body: { parentId: ids["03"], name: "Directly under Assets" } });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error.code).toBe("wrong_level");
    const underAccount = await h.call("POST", "/v1/accounts", { ...owner, body: { parentId: ids["03.01.01.0001"], name: "Under an account" } });
    expect(underAccount.body.error.code).toBe("parent_not_a_group");
    const group = await h.call("POST", "/v1/accounts", { ...owner, body: { parentId: ids["03.01"], name: "Investments", isGroup: true } });
    expect(group.body).toMatchObject({ code: "03.01.06", isGroup: true });
  });

  it("will not switch off a system account, but renames and switches off others", async () => {
    const ids = await codes();
    const sys = await h.call("PATCH", `/v1/accounts/${ids["03.01.02.0001"]}`, { ...owner, body: { active: false } });
    expect(sys.status).toBe(409);
    const ok = await h.call("PATCH", `/v1/accounts/${ids["05.02.01.0003"]}`, { ...owner, body: { name: "Printing, Stationery & Photocopying" } });
    expect(ok.body.name).toBe("Printing, Stationery & Photocopying");
  });
});

describe("bank accounts", () => {
  it("offers every Pakistani bank to choose from", async () => {
    const r = await h.call("GET", "/v1/banks", owner);
    expect(r.body.length).toBeGreaterThanOrEqual(40);
    expect(r.body.map((b: { shortName: string }) => b.shortName)).toEqual(expect.arrayContaining(["HBL", "UBL", "MCB", "NBP", "Meezan", "Alfalah"]));
    expect(new Set(r.body.map((b: { kind: string }) => b.kind))).toEqual(new Set(["public", "private", "islamic", "foreign", "microfinance", "digital"]));
  });

  it("adds a bank account, which gets its own ledger account", async () => {
    const banks = (await h.call("GET", "/v1/banks", owner)).body as { id: string; shortName: string }[];
    const hbl = banks.find((b) => b.shortName === "HBL")!;
    const r = await h.call("POST", "/v1/bank-accounts", { ...owner, body: { bankId: hbl.id, branchName: "Gulberg", branchCode: "0123", accountTitle: "ByteCraft Current A/C", accountNo: "0123-4567890", iban: "PK36HABB0000000123456702" } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ bankName: "Habib Bank Limited", glCode: "03.01.01.0002", bookBalance: "0", unclearedCount: 0 });
    const typed = await h.call("POST", "/v1/bank-accounts", { ...owner, body: { bankName: "Local Co-operative Bank", accountTitle: "ByteCraft Savings", accountNo: "77-100" } });
    expect(typed.body).toMatchObject({ bankName: "Local Co-operative Bank", glCode: "03.01.01.0003" });
    const dup = await h.call("POST", "/v1/bank-accounts", { ...owner, body: { bankId: hbl.id, accountTitle: "Again", accountNo: "0123-4567890" } });
    expect(dup.status).toBe(409);
    const badIban = await h.call("POST", "/v1/bank-accounts", { ...owner, body: { bankId: hbl.id, accountTitle: "Test Account", accountNo: "999", iban: "GB29NWBK60161331926819" } });
    expect(badIban.status).toBe(422);
  });

  it("is invisible to another company, and its catalog is read-only to the API login", async () => {
    expect((await h.call("GET", "/v1/bank-accounts", { as: ID.carol, company: B })).body).toEqual([]);
    const priv = await h.db.pool.query(`select has_table_privilege('propiq_app','banks','SELECT') s, has_table_privilege('propiq_app','banks','INSERT') i, has_table_privilege('propiq_app','banks','UPDATE') u`);
    expect(priv.rows[0]).toEqual({ s: true, i: false, u: false });
  });
});

describe("vouchers", () => {
  let ids: Record<string, string>;
  let bankId: string;
  let cust: string;
  let supplier: string;
  beforeAll(async () => {
    ids = await codes();
    bankId = (await h.call("GET", "/v1/bank-accounts", owner)).body[0].id;
    cust = (await h.call("GET", "/v1/parties?role=customer", owner)).body[0].id;
    supplier = (await h.call("GET", "/v1/parties?role=vendor", owner)).body[0].id;
  });

  const create = (body: object, who = owner) => h.call("POST", "/v1/vouchers", { ...who, body });

  it("a cash payment: the cash account is filled in, the total is the sum of the lines, the number comes from the database", async () => {
    const r = await create({ type: "CPV", date: "2026-10-19", description: "Office rent and power", lines: [
      { accountId: ids["05.02.02.0001"], debit: 50000 }, { accountId: ids["05.02.01.0001"], debit: "10000" } ] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ type: "CPV", status: "draft", total: "60000.00", controlAccountCode: "03.01.01.0001", lineCount: 2 });
    expect(r.body.number).toMatch(/^CPV-\d{5}$/);
  });

  it("walks a payment through draft, submit, approve; approval posts a balanced entry to the ledger", async () => {
    const v = (await create({ type: "CPV", date: "2026-10-19", description: "Courier", lines: [{ accountId: ids["05.02.01.0004"], debit: 2500 }] })).body;
    const sub = await h.call("POST", `/v1/vouchers/${v.id}/submit`, owner);
    expect(sub.body.status).toBe("pending");
    const edit = await h.call("PUT", `/v1/vouchers/${v.id}`, { ...owner, body: { date: "2026-10-19", lines: [{ accountId: ids["05.02.01.0004"], debit: 2600 }] } });
    expect(edit.status).toBe(409); // submitted: no longer editable
    const ok = await h.call("POST", `/v1/vouchers/${v.id}/approve`, { ...owner, body: {} });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("approved");
    expect(ok.body.journal.map((l: { accountCode: string; debit: string; credit: string }) => [l.accountCode, l.debit, l.credit])).toEqual([
      ["05.02.01.0004", "2500.00", "0.00"], ["03.01.01.0001", "0.00", "2500.00"] ]);
    expect(ok.body.approvedBy).toBe("Alice Owner");
  });

  it("a bank payment posts to the chosen bank account and carries the cheque details", async () => {
    const v = (await create({ type: "BPV", date: "2026-10-20", bankAccountId: bankId, partyId: supplier, instrumentType: "cheque", instrumentNo: "CHQ-1001", instrumentBank: "Meezan Bank Limited",
      lines: [{ accountId: ids["02.01.01.0001"], debit: 250000 }] })).body;
    expect(v).toMatchObject({ type: "BPV", bankName: "Habib Bank Limited", instrumentNo: "CHQ-1001", instrumentBank: "Meezan Bank Limited", controlAccountCode: "03.01.01.0002" });
    await h.call("POST", `/v1/vouchers/${v.id}/submit`, owner);
    const ok = await h.call("POST", `/v1/vouchers/${v.id}/approve`, { ...owner, body: {} });
    expect(ok.body.journal.map((l: { accountCode: string; debit: string; credit: string }) => [l.accountCode, l.debit, l.credit])).toEqual([["02.01.01.0001", "250000.00", "0.00"], ["03.01.01.0002", "0.00", "250000.00"]]);
  });

  it("tells the person exactly what is wrong when a voucher cannot be submitted", async () => {
    const noCheque = (await create({ type: "BPV", date: "2026-10-20", bankAccountId: bankId, instrumentType: "cheque", lines: [{ accountId: ids["05.02.01.0001"], debit: 100 }] })).body;
    const r = await h.call("POST", `/v1/vouchers/${noCheque.id}/submit`, owner);
    expect(r.status).toBe(422);
    expect(r.body.error.message).toBe("Enter the cheque number");
    const wrongSide = (await create({ type: "CPV", date: "2026-10-20", lines: [{ accountId: ids["05.02.01.0001"], credit: 100 }] })).body;
    expect((await h.call("POST", `/v1/vouchers/${wrongSide.id}/submit`, owner)).body.error.message).toBe("Line 1: a CPV voucher takes debit lines only");
    const unbalanced = (await create({ type: "JV", date: "2026-10-20", lines: [{ accountId: ids["05.02.03.0001"], debit: 100 }, { accountId: ids["02.01.01.0003"], credit: 90 }] })).body;
    expect((await h.call("POST", `/v1/vouchers/${unbalanced.id}/submit`, owner)).body.error.message).toMatch(/must be equal/);
    const noBank = await create({ type: "BRV", date: "2026-10-20", lines: [{ accountId: ids["03.01.02.0001"], credit: 100, partyId: cust }] });
    expect(noBank.status).toBe(400);
    expect(noBank.body.error.code).toBe("bank_account_required");
  });

  it("covers sales and purchase invoices and notes: the customer or supplier account is chosen for you", async () => {
    const sv = (await create({ type: "SV", date: "2026-10-21", partyId: cust, dueDate: "2026-11-21", reference: "Plot A-12", lines: [
      { accountId: ids["04.01.01.0001"], credit: 1000000 }, { accountId: ids["02.01.03.0001"], credit: 160000 } ] })).body;
    expect(sv).toMatchObject({ type: "SV", total: "1160000.00", controlAccountCode: "03.01.02.0001", partyName: "Ahmed Khan" });
    await h.call("POST", `/v1/vouchers/${sv.id}/submit`, owner);
    const done = await h.call("POST", `/v1/vouchers/${sv.id}/approve`, { ...owner, body: {} });
    expect(done.body.journal.at(-1)).toMatchObject({ accountCode: "03.01.02.0001", debit: "1160000.00", partyName: "Ahmed Khan" });
    const piv = (await create({ type: "PIV", date: "2026-10-22", partyId: supplier, invoiceNo: "INV-5521", lines: [{ accountId: ids["05.01.01.0002"], debit: 800000 }, { accountId: ids["03.01.05.0001"], debit: 128000 }] })).body;
    await h.call("POST", `/v1/vouchers/${piv.id}/submit`, owner);
    const pdone = await h.call("POST", `/v1/vouchers/${piv.id}/approve`, { ...owner, body: {} });
    expect(pdone.body.journal.at(-1)).toMatchObject({ accountCode: "02.01.01.0001", credit: "928000.00" });
    const cn = (await create({ type: "CN", date: "2026-10-23", partyId: cust, lines: [{ accountId: ids["04.01.01.0002"], debit: 50000 }] })).body;
    await h.call("POST", `/v1/vouchers/${cn.id}/submit`, owner);
    expect((await h.call("POST", `/v1/vouchers/${cn.id}/approve`, { ...owner, body: {} })).body.status).toBe("approved");
  });

  it("separates preparing from approving: an accountant prepares, only an approver can approve", async () => {
    const v = (await create({ type: "CPV", date: "2026-10-24", lines: [{ accountId: ids["05.02.01.0002"], debit: 1800 }] }, accountant)).body;
    expect(v.createdBy).toBe("Frank Accountant");
    expect((await h.call("POST", `/v1/vouchers/${v.id}/submit`, accountant)).body.status).toBe("pending");
    const denied = await h.call("POST", `/v1/vouchers/${v.id}/approve`, { ...accountant, body: {} });
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toMatch(/accounts\.approve/);
    const reject = await h.call("POST", `/v1/vouchers/${v.id}/reject`, { ...owner, body: { reason: "Wrong account, please use stationery" } });
    expect(reject.body).toMatchObject({ status: "rejected", approvalNote: "Wrong account, please use stationery" });
    const fix = await h.call("PUT", `/v1/vouchers/${v.id}`, { ...accountant, body: { date: "2026-10-24", lines: [{ accountId: ids["05.02.01.0003"], debit: 1800 }] } });
    expect(fix.status).toBe(200);
  });

  it("voiding reverses the entry and keeps the history; a draft can be discarded", async () => {
    const v = (await create({ type: "CPV", date: "2026-10-25", lines: [{ accountId: ids["05.02.03.0002"], debit: 9000 }] })).body;
    await h.call("POST", `/v1/vouchers/${v.id}/submit`, owner);
    await h.call("POST", `/v1/vouchers/${v.id}/approve`, { ...owner, body: {} });
    const noReason = await h.call("POST", `/v1/vouchers/${v.id}/void`, { ...owner, body: { reason: "x" } });
    expect(noReason.status).toBe(400);
    const voided = await h.call("POST", `/v1/vouchers/${v.id}/void`, { ...owner, body: { reason: "Entered twice", date: "2026-10-26" } });
    expect(voided.body.status).toBe("void");
    const ledger = await h.call("GET", `/v1/accounts/${ids["05.02.03.0002"]}/ledger?from=2026-10-01&to=2026-10-31`, owner);
    expect(ledger.body.lines.map((l: { debit: string; credit: string; balance: string }) => [l.debit, l.credit, l.balance])).toEqual([["9000.00", "0.00", "9000.00"], ["0.00", "9000.00", "0.00"]]);
    const draft = (await create({ type: "CPV", date: "2026-10-25", lines: [{ accountId: ids["05.02.03.0002"], debit: 1 }] })).body;
    expect((await h.call("DELETE", `/v1/vouchers/${draft.id}`, owner)).status).toBe(204);
  });

  it("lists and searches vouchers, and another company sees none of them", async () => {
    const list = await h.call("GET", "/v1/vouchers?type=BPV", owner);
    expect(list.body).toHaveLength(2);
    expect(list.body.find((v: { instrumentNo: string }) => v.instrumentNo === "CHQ-1001")).toMatchObject({ total: "250000.00", bankName: "Habib Bank Limited" });
    expect((await h.call("GET", "/v1/vouchers?search=CHQ-1001", owner)).body).toHaveLength(1);
    expect((await h.call("GET", "/v1/vouchers", { as: ID.carol, company: B })).body).toEqual([]);
    const one = list.body[0];
    expect((await h.call("GET", `/v1/vouchers/${one.id}`, { as: ID.carol, company: B })).status).toBe(404);
  });
});

describe("accounts and reports", () => {
  let ids: Record<string, string>;
  beforeAll(async () => {
    ids = await codes();
  });

  it("the trial balance balances, with headings rolled up from their accounts", async () => {
    const r = await h.call("GET", "/v1/reports/trial-balance?from=2026-10-01&to=2026-10-31", owner);
    expect(r.status).toBe(200);
    expect(r.body.totals.debit).toBe(r.body.totals.credit);
    expect(Number(r.body.totals.debit)).toBeGreaterThan(0);
    expect(Math.abs(Number(r.body.totals.closing))).toBeLessThan(0.01);
    const assets = r.body.rows.find((x: { code: string }) => x.code === "03");
    const sumOfAccounts = r.body.rows.filter((x: { code: string; isGroup: boolean }) => !x.isGroup && x.code.startsWith("03.")).reduce((t: number, x: { closing: number }) => t + x.closing, 0);
    expect(assets.isGroup).toBe(true);
    expect(Math.round(assets.closing * 100)).toBe(Math.round(sumOfAccounts * 100));
  });

  it("the income statement and balance sheet agree with each other", async () => {
    const is = await h.call("GET", "/v1/reports/income-statement?from=2026-07-01&to=2027-06-30", owner);
    expect(is.body.totalIncome).toBe(1000000 - 50000);
    expect(is.body.totalExpense).toBe(2500 + 800000); // only what was approved: the courier bill and the contractor invoice (a voided 9,000 nets to zero)
    expect(is.body.netProfit).toBe(is.body.totalIncome - is.body.totalExpense);
    const bs = await h.call("GET", "/v1/reports/balance-sheet?asOf=2027-06-30", owner);
    expect(bs.body.balanced).toBe(true);
    expect(bs.body.profitToDate).toBe(is.body.netProfit);
    expect(bs.body.totalAssets).toBe(bs.body.totalLiabilities + bs.body.totalEquity);
  });

  it("a customer's statement shows what they owe, traced to the vouchers", async () => {
    const cust = (await h.call("GET", "/v1/parties?role=customer", owner)).body[0];
    const st = await h.call("GET", `/v1/parties/${cust.id}/statement`, owner);
    expect(st.body.lines.map((l: { debit: string; credit: string }) => [l.debit, l.credit])).toEqual([["1160000.00", "0.00"], ["0.00", "50000.00"]]);
    expect(st.body.lines.at(-1).balance).toBe("1110000.00");
    expect(st.body.lines.every((l: { sourceType: string }) => l.sourceType === "voucher")).toBe(true);
    expect((await h.call("GET", `/v1/parties/${cust.id}`, owner)).body.balance).toBe("1110000.00");
  });

  it("the management reports answer, are tied to the ledger and need the reports permission", async () => {
    const q = "from=2026-10-01&to=2026-10-31";
    const cash = await h.call("GET", `/v1/reports/cash-flow?${q}`, owner);
    expect(cash.status).toBe(200);
    const inflow = cash.body.months.reduce((t: number, m: { inflow: string }) => t + Number(m.inflow), 0);
    expect(inflow).toBeGreaterThan(0);
    expect(cash.body.sources.length).toBeGreaterThan(0);
    for (const path of ["receivables-aging", "sales-summary", `collections?${q}`, "payables?asOf=2026-10-31"]) {
      const r = await h.call("GET", `/v1/reports/${path}`, owner);
      expect(r.status, path).toBe(200);
      expect(Array.isArray(r.body.rows ?? r.body.months), path).toBe(true);
      expect((await h.call("GET", `/v1/reports/${path}`, { as: ID.dave, company: A })).status, path).toBe(403);
    }
  });

  it("only people with the reports and accounts permissions can see them", async () => {
    expect((await h.call("GET", "/v1/reports/trial-balance?from=2026-10-01&to=2026-10-31", { as: ID.dave, company: A })).status).toBe(403);
    expect((await h.call("GET", "/v1/reports/trial-balance?from=2026-10-01&to=2026-10-31", { as: ID.carol, company: B })).body.totals.debit).toBe(0);
  });
});

describe("bank reconciliation, end to end through the API", () => {
  let ids: Record<string, string>;
  let bank: { id: string; glAccountId: string };
  let stmtId: string;
  let lines: { id: string; lineNo: number; description: string }[];

  beforeAll(async () => {
    ids = await codes();
    bank = (await h.call("GET", "/v1/bank-accounts", owner)).body[0];
  });

  it("books a customer's cheque into the bank, then loads the October statement", async () => {
    const cust = (await h.call("GET", "/v1/parties?role=customer", owner)).body[0].id;
    const brv = (await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "BRV", date: "2026-10-12", bankAccountId: bank.id, partyId: cust, instrumentType: "cheque", instrumentNo: "UBL-90", instrumentBank: "United Bank Limited",
      lines: [{ accountId: ids["03.01.02.0001"], credit: 500000 }] } })).body;
    await h.call("POST", `/v1/vouchers/${brv.id}/submit`, owner);
    await h.call("POST", `/v1/vouchers/${brv.id}/approve`, { ...owner, body: {} });
    const led = await h.call("GET", `/v1/bank-accounts/${bank.id}/ledger`, owner);
    expect(led.body.map((l: { amount: string }) => l.amount)).toEqual(["500000.00", "-250000.00"]); // in date order
    // bank book balance = 250,000.  Statement: +500,000 deposit, -250,000 cheque, -1,500 charges = 248,500
    const s = await h.call("POST", `/v1/bank-accounts/${bank.id}/statements`, { ...owner, body: {
      label: "October 2026", periodFrom: "2026-10-01", periodTo: "2026-10-31", openingBalance: 0, closingBalance: "248500.00",
      lines: [
        { date: "2026-10-14", description: "CHEQUE DEPOSIT", reference: "UBL-90", deposit: 500000 },
        { date: "2026-10-27", description: "CHEQUE 1001 CLEARED", reference: "CHQ-1001", withdrawal: 250000 },
        { date: "2026-10-31", description: "SERVICE CHARGES", withdrawal: 1500 },
      ] } });
    expect(s.status).toBe(201);
    expect(s.body.linesAddUp).toBe(true);
    stmtId = s.body.id;
    const detail = await h.call("GET", `/v1/bank-statements/${stmtId}`, owner);
    lines = detail.body.lines;
    expect(lines).toHaveLength(3);
    expect(detail.body.lines.every((l: { matchStatus: string }) => l.matchStatus === "unmatched")).toBe(true);
  });

  it("suggests the two obvious matches and leaves the bank charge for you", async () => {
    const sug = (await h.call("GET", `/v1/bank-statements/${stmtId}/suggestions`, owner)).body;
    expect(sug).toHaveLength(2);
    expect(sug.every((x: { reason: string }) => x.reason === "same amount and reference")).toBe(true);
    for (const x of sug) {
      const r = await h.call("POST", `/v1/bank-statement-lines/${x.statementLineId}/match`, { ...owner, body: { journalLineIds: [x.journalLineId] } });
      expect(r.body.matchStatus).toBe("matched");
    }
  });

  it("will not finish while the bank's charge is missing from the books, then books it in one click", async () => {
    const rec = await h.call("POST", `/v1/bank-accounts/${bank.id}/reconciliations`, { ...owner, body: { statementId: stmtId, asOf: "2026-10-31", statementBalance: "248500.00" } });
    expect(rec.status).toBe(201);
    expect(rec.body.report.difference).toBe("-1500.00");
    expect(rec.body.canFinish).toBe(false);
    const early = await h.call("POST", `/v1/reconciliations/${rec.body.id}/finalize`, { ...owner, body: {} });
    expect(early.status).toBe(422);
    expect(early.body.error.message).toMatch(/does not balance/);

    const charge = lines.find((l) => l.description === "SERVICE CHARGES")!;
    const draft = await h.call("POST", `/v1/bank-statement-lines/${charge.id}/draft-voucher`, { ...owner, body: { accountId: ids["05.02.05.0001"] } });
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ type: "BPV", status: "draft" });
    await h.call("POST", `/v1/vouchers/${draft.body.id}/submit`, owner);
    await h.call("POST", `/v1/vouchers/${draft.body.id}/approve`, { ...owner, body: {} });

    const after = await h.call("GET", `/v1/reconciliations/${rec.body.id}`, owner);
    expect(after.body.report).toMatchObject({ statementBalance: "248500.00", clearedBalance: "248500.00", bookBalance: "248500.00", difference: "0.00" });
    expect(after.body.canFinish).toBe(true);
    const fin = await h.call("POST", `/v1/reconciliations/${rec.body.id}/finalize`, { ...owner, body: {} });
    expect(fin.body).toMatchObject({ status: "finalized", difference: "0.00", finalizedBy: "Alice Owner" });
  });

  it("locks a finished reconciliation; only an approver can re-open the latest one", async () => {
    const hist = (await h.call("GET", `/v1/bank-accounts/${bank.id}/reconciliations`, owner)).body;
    expect(hist).toHaveLength(1);
    const un = await h.call("DELETE", `/v1/bank-statement-lines/${lines[0]!.id}/match`, owner);
    expect(un.status).toBe(409);
    expect(un.body.error.message).toMatch(/finished reconciliation/);
    const denied = await h.call("POST", `/v1/reconciliations/${hist[0].id}/reopen`, { ...accountant, body: {} });
    expect(denied.status).toBe(403);
    const reopened = await h.call("POST", `/v1/reconciliations/${hist[0].id}/reopen`, { ...owner, body: {} });
    expect(reopened.body.status).toBe("draft");
    expect((await h.call("DELETE", `/v1/bank-statement-lines/${lines[0]!.id}/match`, owner)).status).toBe(204);
  });

  it("keeps another company out of the bank data", async () => {
    expect((await h.call("GET", `/v1/bank-statements/${stmtId}`, { as: ID.carol, company: B })).status).toBe(404);
    expect((await h.call("GET", `/v1/bank-accounts/${bank.id}/ledger`, { as: ID.carol, company: B })).status).toBe(404);
  });
});

describe("customer receipts", () => {
  it("records money against a booking, applies it to installments, and can be voided", async () => {
    const cust = (await h.call("POST", "/v1/parties", { ...owner, body: { name: "Receipt Customer", roles: ["customer"] } })).body;
    const bk = await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: ID.propA(4), customerId: cust.id, paymentType: "installment" } });
    expect(bk.status).toBe(201);
    expect(bk.body).toMatchObject({ customerName: "Receipt Customer" });
    expect(Number(bk.body.paidAmount)).toBe(0);
    const sch = await h.call("POST", `/v1/bookings/${bk.body.id}/schedule`, { ...owner, body: { downPayment: "100000", installments: 3, firstDue: "2026-11-01" } });
    expect(sch.status).toBe(200);

    const rec = await h.call("POST", "/v1/receipts", { ...owner, body: { bookingId: bk.body.id, amount: "150000", method: "cash", receivedOn: "2026-10-20" } });
    expect(rec.status).toBe(201);
    expect(rec.body).toMatchObject({ status: "posted", customerName: "Receipt Customer", bookingNo: bk.body.bookingNo });
    expect(Number(rec.body.allocatedAmount)).toBe(150000);
    expect(rec.body.receiptNo).toMatch(/^RCT-/);
    expect(rec.body.allocations.map((a: { seq: number }) => a.seq)).toEqual([1, 2]);

    const after = await h.call("GET", `/v1/bookings/${bk.body.id}`, owner);
    expect(Number(after.body.paidAmount)).toBe(150000);
    expect(after.body.installments[0].status).toBe("paid");

    const stmt = await h.call("GET", `/v1/parties/${cust.id}/statement`, owner);
    expect(stmt.status).toBe(200);

    expect((await h.call("POST", `/v1/receipts/${rec.body.id}/void`, { as: ID.dave, company: A, body: { reason: "mistake" } })).status).toBe(403);
    const voided = await h.call("POST", `/v1/receipts/${rec.body.id}/void`, { ...owner, body: { reason: "Entered twice by mistake" } });
    expect(voided.status).toBe(200);
    expect(voided.body.status).toBe("void");
    expect(Number((await h.call("GET", `/v1/bookings/${bk.body.id}`, owner)).body.paidAmount)).toBe(0);
  });

  it("refuses a bad amount with a plain message, and hides other companies' receipts", async () => {
    const bad = await h.call("POST", "/v1/receipts", { ...owner, body: { bookingId: ID.propA(1), amount: "0", method: "cash" } });
    expect([400, 422]).toContain(bad.status);
    const list = await h.call("GET", "/v1/receipts", { as: ID.carol, company: B });
    expect(list.body).toEqual([]);
  });
});

describe("the owner's dashboard", () => {
  it("summarises inventory, sales, dues and cash from the records, and only for what the person may see", async () => {
    const cust = (await h.call("POST", "/v1/parties", { ...owner, body: { name: "Dashboard Customer", roles: ["customer"] } })).body;
    const bk = await h.call("POST", "/v1/bookings", { ...owner, body: { propertyId: ID.propA(3), customerId: cust.id, paymentType: "installment" } });
    await h.call("POST", `/v1/bookings/${bk.body.id}/schedule`, { ...owner, body: { downPayment: "100000", installments: 3, firstDue: "2020-01-01" } });
    const codesA = await codes();
    await h.call("POST", "/v1/receipts", { ...owner, body: { bookingId: bk.body.id, amount: "100000", method: "cash", depositAccountId: codesA["03.01.01.0001"] } });

    const d = await h.call("GET", "/v1/dashboard", owner);
    expect(d.status).toBe(200);
    expect(d.body.permissions).toMatchObject({ inventory: true, sales: true, finance: true });
    expect(d.body.inventory.byStatus.length).toBeGreaterThan(0);
    expect(d.body.sales.activeBookings).toBeGreaterThanOrEqual(1);
    expect(Number(d.body.sales.overdueAmount)).toBeGreaterThan(0);       // the plan started in 2020 and only the down payment is paid
    expect(Number(d.body.sales.collections.allTime)).toBeGreaterThanOrEqual(100000);
    expect(d.body.sales.recentReceipts[0].customerName).toBeTruthy();
    expect(Number.isFinite(Number(d.body.finance.cashInHand))).toBe(true);   // net of earlier cash payments in this company

    const other = await h.call("GET", "/v1/dashboard", { as: ID.carol, company: B });
    expect(other.status).toBe(200);
    expect(other.body.sales.activeBookings).toBe(0);
    expect(Number(other.body.sales.collections.allTime)).toBe(0);
    expect((await h.call("GET", "/v1/dashboard", { as: ID.carol, company: A })).status).toBe(403);
  });
});

describe("expenses", () => {
  it("lists what was spent straight from the ledger, by account, and agrees with the profit-and-loss report", async () => {
    const codesA = await codes();
    const v = await h.call("POST", "/v1/vouchers", { ...owner, body: { type: "CPV", date: "2026-10-05", description: "Office tea", lines: [{ accountId: codesA["05.02.02.0001"], debit: "4200", remarks: "Tea and sugar" }] } });
    expect(v.status).toBe(201);
    await h.call("POST", `/v1/vouchers/${v.body.id}/submit`, owner);
    expect((await h.call("POST", `/v1/vouchers/${v.body.id}/approve`, owner)).status).toBe(200);
    const e = await h.call("GET", "/v1/expenses?from=2026-10-01&to=2026-10-31", owner);
    expect(e.status).toBe(200);
    expect(e.body.rows.some((r: { description: string; amount: string }) => r.description === "Tea and sugar" && Number(r.amount) === 4200)).toBe(true);
    expect(e.body.byAccount.length).toBeGreaterThan(0);
    const pl = await h.call("GET", "/v1/reports/income-statement?from=2026-10-01&to=2026-10-31", owner);
    expect(Number(e.body.total)).toBeCloseTo(pl.body.totalExpense, 2);
    expect((await h.call("GET", "/v1/expenses", { as: ID.carol, company: B })).body.rows).toEqual([]);
  });
});
