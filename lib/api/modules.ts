import { api } from "@/lib/api/client";

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

// ───────────────────────────────────────────── plan, people, roles, company profile
export interface PlanInfo {
  plan: "basic" | "moderate" | "premium";
  name: string;
  users: { used: number; invited: number; limit: number | null; included: number; extra: number };
  seatPacks: { seats: number; priceMonthlyPkr: number }[];
  customRoles: boolean;
  features: { key: string; name: string; tier: string; tierName: string; included: boolean }[];
}
export const fetchPlan = (companyId: string) => api<PlanInfo>("/v1/plan", { companyId });

export interface MemberRow { userId: string; fullName: string; email: string; roleId: string; role: string; status: "active" | "suspended" | "invited"; joinedAt: string; lastLoginAt: string | null }
export interface InviteRow { id: string; email: string; roleId: string; role: string; invitedAt: string }
export const fetchMembers = (companyId: string) => api<{ members: MemberRow[]; invites: InviteRow[] }>("/v1/members", { companyId });
export const inviteMember = (companyId: string, body: { email: string; roleId: string }) => api<{ email: string; role: string }>("/v1/invites", { method: "POST", companyId, body });
export const revokeInvite = (companyId: string, id: string) => api<void>(`/v1/invites/${id}`, { method: "DELETE", companyId });
export const updateMember = (companyId: string, userId: string, body: { roleId?: string; status?: "active" | "suspended" }) => api<{ ok: true }>(`/v1/members/${userId}`, { method: "PATCH", companyId, body });

export type Grant = { view: boolean; create: boolean; edit: boolean; delete: boolean; approve: boolean };
export interface RoleRow { id: string; name: string; description: string | null; isSystem: boolean; members: number; scope: string; permissions: Record<string, Grant> }
export const fetchRoles = (companyId: string) => api<RoleRow[]>("/v1/roles", { companyId });
export const saveRole = (companyId: string, id: string | null, body: { name: string; description?: string; scope: string; permissions: Record<string, Grant> }) =>
  id ? api<RoleRow>(`/v1/roles/${id}`, { method: "PUT", companyId, body }) : api<RoleRow>("/v1/roles", { method: "POST", companyId, body });
export const deleteRole = (companyId: string, id: string) => api<void>(`/v1/roles/${id}`, { method: "DELETE", companyId });

export interface CompanyProfile {
  id: string; name: string; shortName: string | null; ntn: string | null; strn: string | null; city: string | null; province: string | null; address: string | null;
  phone: string | null; email: string | null; currency: string; fiscalYearStart: number; marlaSqft: string | null; voucherSelfApproval: boolean; penaltyRatePctMonth: string; penaltyGraceDays: number;
}
export const fetchCompanyProfile = (companyId: string) => api<CompanyProfile>("/v1/company", { companyId });
export const saveCompanyProfile = (companyId: string, body: Partial<Omit<CompanyProfile, "id" | "currency" | "fiscalYearStart" | "marlaSqft" | "penaltyRatePctMonth" | "penaltyGraceDays">> & { marlaSqft?: number; penaltyRatePctMonth?: number; penaltyGraceDays?: number }) =>
  api<CompanyProfile>("/v1/company", { method: "PATCH", companyId, body });

// ───────────────────────────────────────────── leads and quotations
export type LeadStage = "new" | "contacted" | "site_visit" | "negotiation" | "won" | "lost";
export interface LeadRow {
  id: string; leadNo: string; name: string; phone: string | null; email: string | null; city: string | null; source: string; stage: LeadStage;
  interestProjectId: string | null; interestProject: string | null; interestType: string | null; budgetMin: string | null; budgetMax: string | null;
  assignedTo: string | null; assignedToName: string | null; dealerName: string | null; nextFollowup: string | null; notes: string | null; lostReason: string | null;
  partyId: string | null; createdAt: string;
}
export interface LeadDetail extends LeadRow { activities: { id: string; kind: string; note: string | null; at: string; by: string | null }[] }
export const listLeads = (companyId: string, f: { stage?: LeadStage; search?: string } = {}) => api<LeadRow[]>(`/v1/leads${qs(f)}`, { companyId });
export const getLead = (companyId: string, id: string) => api<LeadDetail>(`/v1/leads/${id}`, { companyId });
export const createLead = (companyId: string, body: Record<string, unknown>) => api<LeadDetail>("/v1/leads", { method: "POST", companyId, body });
export const setLeadStage = (companyId: string, id: string, stage: string, reason?: string) => api<LeadDetail>(`/v1/leads/${id}/stage`, { method: "POST", companyId, body: { stage, reason } });
export const addLeadActivity = (companyId: string, id: string, body: { kind: string; note: string; nextFollowup?: string }) => api<LeadDetail>(`/v1/leads/${id}/activities`, { method: "POST", companyId, body });
export const convertLead = (companyId: string, id: string) => api<LeadDetail>(`/v1/leads/${id}/convert`, { method: "POST", companyId, body: {} });

export interface QuotationRow {
  id: string; quoteNo: string; leadId: string | null; leadName: string | null; partyId: string | null; customerName: string | null; propertyId: string; propertyCode: string; propertyTitle: string;
  projectName: string | null; quoteDate: string; validUntil: string; listPrice: string; discount: string; netPrice: string; downPayment: string; installments: number;
  intervalMonths: number; firstDue: string | null; status: "draft" | "sent" | "accepted" | "rejected"; bookingId: string | null; notes: string | null; expired: boolean;
}
export const listQuotations = (companyId: string, f: { status?: string; search?: string } = {}) => api<QuotationRow[]>(`/v1/quotations${qs(f)}`, { companyId });
export const createQuotation = (companyId: string, body: Record<string, unknown>) => api<QuotationRow>("/v1/quotations", { method: "POST", companyId, body });
export const setQuotationStatus = (companyId: string, id: string, to: "sent" | "rejected") => api<QuotationRow>(`/v1/quotations/${id}/status`, { method: "POST", companyId, body: { to } });
export const acceptQuotation = (companyId: string, id: string) => api<QuotationRow>(`/v1/quotations/${id}/accept`, { method: "POST", companyId, body: {} });

// ───────────────────────────────────────────── cheques, service invoices, contracts
export type ChequeStatus = "in_hand" | "deposited" | "cleared" | "bounced" | "returned" | "cancelled";
export interface ChequeRow {
  id: string; direction: "received" | "issued"; chequeNo: string; bankName: string; partyId: string; partyName: string; bookingId: string | null; bookingNo: string | null;
  amount: string; chequeDate: string; receivedOn: string; status: ChequeStatus; depositBank: string | null; depositAccountNo: string | null; depositedOn: string | null;
  clearedOn: string | null; bouncedOn: string | null; bounceReason: string | null; receiptId: string | null; notes: string | null;
}
export const listCheques = (companyId: string, f: { direction?: string; status?: string; search?: string } = {}) => api<ChequeRow[]>(`/v1/cheques${qs(f)}`, { companyId });
export const createCheque = (companyId: string, body: Record<string, unknown>) => api<ChequeRow>("/v1/cheques", { method: "POST", companyId, body });
export const chequeAction = (companyId: string, id: string, action: "deposit" | "clear" | "bounce" | "return", body: Record<string, unknown> = {}) =>
  api<ChequeRow>(`/v1/cheques/${id}/${action}`, { method: "POST", companyId, body });

export interface ServiceInvoiceRow {
  id: string; number: string; customerId: string; customerName: string; propertyId: string | null; propertyCode: string | null; propertyTitle: string | null; periodLabel: string | null;
  issueDate: string; dueDate: string; amount: string; paidAmount: string; balance: string; status: "unpaid" | "partial" | "paid" | "void"; description: string | null; overdue: boolean;
}
export const listServiceInvoices = (companyId: string, f: { status?: string; search?: string } = {}) => api<ServiceInvoiceRow[]>(`/v1/service-invoices${qs(f)}`, { companyId });
export const createServiceInvoice = (companyId: string, body: Record<string, unknown>) => api<ServiceInvoiceRow>("/v1/service-invoices", { method: "POST", companyId, body });
export const payServiceInvoice = (companyId: string, id: string, body: Record<string, unknown>) => api<ServiceInvoiceRow>(`/v1/service-invoices/${id}/payments`, { method: "POST", companyId, body });
export const voidServiceInvoice = (companyId: string, id: string, reason: string) => api<ServiceInvoiceRow>(`/v1/service-invoices/${id}/void`, { method: "POST", companyId, body: { reason } });

export type ContractKind = "sale_agreement" | "rent" | "service" | "construction" | "employment" | "other";
export interface ContractRow {
  id: string; contractNo: string; kind: ContractKind; title: string; partyId: string | null; partyName: string | null; bookingNo: string | null; propertyCode: string | null;
  startDate: string; endDate: string | null; value: string; status: "draft" | "active" | "terminated"; effectiveStatus: "draft" | "active" | "terminated" | "expired";
  daysLeft: number | null; signedOn: string | null; terms: string | null; terminatedOn: string | null; terminationReason: string | null;
}
export const listContracts = (companyId: string, f: { kind?: string; search?: string } = {}) => api<ContractRow[]>(`/v1/contracts${qs(f)}`, { companyId });
export const createContract = (companyId: string, body: Record<string, unknown>) => api<ContractRow>("/v1/contracts", { method: "POST", companyId, body });
export const contractAction = (companyId: string, id: string, action: "sign" | "terminate", body: Record<string, unknown> = {}) => api<ContractRow>(`/v1/contracts/${id}/${action}`, { method: "POST", companyId, body });

// ───────────────────────────────────────────── staff, leave, payroll
export interface EmployeeRow {
  id: string; empNo: string; fullName: string; phone: string | null; email: string | null; designation: string | null; department: string | null; joinDate: string;
  status: "active" | "resigned" | "terminated"; leftOn: string | null; basicSalary: string; houseAllowance: string; transportAllowance: string; otherAllowance: string;
  incomeTax: string; bankAccountNo: string | null; grossSalary: string; notes: string | null;
}
export const listEmployees = (companyId: string, f: { status?: string; search?: string } = {}) => api<EmployeeRow[]>(`/v1/employees${qs(f)}`, { companyId });
export const createEmployee = (companyId: string, body: Record<string, unknown>) => api<EmployeeRow>("/v1/employees", { method: "POST", companyId, body });
export const updateEmployee = (companyId: string, id: string, body: Record<string, unknown>) => api<EmployeeRow>(`/v1/employees/${id}`, { method: "PATCH", companyId, body });

export interface LeaveTypeRow { id: string; code: string; name: string; annualDays: string; paid: boolean }
export interface LeaveBalanceRow { employeeId: string; fullName: string; leaveTypeId: string; code: string; leaveType: string; paid: boolean; year: number; entitled: string; taken: string; pending: string; remaining: string | null }
export interface LeaveRequestRow {
  id: string; employeeId: string; employeeName: string; designation: string | null; leaveTypeId: string; leaveType: string; paid: boolean; fromDate: string; toDate: string; days: string;
  reason: string | null; status: "pending" | "approved" | "rejected" | "cancelled"; decidedBy: string | null; decisionNote: string | null;
}
export const fetchLeaveTypes = (companyId: string) => api<LeaveTypeRow[]>("/v1/leave/types", { companyId });
export const fetchLeaveBalances = (companyId: string) => api<LeaveBalanceRow[]>("/v1/leave/balances", { companyId });
export const listLeaveRequests = (companyId: string, f: { status?: string } = {}) => api<LeaveRequestRow[]>(`/v1/leave/requests${qs(f)}`, { companyId });
export const requestLeave = (companyId: string, body: Record<string, unknown>) => api<LeaveRequestRow>("/v1/leave/requests", { method: "POST", companyId, body });
export const decideLeave = (companyId: string, id: string, approve: boolean, note?: string) => api<LeaveRequestRow>(`/v1/leave/requests/${id}/decide`, { method: "POST", companyId, body: { approve, note } });
export const cancelLeave = (companyId: string, id: string) => api<LeaveRequestRow>(`/v1/leave/requests/${id}/cancel`, { method: "POST", companyId, body: {} });

export interface PayrollRunRow { id: string; runNo: string; month: string; status: "draft" | "approved" | "paid"; totalGross: string; totalTax: string; totalNet: string; paidOn: string | null; employees?: number }
export interface PayrollLineRow { id: string; employeeId: string; fullName: string; empNo: string; designation: string | null; basic: string; allowances: string; bonus: string; unpaidLeaveDays: string; unpaidDeduction: string; tax: string; net: string }
export interface PayrollDetail extends PayrollRunRow { lines: PayrollLineRow[] }
export const listPayroll = (companyId: string) => api<PayrollRunRow[]>("/v1/payroll", { companyId });
export const getPayroll = (companyId: string, id: string) => api<PayrollDetail>(`/v1/payroll/${id}`, { companyId });
export const createPayroll = (companyId: string, month: string) => api<PayrollDetail>("/v1/payroll", { method: "POST", companyId, body: { month } });
export const editPayrollLine = (companyId: string, runId: string, lineId: string, body: { bonus?: string; tax?: string }) => api<PayrollDetail>(`/v1/payroll/${runId}/lines/${lineId}`, { method: "PATCH", companyId, body });
export const payrollAction = (companyId: string, id: string, action: "approve" | "pay", body: Record<string, unknown> = {}) => api<PayrollDetail>(`/v1/payroll/${id}/${action}`, { method: "POST", companyId, body });
export const discardPayroll = (companyId: string, id: string) => api<void>(`/v1/payroll/${id}`, { method: "DELETE", companyId });

// ───────────────────────────────────────────── contractors
export interface ContractorRow { id: string; name: string; phone: string | null; city: string | null; contractValue: string; activeContracts: number; billed: string; retentionHeld: string; owed: string }
export interface ConstructionBill { id: string; billNo: string; contractId: string; billDate: string; description: string | null; grossAmount: string; retentionAmount: string; netAmount: string; status: "draft" | "approved" | "void" }
export interface ConstructionContract {
  id: string; contractNo: string; contractorId: string; contractorName: string; projectId: string; projectName: string; title: string; scope: string | null; contractValue: string;
  retentionPct: string; startDate: string; endDate: string | null; status: "active" | "completed" | "terminated"; billed: string; retentionHeld: string; billedNet: string; remaining: string;
  bills?: ConstructionBill[];
}
export const listContractors = (companyId: string) => api<ContractorRow[]>("/v1/contractors", { companyId });
export const listConstructionContracts = (companyId: string, f: { projectId?: string; contractorId?: string } = {}) => api<ConstructionContract[]>(`/v1/construction/contracts${qs(f)}`, { companyId });
export const getConstructionContract = (companyId: string, id: string) => api<ConstructionContract>(`/v1/construction/contracts/${id}`, { companyId });
export const createConstructionContract = (companyId: string, body: Record<string, unknown>) => api<ConstructionContract>("/v1/construction/contracts", { method: "POST", companyId, body });
export const closeConstructionContract = (companyId: string, id: string, status: "completed" | "terminated") => api<ConstructionContract>(`/v1/construction/contracts/${id}/close`, { method: "POST", companyId, body: { status } });
export const createContractorBill = (companyId: string, contractId: string, body: Record<string, unknown>) => api<ConstructionContract>(`/v1/construction/contracts/${contractId}/bills`, { method: "POST", companyId, body });
export const contractorBillAction = (companyId: string, id: string, action: "approve" | "void", body: Record<string, unknown> = {}) => api<ConstructionContract>(`/v1/construction/bills/${id}/${action}`, { method: "POST", companyId, body });

// ───────────────────────────────────────────── budgets
export interface BudgetRow {
  id: string; budgetNo: string; name: string; kind: "project" | "operating" | "capex"; projectId: string | null; projectName: string | null; periodStart: string | null; periodEnd: string | null;
  status: "draft" | "submitted" | "approved" | "locked" | "closed"; controlMode: "none" | "warn" | "block"; versionNo: number; totalAmount: string; committed: string; actual: string;
}
export interface BudgetLine { id: string; lineNo: number; category: string; description: string | null; accountId: string; accountCode: string; accountName: string; budgetAmount: string; committed: string; actual: string; available: string; utilizationPct: string | null }
export interface BudgetRevision { id: string; revisionNo: number; type: string; reason: string; deltaAmount: string; status: "pending" | "approved" | "rejected"; lines: { budgetLineId: string; category: string; deltaAmount: string }[] }
export interface BudgetDetail extends BudgetRow { lines: BudgetLine[]; revisions: BudgetRevision[] }
export const listBudgets = (companyId: string) => api<BudgetRow[]>("/v1/budgets", { companyId });
export const getBudget = (companyId: string, id: string) => api<BudgetDetail>(`/v1/budgets/${id}`, { companyId });
export const createBudget = (companyId: string, body: Record<string, unknown>) => api<BudgetDetail>("/v1/budgets", { method: "POST", companyId, body });
export const saveBudgetLines = (companyId: string, id: string, lines: { category: string; accountId: string; amount: string; description?: string }[], controlMode?: string) =>
  api<BudgetDetail>(`/v1/budgets/${id}/lines`, { method: "PUT", companyId, body: { lines, controlMode } });
export const budgetAction = (companyId: string, id: string, action: "submit" | "recall" | "approve" | "lock" | "unlock" | "close") => api<BudgetDetail>(`/v1/budgets/${id}/${action}`, { method: "POST", companyId, body: {} });
export const setBudgetControl = (companyId: string, id: string, controlMode: string) => api<BudgetDetail>(`/v1/budgets/${id}`, { method: "PATCH", companyId, body: { controlMode } });
export const requestBudgetRevision = (companyId: string, id: string, body: Record<string, unknown>) => api<BudgetDetail>(`/v1/budgets/${id}/revisions`, { method: "POST", companyId, body });
export const decideBudgetRevision = (companyId: string, id: string, action: "approve" | "reject") => api<BudgetDetail>(`/v1/budget-revisions/${id}/${action}`, { method: "POST", companyId, body: {} });
