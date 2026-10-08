import { getDataset } from "@/lib/mock-data/company-data";

// Simulated latency so loading/skeleton states feel real even with mock data.
// This is the seam where real fetch()/server-action calls replace the in-memory reads.
// Every service takes the active company id: data is always read per company.
function withLatency<T>(data: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export const unitsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).units),
};

export const customersService = {
  list: (companyId: string) => withLatency(getDataset(companyId).customers),
};

export const dealsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).deals),
};

export const leadsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).leads),
};

export const staffService = {
  list: (companyId: string) => withLatency(getDataset(companyId).staff),
};

export const expensesService = {
  list: (companyId: string) => withLatency(getDataset(companyId).expenses),
};

export const contractsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).contracts),
};

export const rolesService = {
  list: (companyId: string) => withLatency(getDataset(companyId).roles),
};

export const systemUsersService = {
  list: (companyId: string) => withLatency(getDataset(companyId).systemUsers),
};

export const vouchersService = {
  list: (companyId: string) => withLatency(getDataset(companyId).vouchers),
};

export const quotationsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).quotations),
};

export const salesInvoicesService = {
  list: (companyId: string) => withLatency(getDataset(companyId).salesInvoices),
};

export const postDatedChequesService = {
  list: (companyId: string) => withLatency(getDataset(companyId).postDatedCheques),
};

export const serviceInvoicesService = {
  list: (companyId: string) => withLatency(getDataset(companyId).serviceInvoices),
};

export const payrollAdjustmentsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).payrollAdjustments),
};

export const leaveRequestsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).leaveRequests),
};

export const projectsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).projects),
};

export const contractorsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).contractors),
};

export const constructionContractsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).constructionContracts),
};

export const accountsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).accounts),
  transactions: (companyId: string) => withLatency(getDataset(companyId).transactions),
};

export const budgetsService = {
  list: (companyId: string) => withLatency(getDataset(companyId).budgets),
  lines: (companyId: string) => withLatency(getDataset(companyId).budgetLines),
};
