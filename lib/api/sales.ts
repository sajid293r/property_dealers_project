import { api } from "@/lib/api/client";

// ───────────────────────────────────────────── bookings
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type InstallmentStatus = "due" | "partial" | "paid" | "waived";

export interface BookingRow {
  id: string;
  bookingNo: string;
  propertyId: string;
  propertyCode: string;
  propertyTitle: string;
  projectId: string | null;
  projectName: string | null;
  customerId: string;
  customerName: string;
  bookingDate: string;
  listPrice: string;
  discount: string;
  netPrice: string;
  paymentType: "cash" | "installment";
  status: BookingStatus;
  cancelReason: string | null;
  paidAmount: string;
  scheduledAmount: string;
  installmentCount: number;
  nextDueDate: string | null;
  overdueAmount: string;
  createdAt: string;
}
export interface InstallmentRow {
  id: string;
  seq: number;
  kind: "down_payment" | "installment" | "balloon" | "possession";
  dueDate: string;
  amount: string;
  paidAmount: string;
  status: InstallmentStatus;
}
export interface BookingDetail extends BookingRow {
  installments: InstallmentRow[];
  nextSteps: { to: string; description: string | null; requiredPermission: string | null }[];
}

export function listBookings(companyId: string, f: { status?: BookingStatus; propertyId?: string } = {}) {
  const qs = new URLSearchParams({ limit: "200" });
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
  return api<BookingRow[]>(`/v1/bookings?${qs}`, { companyId });
}
export const getBooking = (companyId: string, id: string) => api<BookingDetail>(`/v1/bookings/${id}`, { companyId });
export const createBooking = (
  companyId: string,
  body: { propertyId: string; customerId: string; paymentType: "cash" | "installment"; listPrice?: string; discount?: string; bookingDate?: string; dealerId?: string },
  idempotencyKey?: string,
) => api<BookingDetail>("/v1/bookings", { method: "POST", companyId, body, idempotencyKey });
export const buildSchedule = (
  companyId: string,
  id: string,
  body: { downPayment: string; installments: number; firstDue?: string; intervalMonths?: number; balloon?: string; balloonDue?: string },
) => api<BookingDetail>(`/v1/bookings/${id}/schedule`, { method: "POST", companyId, body });
export const setBookingStatus = (companyId: string, id: string, to: "confirmed" | "completed" | "cancelled", reason?: string) =>
  api<BookingDetail>(`/v1/bookings/${id}/status`, { method: "POST", companyId, body: { to, reason } });

// ───────────────────────────────────────────── receipts
export type ReceiptMethod = "cash" | "cheque" | "bank_transfer" | "online" | "pay_order";
export interface ReceiptRow {
  id: string;
  receiptNo: string;
  receivedOn: string;
  amount: string;
  method: ReceiptMethod | "split";
  instrumentRef: string | null;
  status: "posted" | "void";
  customerId: string;
  customerName: string;
  bookingId: string | null;
  bookingNo: string | null;
  depositAccountId: string | null;
  depositAccountCode: string | null;
  depositAccountName: string | null;
  allocatedAmount: string;
  voidReason: string | null;
  createdAt: string;
}
export interface ReceiptDetail extends ReceiptRow {
  allocations: { seq: number; kind: string; dueDate: string; amount: string }[];
}
export function listReceipts(companyId: string, f: { bookingId?: string; customerId?: string; status?: "posted" | "void"; search?: string } = {}) {
  const qs = new URLSearchParams({ limit: "200" });
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
  return api<ReceiptRow[]>(`/v1/receipts?${qs}`, { companyId });
}
export const getReceipt = (companyId: string, id: string) => api<ReceiptDetail>(`/v1/receipts/${id}`, { companyId });
export const createReceipt = (
  companyId: string,
  body: {
    bookingId?: string;
    customerId?: string;
    amount: string;
    method: ReceiptMethod;
    bankAccountId?: string;
    depositAccountId?: string;
    receivedOn?: string;
    instrumentRef?: string;
    allocations?: { installmentId: string; amount: string }[];
  },
) => api<ReceiptDetail>("/v1/receipts", { method: "POST", companyId, body });
export const voidReceipt = (companyId: string, id: string, reason: string, date?: string) =>
  api<ReceiptDetail>(`/v1/receipts/${id}/void`, { method: "POST", companyId, body: { reason, date } });

// ───────────────────────────────────────────── properties open for sale
export interface SellableProperty {
  id: string;
  code: string;
  title: string;
  status: string;
  listPrice: string;
  installmentsAvailable: boolean;
  project: string | null;
  projectId: string | null;
  block: string | null;
  type: string;
  sizeValue: string | null;
  sizeUnit: string | null;
}
/** Every property open for sale, fetched page by page (a large scheme can have thousands of plots). */
export async function listAvailableProperties(companyId: string): Promise<SellableProperty[]> {
  const all: SellableProperty[] = [];
  for (let offset = 0; offset < 10_000; offset += 200) {
    const page = await api<SellableProperty[]>(`/v1/properties?status=available&limit=200&offset=${offset}`, { companyId });
    all.push(...page);
    if (page.length < 200) break;
  }
  return all;
}

// ───────────────────────────────────────────── dashboard
export interface DashboardData {
  permissions: { inventory: boolean; sales: boolean; finance: boolean };
  inventory?: { byStatus: { status: string; n: number; value: string }[]; projects: number };
  sales?: {
    activeBookings: number;
    pendingBookings: number;
    contractValue: string;
    collections: { thisMonth: string; lastMonth: string; allTime: string };
    overdueAmount: string;
    overdueBookings: number;
    dueNext30: string;
    totalReceivable: string;
    aging: { bucket: string; amount: string }[];
    overdueList: { bookingId: string; bookingNo: string; customerName: string; oldestDue: string; amount: string }[];
    upcoming: { bookingId: string; bookingNo: string; customerName: string; dueDate: string; seq: number; amount: string }[];
    recentReceipts: { id: string; receiptNo: string; receivedOn: string; amount: string; customerName: string; bookingId: string | null; bookingNo: string | null }[];
    collectionsByMonth: { month: string; amount: string }[];
  };
  finance?: { cashInHand: string; inBanks: string; vouchersPending: number; monthIncome: string; monthExpense: string; bankAccountsToReconcile: number };
}
export const fetchDashboard = (companyId: string) => api<DashboardData>("/v1/dashboard", { companyId });
