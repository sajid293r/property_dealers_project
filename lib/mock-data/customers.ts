import type { Customer } from "@/lib/types";
import { mulberry32, range, fullName, cnic, phone, dateOffset, pick, CITIES } from "./seed";

const rand = mulberry32(1001);

export const customers: Customer[] = range(28).map((i) => {
  const totalPaid = Math.round((300000 + rand() * 4500000) / 1000) * 1000;
  const balance = Math.round((rand() * 800000 - 200000) / 1000) * 1000;
  return {
    id: `cust-${i + 1}`,
    name: fullName(rand),
    cnic: cnic(rand),
    phone: phone(rand),
    city: pick(rand, CITIES),
    balance,
    totalPaid,
    createdAt: dateOffset(-Math.floor(rand() * 400)),
  };
});
