import type { Voucher, VoucherLine, VoucherStatus, VoucherType } from "@/lib/types";
import { dateOffset } from "./seed";
import { systemUsers } from "./system-users";

// Chart-of-accounts leaf ids this file posts against — kept as named
// constants so the mock vouchers stay readable and obviously balanced.
const CASH = "03.01.01.0001"; // Company Cash
const PETTY = "03.01.01.0004"; // Petty Cash
const HBL = "03.01.01.0002"; // HBL Current Account
const MEEZAN = "03.01.01.0003"; // Meezan Bank

const UTILITY_EXP = "05.02.01.0001";
const OFFICE_SUPPLIES_EXP = "05.02.01.0002";
const RENT_EXP = "05.02.02.0001";
const MAINTENANCE_EXP = "05.02.02.0002";
const MARKETING_EXP = "05.02.03.0001";
const TRAVEL_EXP = "05.02.03.0002";
const SALARIES_EXP = "05.02.04.0001";
const OTHER_EXP = "05.03.01.0001";

const DEALER_COMMISSION_PAYABLE = "02.01.01.0001";
const ACCRUED_EXPENSES_PAYABLE = "02.01.01.0002";
const BANK_LOAN_PAYABLE = "02.02.01.0001";

const TRADE_RECEIVABLES = "03.01.02.0001";
const STAFF_ADVANCES_RECEIVABLE = "03.01.02.0002";

const SALES_REVENUE = "04.01.01.0001";
const COMMISSION_INCOME = "04.01.02.0001";
const OTHER_INCOME = "04.02.01.0001";

function findUser(roleId: string, fallback: string) {
  return systemUsers.find((u) => u.roleId === roleId)?.name ?? fallback;
}

const ACCOUNTS_OFFICER = findUser("accounts-officer", "Accounts Officer");
const CFO = findUser("cfo-financial-controller", "Finance Controller");
const ADMINISTRATOR = findUser("administrator", "Administrator");

function twoLine(id: string, debitAccount: string, creditAccount: string, amount: number, remarks: string): VoucherLine[] {
  return [
    { id: `${id}-l1`, accountId: debitAccount, debit: amount, credit: 0, remarks, costCenter: "Head Office", project: "" },
    { id: `${id}-l2`, accountId: creditAccount, debit: 0, credit: amount, remarks, costCenter: "Head Office", project: "" },
  ];
}

interface Draft {
  id: string;
  type: VoucherType;
  seq: number;
  daysAgo: number;
  chequeDaysAgo?: number;
  partyName?: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  status: VoucherStatus;
  recurring?: boolean;
  approvalNote?: string;
}

const DRAFTS: Draft[] = [
  // ── Cash Payment Vouchers ─────────────────────────────────────────
  { id: "cpv-1", type: "CPV", seq: 38, daysAgo: 32, partyName: "K-Electric", description: "Office electricity bill — August", debitAccount: UTILITY_EXP, creditAccount: CASH, amount: 18500, status: "approved" },
  { id: "cpv-2", type: "CPV", seq: 39, daysAgo: 27, partyName: "Al-Rehman Traders", description: "Courier & stationery restock", debitAccount: OFFICE_SUPPLIES_EXP, creditAccount: PETTY, amount: 6200, status: "approved" },
  { id: "cpv-3", type: "CPV", seq: 40, daysAgo: 19, partyName: "Meta Platforms", description: "Facebook & Instagram ad spend — Al-Noor Heights campaign", debitAccount: MARKETING_EXP, creditAccount: CASH, amount: 45000, status: "approved", recurring: true },
  { id: "cpv-4", type: "CPV", seq: 41, daysAgo: 11, partyName: "Waqas Malik", description: "Dealer commission — cash settlement", debitAccount: DEALER_COMMISSION_PAYABLE, creditAccount: CASH, amount: 120000, status: "pending" },
  { id: "cpv-5", type: "CPV", seq: 42, daysAgo: 3, partyName: "Asad Rizwan", description: "Site visit fuel & travel reimbursement", debitAccount: TRAVEL_EXP, creditAccount: PETTY, amount: 8500, status: "draft" },

  // ── Cash Receipt Vouchers ─────────────────────────────────────────
  { id: "crv-1", type: "CRV", seq: 66, daysAgo: 34, partyName: "Ayesha Sheikh", description: "Booking advance received in cash", debitAccount: CASH, creditAccount: SALES_REVENUE, amount: 250000, status: "approved" },
  { id: "crv-2", type: "CRV", seq: 67, daysAgo: 25, partyName: "Hassan Malik", description: "Installment received in cash", debitAccount: CASH, creditAccount: TRADE_RECEIVABLES, amount: 85000, status: "approved" },
  { id: "crv-3", type: "CRV", seq: 68, daysAgo: 16, partyName: "Prime Realtors", description: "Referral commission received from partner agency", debitAccount: CASH, creditAccount: COMMISSION_INCOME, amount: 60000, status: "approved" },
  { id: "crv-4", type: "CRV", seq: 69, daysAgo: 9, partyName: "Bilal Cheema", description: "Staff advance recovered in cash", debitAccount: CASH, creditAccount: STAFF_ADVANCES_RECEIVABLE, amount: 15000, status: "pending" },
  { id: "crv-5", type: "CRV", seq: 70, daysAgo: 2, partyName: "Walk-in client", description: "Miscellaneous cash receipt", debitAccount: CASH, creditAccount: OTHER_INCOME, amount: 5000, status: "draft" },

  // ── Bank Payment Vouchers ─────────────────────────────────────────
  { id: "bpv-1", type: "BPV", seq: 14, daysAgo: 40, chequeDaysAgo: 37, partyName: "Al-Barkat Properties (Landlord)", description: "Office rent — August", debitAccount: RENT_EXP, creditAccount: HBL, amount: 150000, status: "approved" },
  { id: "bpv-2", type: "BPV", seq: 15, daysAgo: 30, chequeDaysAgo: 27, partyName: "CoolAir Services", description: "AC & generator maintenance contract", debitAccount: MAINTENANCE_EXP, creditAccount: HBL, amount: 22000, status: "approved" },
  { id: "bpv-3", type: "BPV", seq: 16, daysAgo: 21, chequeDaysAgo: 18, partyName: "Payroll batch #08", description: "Staff salaries — bank transfer batch", debitAccount: SALARIES_EXP, creditAccount: MEEZAN, amount: 620000, status: "approved", recurring: true },
  { id: "bpv-4", type: "BPV", seq: 17, daysAgo: 8, chequeDaysAgo: 5, partyName: "Kamran Awan", description: "Dealer commission — bank transfer", debitAccount: DEALER_COMMISSION_PAYABLE, creditAccount: MEEZAN, amount: 90000, status: "pending" },
  { id: "bpv-5", type: "BPV", seq: 18, daysAgo: 1, chequeDaysAgo: -2, partyName: "Interiors by Sana", description: "Office fit-out — vendor payment", debitAccount: OTHER_EXP, creditAccount: HBL, amount: 35000, status: "draft" },

  // ── Bank Receipt Vouchers ─────────────────────────────────────────
  { id: "brv-1", type: "BRV", seq: 21, daysAgo: 38, partyName: "Fahad Qureshi", description: "Installment deposited into HBL", debitAccount: HBL, creditAccount: TRADE_RECEIVABLES, amount: 310000, status: "approved" },
  { id: "brv-2", type: "BRV", seq: 22, daysAgo: 28, partyName: "Sana Bhatti", description: "Booking payment via bank transfer", debitAccount: MEEZAN, creditAccount: SALES_REVENUE, amount: 425000, status: "approved" },
  { id: "brv-3", type: "BRV", seq: 23, daysAgo: 17, partyName: "Skyline Marketing", description: "Commission cheque cleared", debitAccount: HBL, creditAccount: COMMISSION_INCOME, amount: 95000, status: "approved" },
  { id: "brv-4", type: "BRV", seq: 24, daysAgo: 6, partyName: "Meezan Bank", description: "Term loan disbursement received", debitAccount: MEEZAN, creditAccount: BANK_LOAN_PAYABLE, amount: 500000, status: "pending" },
  { id: "brv-5", type: "BRV", seq: 25, daysAgo: 1, partyName: "Al-Rehman Traders", description: "Refund for returned office supplies", debitAccount: HBL, creditAccount: OFFICE_SUPPLIES_EXP, amount: 4200, status: "draft" },

  // ── Journal Vouchers ──────────────────────────────────────────────
  { id: "jv-1", type: "JV", seq: 9, daysAgo: 35, description: "Reclassify staff advance to trade receivable on handover", debitAccount: TRADE_RECEIVABLES, creditAccount: STAFF_ADVANCES_RECEIVABLE, amount: 20000, status: "approved" },
  { id: "jv-2", type: "JV", seq: 10, daysAgo: 24, description: "Book accrued marketing expense not yet invoiced", debitAccount: MARKETING_EXP, creditAccount: ACCRUED_EXPENSES_PAYABLE, amount: 30000, status: "approved" },
  { id: "jv-3", type: "JV", seq: 11, daysAgo: 13, description: "Write back excess dealer commission accrual", debitAccount: DEALER_COMMISSION_PAYABLE, creditAccount: OTHER_INCOME, amount: 10000, status: "approved" },
  { id: "jv-4", type: "JV", seq: 12, daysAgo: 5, description: "Reverse duplicate marketing expense entry", debitAccount: ACCRUED_EXPENSES_PAYABLE, creditAccount: MARKETING_EXP, amount: 12000, status: "pending" },
  {
    id: "jv-5",
    type: "JV",
    seq: 13,
    daysAgo: 1,
    description: "Correct utility bill misposted to rent",
    debitAccount: UTILITY_EXP,
    creditAccount: RENT_EXP,
    amount: 5000,
    status: "rejected",
    approvalNote: "Wrong direction — the original bill was correctly posted to Utilities. Please re-check before resubmitting.",
  },
];

export const vouchers: Voucher[] = DRAFTS.map((d) => {
  const createdAt = dateOffset(-d.daysAgo - 1);
  const approver = d.type === "JV" || d.amount >= 100000 ? CFO : ADMINISTRATOR;
  const isDecided = d.status === "approved" || d.status === "rejected";

  return {
    id: d.id,
    type: d.type,
    number: `${d.type}-${String(d.seq).padStart(5, "0")}`,
    date: dateOffset(-d.daysAgo),
    chequeDate: d.chequeDaysAgo !== undefined ? dateOffset(-d.chequeDaysAgo) : undefined,
    partyName: d.partyName,
    description: d.description,
    lines: twoLine(d.id, d.debitAccount, d.creditAccount, d.amount, d.description),
    status: d.status,
    recurring: d.recurring ?? false,
    createdBy: ACCOUNTS_OFFICER,
    createdAt,
    approvedBy: isDecided ? approver : undefined,
    approvedAt: isDecided ? dateOffset(-d.daysAgo + 1) : undefined,
    approvalNote: d.approvalNote,
  };
});
