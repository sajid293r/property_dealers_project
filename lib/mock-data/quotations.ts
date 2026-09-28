import type { Quotation, QuotationStatus } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";
import { units } from "./units";
import { customers } from "./customers";
import { staff } from "./staff";
import { PAYMENT_TERMS } from "@/lib/sales";

const rand = mulberry32(4104);

const salesStaff = staff.filter((s) => s.role === "agent" || s.role === "manager");
const STATUSES: readonly QuotationStatus[] = ["draft", "sent", "sent", "accepted", "accepted", "expired", "converted"];

export const quotations: Quotation[] = range(16).map((i) => {
  const unit = pick(rand, units);
  const customer = pick(rand, customers);
  const discountPercent = pick(rand, [0, 0, 2, 5, 7.5, 10]);
  const daysAgo = Math.floor(rand() * 60);
  return {
    id: `qtn-${i + 1}`,
    number: `QTN-${(1030 + i).toString().padStart(5, "0")}`,
    date: dateOffset(-daysAgo),
    validUntil: dateOffset(-daysAgo + 14),
    customerId: customer.id,
    unitId: unit.id,
    salesPerson: pick(rand, salesStaff).name,
    price: unit.price,
    discountPercent,
    paymentTerms: pick(rand, PAYMENT_TERMS),
    remarks: "",
    status: pick(rand, STATUSES),
    createdAt: dateOffset(-daysAgo),
  };
});
