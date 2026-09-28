import type { ChequeStatus, PostDatedCheque } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";
import { deals } from "./deals";
import { PAKISTANI_BANKS } from "@/lib/sales";

const rand = mulberry32(6306);

const dealsWithInstallments = deals.filter((d) => d.installments.length > 0);
const STATUSES: readonly ChequeStatus[] = ["in_hand", "in_hand", "deposited", "cleared", "cleared", "cleared", "bounced"];

function chequeNo(rand: () => number) {
  return String(Math.floor(1000000 + rand() * 9000000));
}

export const postDatedCheques: PostDatedCheque[] = range(18).map((i) => {
  const deal = pick(rand, dealsWithInstallments.length > 0 ? dealsWithInstallments : deals);
  const amount = deal.installments.length > 0 ? pick(rand, deal.installments).amount : deal.totalAmount;
  const status = pick(rand, STATUSES);
  const receivedDaysAgo = 10 + Math.floor(rand() * 60);

  return {
    id: `pdc-${i + 1}`,
    chequeNo: chequeNo(rand),
    bankName: pick(rand, PAKISTANI_BANKS),
    amount,
    // Post-dated: the cheque's own date sits after the day it was collected.
    chequeDate: dateOffset(-receivedDaysAgo + 20 + Math.floor(rand() * 40)),
    receivedDate: dateOffset(-receivedDaysAgo),
    customerId: deal.customerId,
    dealId: deal.id,
    status,
    remarks: status === "bounced" ? "Insufficient funds — customer notified" : "",
  };
});
