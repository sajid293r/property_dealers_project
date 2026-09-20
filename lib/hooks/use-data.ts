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
