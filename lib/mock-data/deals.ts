import type { Deal, DealStatus, Installment } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";
import { units } from "./units";
import { customers } from "./customers";

const rand = mulberry32(3003);

const STATUSES: readonly DealStatus[] = ["pending", "confirmed", "confirmed", "completed", "cancelled"];

function buildInstallments(total: number, paidAmount: number): Installment[] {
  const count = 6 + Math.floor(rand() * 6);
  const per = Math.round(total / count / 1000) * 1000;
  let remainingPaid = paidAmount;
  return range(count).map((i) => {
    const amount = i === count - 1 ? total - per * (count - 1) : per;
    const paid = remainingPaid >= amount;
    if (paid) remainingPaid -= amount;
    return {
      id: `inst-${i + 1}`,
      dueDate: dateOffset((i - 2) * 30),
      amount,
      paid,
      paidDate: paid ? dateOffset((i - 2) * 30 - 2) : undefined,
    };
  });
}

export const deals: Deal[] = range(30).map((i) => {
  const unit = pick(rand, units);
  const customer = pick(rand, customers);
  const totalAmount = unit.price;
  const paidRatio = 0.1 + rand() * 0.8;
  const paidAmount = Math.round((totalAmount * paidRatio) / 1000) * 1000;
  return {
    id: `deal-${i + 1}`,
    voucherNo: `VCH-${(5000 + i).toString()}`,
    unitId: unit.id,
    customerId: customer.id,
    totalAmount,
    paidAmount,
    status: pick(rand, STATUSES),
    paymentType: unit.paymentType,
    createdAt: dateOffset(-Math.floor(rand() * 300)),
    installments:
      unit.paymentType === "installment" ? buildInstallments(totalAmount, paidAmount) : [],
  };
});
