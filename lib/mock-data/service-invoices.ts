import type { ServiceInvoice, ServiceInvoiceStatus } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";
import { deals } from "./deals";
import { SERVICE_TYPES } from "@/lib/sales";

const rand = mulberry32(7407);

// Service/maintenance charges only apply once a unit has actually changed
// hands — pull the (customer, unit) pairs from confirmed/completed deals.
const owners = deals.filter((d) => d.status === "confirmed" || d.status === "completed");

const PERIODS = ["July 2026", "August 2026", "September 2026"] as const;
const AMOUNTS: Record<(typeof SERVICE_TYPES)[number], number> = {
  Maintenance: 5000,
  Security: 3000,
  "Development Charges": 25000,
  Utility: 4500,
  Other: 2000,
};

const STATUSES: readonly ServiceInvoiceStatus[] = ["paid", "paid", "unpaid"];

export const serviceInvoices: ServiceInvoice[] = range(15).map((i) => {
  const owner = pick(rand, owners.length > 0 ? owners : deals);
  const serviceType = pick(rand, SERVICE_TYPES);
  const status = pick(rand, STATUSES);
  const daysAgo = Math.floor(rand() * 50);

  return {
    id: `svc-${i + 1}`,
    number: `SVC-${(3010 + i).toString().padStart(5, "0")}`,
    date: dateOffset(-daysAgo),
    dueDate: dateOffset(status === "unpaid" ? -daysAgo + 12 : -daysAgo + 5),
    customerId: owner.customerId,
    unitId: owner.unitId,
    serviceType,
    period: pick(rand, PERIODS),
    amount: AMOUNTS[serviceType],
    status,
    createdAt: dateOffset(-daysAgo),
  };
});
