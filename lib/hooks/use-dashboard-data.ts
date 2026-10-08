"use client";

import * as React from "react";
import {
  useAccounts,
  useBudgetLines,
  useBudgets,
  useContracts,
  useCustomers,
  useDeals,
  useExpenses,
  useLeads,
  useLeaveRequests,
  usePayrollAdjustments,
  usePostDatedCheques,
  useProjects,
  useQuotations,
  useStaff,
  useTransactions,
  useUnits,
  useVouchers,
} from "@/lib/hooks/use-data";
import type { DashboardData } from "@/lib/dashboard-insights";

/** Loads every dataset the dashboard analyses. `data` is null until all of them have arrived. */
export function useDashboardData(): { data: DashboardData | null; isLoading: boolean } {
  const { data: deals } = useDeals();
  const { data: units } = useUnits();
  const { data: customers } = useCustomers();
  const { data: leads } = useLeads();
  const { data: accounts } = useAccounts();
  const { data: transactions } = useTransactions();
  const { data: expenses } = useExpenses();
  const { data: vouchers } = useVouchers();
  const { data: cheques } = usePostDatedCheques();
  const { data: contracts } = useContracts();
  const { data: leaves } = useLeaveRequests();
  const { data: quotations } = useQuotations();
  const { data: adjustments } = usePayrollAdjustments();
  const { data: projects } = useProjects();
  const { data: budgets } = useBudgets();
  const { data: budgetLines } = useBudgetLines();
  const { data: staff } = useStaff();

  const data = React.useMemo<DashboardData | null>(() => {
    if (!deals || !units || !customers || !leads || !accounts || !transactions || !expenses || !vouchers || !cheques || !contracts || !leaves || !quotations || !adjustments || !projects || !budgets || !budgetLines || !staff) {
      return null;
    }
    return { deals, units, customers, leads, accounts, transactions, expenses, vouchers, cheques, contracts, leaves, quotations, adjustments, projects, budgets, budgetLines, staff };
  }, [deals, units, customers, leads, accounts, transactions, expenses, vouchers, cheques, contracts, leaves, quotations, adjustments, projects, budgets, budgetLines, staff]);

  return { data, isLoading: data === null };
}
