import { api } from "@/lib/api/client";

/**
 * The live finance API: chart of accounts, parties, banks, vouchers, bank reconciliation and reports.
 * Amounts arrive as strings ("60000.00") so nothing is ever rounded by a float; use `num()` only to display or add up.
 */
export const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v));

// ───────────────────────────────────────────── chart of accounts
export type AccountClass = "asset" | "liability" | "equity" | "income" | "expense";

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  class: AccountClass;
  category: string;
  parentId: string | null;
  isGroup: boolean;
  isSystem: boolean;
  requiresParty: boolean;
  active: boolean;
  bankAccountId: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
}

export const listAccounts = (companyId: string) => api<ChartAccount[]>("/v1/accounts", { companyId });
export const createAccount = (companyId: string, body: { parentId: string; name: string; isGroup?: boolean; requiresParty?: boolean }) =>
  api<ChartAccount>("/v1/accounts", { method: "POST", companyId, body });
export const updateAccount = (companyId: string, id: string, body: { name?: string; active?: boolean }) =>
  api<ChartAccount>(`/v1/accounts/${id}`, { method: "PATCH", companyId, body });

export interface LedgerLine {
  date: string;
  number: string;
  entryId: string;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  memo: string | null;
  partyId: string | null;
  partyName: string | null;
  debit: string;
  credit: string;
  balance: string;
}
export interface AccountLedger {
  account: ChartAccount;
  from: string;
  to: string;
  openingBalance: string;
  lines: LedgerLine[];
}
export const accountLedger = (companyId: string, id: string, from: string, to: string) =>
  api<AccountLedger>(`/v1/accounts/${id}/ledger?from=${from}&to=${to}`, { companyId });

// ───────────────────────────────────────────── banks
export type BankKind = "public" | "private" | "islamic" | "foreign" | "microfinance" | "digital";
export interface BankCatalogEntry {
  id: string;
  name: string;
  shortName: string;
  kind: BankKind;
}
export interface BankAccountRow {
  id: string;
  bankId: string | null;
  bankName: string;
  bankShortName: string | null;
  branchName: string | null;
  branchCode: string | null;
  accountTitle: string;
  accountNo: string;
  iban: string | null;
  currency: string;
  active: boolean;
  glAccountId: string;
  glCode: string;
  bookBalance: string;
  unclearedCount: number;
  lastReconciledOn: string | null;
  openReconciliationId: string | null;
}
export const listBanks = (companyId: string) => api<BankCatalogEntry[]>("/v1/banks", { companyId });
export const listBankAccounts = (companyId: string) => api<BankAccountRow[]>("/v1/bank-accounts", { companyId });
export const createBankAccount = (
  companyId: string,
  body: { bankId?: string; bankName?: string; branchName?: string; branchCode?: string; accountTitle: string; accountNo: string; iban?: string },
) => api<BankAccountRow>("/v1/bank-accounts", { method: "POST", companyId, body });

// ───────────────────────────────────────────── parties
export type PartyRole = "customer" | "vendor" | "contractor" | "dealer" | "employee" | "lead" | "investor" | "landowner";
export interface PartyRow {
  id: string;
  name: string;
  legalName: string | null;
  kind: "person" | "organization";
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  ntn: string | null;
  cnicLast4: string | null;
  notes: string | null;
  createdAt: string;
  roles: PartyRole[];
  /** What they owe us (positive) or what we owe them (negative). */
  balance: string;
}
export const listParties = (companyId: string, role?: PartyRole, search?: string) =>
  api<PartyRow[]>(`/v1/parties?limit=200${role ? `&role=${role}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`, { companyId });
export interface NewPartyInput {
  name: string;
  roles: PartyRole[];
  kind?: "person" | "organization";
  cnic?: string;
  ntn?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
}
export const createParty = (companyId: string, body: NewPartyInput) => api<PartyRow>("/v1/parties", { method: "POST", companyId, body });
export interface PartyStatement {
  party: PartyRow;
  from: string;
  to: string;
  openingBalance: string;
  lines: { date: string; number: string; sourceType: string; sourceId: string | null; accountCode: string; accountName: string; description: string | null; debit: string; credit: string; balance: string }[];
}
export const partyStatement = (companyId: string, id: string, from = "2000-01-01", to = "2999-12-31") =>
  api<PartyStatement>(`/v1/parties/${id}/statement?from=${from}&to=${to}`, { companyId });

// ───────────────────────────────────────────── vouchers
export type VoucherType = "CPV" | "CRV" | "BPV" | "BRV" | "JV" | "CV" | "SV" | "PIV" | "CN" | "DN";
export type VoucherStatus = "draft" | "pending" | "approved" | "rejected" | "void";
export type InstrumentType = "cheque" | "online_transfer" | "pay_order" | "demand_draft" | "cash_deposit" | "other";

export interface VoucherRow {
  id: string;
  type: VoucherType;
  number: string;
  date: string;
  status: VoucherStatus;
  description: string | null;
  partyId: string | null;
  partyName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  total: string;
  lineCount: number;
  instrumentType: InstrumentType | null;
  instrumentNo: string | null;
  instrumentBank: string | null;
  chequeDate: string | null;
  reference: string | null;
  invoiceNo: string | null;
  dueDate: string | null;
  createdAt: string;
  createdBy: string | null;
  journalEntryId: string | null;
}
export interface VoucherLineRow {
  id: string;
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  partyId: string | null;
  partyName: string | null;
  projectId: string | null;
  costCenterId: string | null;
  remarks: string | null;
}
export interface VoucherDetail extends VoucherRow {
  controlAccountId: string | null;
  controlAccountCode: string | null;
  controlAccountName: string | null;
  bankAccountId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  lines: VoucherLineRow[];
  journal: { lineNo: number; accountCode: string; accountName: string; debit: string; credit: string; partyName: string | null; memo: string | null }[];
  nextSteps: { to: string; requiredPermission: string | null; description: string | null }[];
}
export interface VoucherInput {
  date: string;
  description?: string | null;
  partyId?: string | null;
  controlAccountId?: string | null;
  bankAccountId?: string | null;
  instrumentType?: InstrumentType | null;
  instrumentNo?: string | null;
  instrumentBank?: string | null;
  chequeDate?: string | null;
  reference?: string | null;
  invoiceNo?: string | null;
  dueDate?: string | null;
  lines: { accountId: string; debit?: string | number; credit?: string | number; partyId?: string | null; projectId?: string | null; remarks?: string | null }[];
}

export interface VoucherFilters {
  type?: VoucherType;
  status?: VoucherStatus;
  search?: string;
  from?: string;
  to?: string;
  partyId?: string;
}
export function listVouchers(companyId: string, f: VoucherFilters = {}) {
  const qs = new URLSearchParams({ limit: "200" });
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, String(v));
  return api<VoucherRow[]>(`/v1/vouchers?${qs}`, { companyId });
}
export const getVoucher = (companyId: string, id: string) => api<VoucherDetail>(`/v1/vouchers/${id}`, { companyId });
export const createVoucher = (companyId: string, type: VoucherType, input: VoucherInput) =>
  api<VoucherDetail>("/v1/vouchers", { method: "POST", companyId, body: { type, ...input } });
export const updateVoucher = (companyId: string, id: string, input: VoucherInput) => api<VoucherDetail>(`/v1/vouchers/${id}`, { method: "PUT", companyId, body: input });
export const voucherAction = (companyId: string, id: string, action: "submit" | "recall" | "approve" | "reject" | "void", body?: object) =>
  api<VoucherDetail>(`/v1/vouchers/${id}/${action}`, { method: "POST", companyId, body: body ?? {} });
export const discardVoucher = (companyId: string, id: string) => api<void>(`/v1/vouchers/${id}`, { method: "DELETE", companyId });

// ───────────────────────────────────────────── bank statements & reconciliation
export interface LedgerItem {
  journalLineId: string;
  entryId: string;
  date: string;
  number: string;
  description: string | null;
  partyName: string | null;
  debit: string;
  credit: string;
  amount: string;
  cleared: boolean;
  clearedOn: string | null;
  statementLineId: string | null;
  reconciliationId: string | null;
  wasReversed: boolean;
  isReversal: boolean;
}
export interface StatementSummary {
  id: string;
  label: string | null;
  periodFrom: string;
  periodTo: string;
  openingBalance: string;
  closingBalance: string;
  source: string;
  createdAt: string;
  lineCount: number;
  matchedCount: number;
}
export interface StatementLine {
  id: string;
  statementId: string;
  lineNo: number;
  date: string;
  description: string | null;
  reference: string | null;
  deposit: string;
  withdrawal: string;
  balance: string | null;
  amount: string;
  matchedAmount: string;
  matchStatus: "unmatched" | "partial" | "matched";
}
export interface StatementDetail {
  id: string;
  bankAccountId: string;
  label: string | null;
  periodFrom: string;
  periodTo: string;
  openingBalance: string;
  closingBalance: string;
  source: string;
  lines: StatementLine[];
  linesAddUp: boolean;
}
export interface NewStatementInput {
  label?: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: string | number;
  closingBalance: string | number;
  source?: "manual" | "csv" | "pdf";
  lines: { date: string; description?: string; reference?: string; deposit?: string | number; withdrawal?: string | number; balance?: string | number }[];
}
export interface ReconciliationReport {
  statementBalance: string;
  depositsInTransit: string;
  outstandingPayments: string;
  adjustedBankBalance: string;
  bookBalance: string;
  clearedBalance: string;
  difference: string;
}
export interface Reconciliation {
  id: string;
  bankAccountId: string;
  statementId: string | null;
  asOf: string;
  statementBalance: string;
  status: "draft" | "finalized";
  difference: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  report: ReconciliationReport;
  items: LedgerItem[];
  outstandingDeposits: LedgerItem[];
  outstandingChequesAndPayments: LedgerItem[];
  canFinish: boolean;
}
export interface Suggestion {
  statementLineId: string;
  journalLineId: string;
  score: number;
  reason: string;
}

export const bankLedger = (companyId: string, bankAccountId: string, opts: { uncleared?: boolean; to?: string } = {}) =>
  api<LedgerItem[]>(`/v1/bank-accounts/${bankAccountId}/ledger?${opts.uncleared ? "uncleared=1&" : ""}${opts.to ? `to=${opts.to}` : ""}`, { companyId });
export const listStatements = (companyId: string, bankAccountId: string) => api<StatementSummary[]>(`/v1/bank-accounts/${bankAccountId}/statements`, { companyId });
export const createStatement = (companyId: string, bankAccountId: string, body: NewStatementInput) =>
  api<{ id: string; linesAddUp: boolean; computedClosing: string }>(`/v1/bank-accounts/${bankAccountId}/statements`, { method: "POST", companyId, body });
export const getStatement = (companyId: string, id: string) => api<StatementDetail>(`/v1/bank-statements/${id}`, { companyId });
export const deleteStatement = (companyId: string, id: string) => api<void>(`/v1/bank-statements/${id}`, { method: "DELETE", companyId });
export const statementSuggestions = (companyId: string, id: string) => api<Suggestion[]>(`/v1/bank-statements/${id}/suggestions`, { companyId });
export const matchLine = (companyId: string, lineId: string, journalLineIds: string[]) =>
  api<StatementLine>(`/v1/bank-statement-lines/${lineId}/match`, { method: "POST", companyId, body: { journalLineIds } });
export const unmatchLine = (companyId: string, lineId: string) => api<void>(`/v1/bank-statement-lines/${lineId}/match`, { method: "DELETE", companyId });
export const draftVoucherFromLine = (companyId: string, lineId: string, accountId: string) =>
  api<{ id: string; type: VoucherType; number: string; status: VoucherStatus }>(`/v1/bank-statement-lines/${lineId}/draft-voucher`, { method: "POST", companyId, body: { accountId } });
export const clearLedgerLine = (companyId: string, journalLineId: string, clearedOn: string) =>
  api<void>(`/v1/ledger-lines/${journalLineId}/clear`, { method: "POST", companyId, body: { clearedOn } });
export const unclearLedgerLine = (companyId: string, journalLineId: string) => api<void>(`/v1/ledger-lines/${journalLineId}/clear`, { method: "DELETE", companyId });
export const listReconciliations = (companyId: string, bankAccountId: string) =>
  api<{ id: string; asOf: string; statementBalance: string; status: "draft" | "finalized"; difference: string | null; finalizedAt: string | null; finalizedBy: string | null; statementId: string | null }[]>(
    `/v1/bank-accounts/${bankAccountId}/reconciliations`,
    { companyId },
  );
export const startReconciliation = (companyId: string, bankAccountId: string, body: { statementId?: string | null; asOf: string; statementBalance: string | number }) =>
  api<Reconciliation>(`/v1/bank-accounts/${bankAccountId}/reconciliations`, { method: "POST", companyId, body });
export const getReconciliation = (companyId: string, id: string) => api<Reconciliation>(`/v1/reconciliations/${id}`, { companyId });
export const updateReconciliation = (companyId: string, id: string, body: { asOf?: string; statementBalance?: string | number }) =>
  api<Reconciliation>(`/v1/reconciliations/${id}`, { method: "PATCH", companyId, body });
export const finalizeReconciliation = (companyId: string, id: string) => api<Reconciliation>(`/v1/reconciliations/${id}/finalize`, { method: "POST", companyId, body: {} });
export const reopenReconciliation = (companyId: string, id: string) => api<Reconciliation>(`/v1/reconciliations/${id}/reopen`, { method: "POST", companyId, body: {} });
export const deleteReconciliation = (companyId: string, id: string) => api<void>(`/v1/reconciliations/${id}`, { method: "DELETE", companyId });

// ───────────────────────────────────────────── reports
export interface ReportRow {
  id: string;
  code: string;
  name: string;
  class: AccountClass;
  isGroup: boolean;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}
export interface TrialBalance {
  from: string;
  to: string;
  rows: ReportRow[];
  totals: { debit: number; credit: number; closing: number };
}
export interface IncomeStatement {
  from: string;
  to: string;
  income: { code: string; name: string; level: number; isGroup: boolean; amount: number }[];
  expenses: { code: string; name: string; level: number; isGroup: boolean; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
}
export interface BalanceSheet {
  asOf: string;
  assets: { code: string; name: string; level: number; amount: number }[];
  liabilities: { code: string; name: string; level: number; amount: number }[];
  equity: { code: string; name: string; level: number; amount: number }[];
  profitToDate: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
}
export const trialBalance = (companyId: string, from: string, to: string) => api<TrialBalance>(`/v1/reports/trial-balance?from=${from}&to=${to}`, { companyId });
export const incomeStatement = (companyId: string, from: string, to: string) => api<IncomeStatement>(`/v1/reports/income-statement?from=${from}&to=${to}`, { companyId });
export const balanceSheet = (companyId: string, asOf: string) => api<BalanceSheet>(`/v1/reports/balance-sheet?asOf=${asOf}`, { companyId });

// ───────────────────────────────────────────── expenses (postings on expense accounts)
export interface ExpenseRow {
  id: string;
  date: string;
  number: string;
  sourceType: string;
  sourceId: string | null;
  accountId: string;
  accountCode: string;
  accountName: string;
  partyId: string | null;
  partyName: string | null;
  description: string | null;
  amount: string;
}
export interface ExpenseReport {
  rows: ExpenseRow[];
  byAccount: { accountId: string; accountCode: string; accountName: string; amount: string }[];
  total: string;
}
export const listExpenses = (companyId: string, f: { from: string; to: string; search?: string; accountId?: string }) => {
  const qs = new URLSearchParams({ from: f.from, to: f.to });
  if (f.search) qs.set("search", f.search);
  if (f.accountId) qs.set("accountId", f.accountId);
  return api<ExpenseReport>(`/v1/expenses?${qs}`, { companyId });
};
