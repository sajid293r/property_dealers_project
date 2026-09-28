"use client";

import { useQuery } from "@tanstack/react-query";
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
} from "@/lib/services";

export const useUnits = () => useQuery({ queryKey: ["units"], queryFn: unitsService.list });
export const useCustomers = () => useQuery({ queryKey: ["customers"], queryFn: customersService.list });
export const useDeals = () => useQuery({ queryKey: ["deals"], queryFn: dealsService.list });
export const useLeads = () => useQuery({ queryKey: ["leads"], queryFn: leadsService.list });
export const useStaff = () => useQuery({ queryKey: ["staff"], queryFn: staffService.list });
export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: accountsService.list });
export const useTransactions = () =>
  useQuery({ queryKey: ["transactions"], queryFn: accountsService.transactions });
export const useExpenses = () => useQuery({ queryKey: ["expenses"], queryFn: expensesService.list });
export const useContracts = () => useQuery({ queryKey: ["contracts"], queryFn: contractsService.list });
export const useRoles = () => useQuery({ queryKey: ["roles"], queryFn: rolesService.list });
export const useSystemUsers = () => useQuery({ queryKey: ["systemUsers"], queryFn: systemUsersService.list });
export const useVouchers = () => useQuery({ queryKey: ["vouchers"], queryFn: vouchersService.list });
export const useQuotations = () => useQuery({ queryKey: ["quotations"], queryFn: quotationsService.list });
export const useSalesInvoices = () => useQuery({ queryKey: ["salesInvoices"], queryFn: salesInvoicesService.list });
export const usePostDatedCheques = () =>
  useQuery({ queryKey: ["postDatedCheques"], queryFn: postDatedChequesService.list });
export const useServiceInvoices = () =>
  useQuery({ queryKey: ["serviceInvoices"], queryFn: serviceInvoicesService.list });
export const usePayrollAdjustments = () =>
  useQuery({ queryKey: ["payrollAdjustments"], queryFn: payrollAdjustmentsService.list });
export const useLeaveRequests = () =>
  useQuery({ queryKey: ["leaveRequests"], queryFn: leaveRequestsService.list });
