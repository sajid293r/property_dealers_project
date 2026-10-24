/**
 * Pages that show REAL data once someone is signed in. Every other page still shows an empty preview built on
 * the demo code: what is added there is not saved. The dashboard layout tells the person so, in plain words.
 * Add a route here the day its screen is connected to the API.
 */
export const CONNECTED_ROUTES = ["/dashboard/properties", "/dashboard/projects", "/dashboard/plot-map", "/dashboard/vouchers", "/dashboard/accounts", "/dashboard/bank-reconciliation", "/dashboard/reports", "/dashboard/customers", "/dashboard/deals", "/dashboard/expenses", "/dashboard/sales-invoices", "/dashboard/administration", "/dashboard/crm", "/dashboard/quotations", "/dashboard/cheques", "/dashboard/service-invoices", "/dashboard/contracts", "/dashboard/staff", "/dashboard/leave", "/dashboard/payroll", "/dashboard/contractors", "/dashboard/budgets", "/dashboard/account"] as const;

export type LiveNotice = "none" | "partial" | "preview";

export function liveNoticeFor(pathname: string): LiveNotice {
  if (pathname === "/dashboard") return "none";
  return CONNECTED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`)) ? "none" : "preview";
}

/** Is this page backed by real data? (The dashboard home counts.) Used to keep unfinished pages out of a real company's menu. */
export function isConnectedRoute(pathname: string): boolean {
  return pathname === "/dashboard" || CONNECTED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
