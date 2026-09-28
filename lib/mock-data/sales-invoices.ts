import type { SalesInvoice, SalesInvoiceStatus } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";
import { deals } from "./deals";
import { units } from "./units";
import { PAYMENT_MODES } from "@/lib/sales";

const rand = mulberry32(5205);

const dealsWithInstallments = deals.filter((d) => d.installments.length > 0);
const STATUSES: readonly SalesInvoiceStatus[] = ["paid", "paid", "paid", "unpaid", "unpaid"];

export const salesInvoices: SalesInvoice[] = range(20).map((i) => {
  const deal = pick(rand, dealsWithInstallments.length > 0 ? dealsWithInstallments : deals);
  const amount = deal.installments.length > 0 ? pick(rand, deal.installments).amount : deal.totalAmount;
  const unit = units.find((u) => u.id === deal.unitId);
  const daysAgo = Math.floor(rand() * 75);
  const status = pick(rand, STATUSES);

  return {
    id: `sinv-${i + 1}`,
    number: `SINV-${(2040 + i).toString().padStart(5, "0")}`,
    date: dateOffset(-daysAgo),
    dueDate: dateOffset(status === "unpaid" ? -daysAgo + 10 : -daysAgo + 3),
    customerId: deal.customerId,
    dealId: deal.id,
    description: `Installment — ${unit?.code ?? deal.voucherNo}`,
    amount,
    paymentMode: pick(rand, PAYMENT_MODES),
    status,
    createdAt: dateOffset(-daysAgo),
  };
});
