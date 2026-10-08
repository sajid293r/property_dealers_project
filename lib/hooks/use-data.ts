"use client";

import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/lib/providers/company-provider";
import {
  unitsService,
  customersService,
  dealsService,
  leadsService,
  staffService,
  accountsService,
  expensesService,
  contractsService,
  rolesService,
  systemUsersService,
  vouchersService,
  quotationsService,
  salesInvoicesService,
  postDatedChequesService,
  serviceInvoicesService,
  payrollAdjustmentsService,
  leaveRequestsService,
  projectsService,
  contractorsService,
  constructionContractsService,
  budgetsService,
} from "@/lib/services";

/**
 * Reads a collection for the active company. Each company has its own query
 * cache (see QueryProvider), so the key stays a plain collection name.
 */
function useCompanyQuery<T>(key: string, fetcher: (companyId: string) => Promise<T>) {
  const { company } = useCompany();
  return useQuery({ queryKey: [key], queryFn: () => fetcher(company.id) });
}

export const useUnits = () => useCompanyQuery("units", unitsService.list);
export const useCustomers = () => useCompanyQuery("customers", customersService.list);
export const useDeals = () => useCompanyQuery("deals", dealsService.list);
export const useLeads = () => useCompanyQuery("leads", leadsService.list);
export const useStaff = () => useCompanyQuery("staff", staffService.list);
export const useAccounts = () => useCompanyQuery("accounts", accountsService.list);
export const useTransactions = () => useCompanyQuery("transactions", accountsService.transactions);
export const useExpenses = () => useCompanyQuery("expenses", expensesService.list);
export const useContracts = () => useCompanyQuery("contracts", contractsService.list);
export const useRoles = () => useCompanyQuery("roles", rolesService.list);
export const useSystemUsers = () => useCompanyQuery("systemUsers", systemUsersService.list);
export const useVouchers = () => useCompanyQuery("vouchers", vouchersService.list);
export const useQuotations = () => useCompanyQuery("quotations", quotationsService.list);
export const useSalesInvoices = () => useCompanyQuery("salesInvoices", salesInvoicesService.list);
export const usePostDatedCheques = () => useCompanyQuery("postDatedCheques", postDatedChequesService.list);
export const useServiceInvoices = () => useCompanyQuery("serviceInvoices", serviceInvoicesService.list);
export const usePayrollAdjustments = () => useCompanyQuery("payrollAdjustments", payrollAdjustmentsService.list);
export const useLeaveRequests = () => useCompanyQuery("leaveRequests", leaveRequestsService.list);
export const useProjects = () => useCompanyQuery("projects", projectsService.list);
export const useContractors = () => useCompanyQuery("contractors", contractorsService.list);
export const useConstructionContracts = () => useCompanyQuery("constructionContracts", constructionContractsService.list);
export const useBudgets = () => useCompanyQuery("budgets", budgetsService.list);
export const useBudgetLines = () => useCompanyQuery("budgetLines", budgetsService.lines);
