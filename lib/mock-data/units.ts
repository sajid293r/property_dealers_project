import type { Unit, UnitStatus, UnitPaymentType } from "@/lib/types";
import { mulberry32, range, pick } from "./seed";

const rand = mulberry32(2002);

const PROJECTS = ["Green Valley Homes", "Al-Noor Heights", "Riverside Enclave", "Emerald Gardens"] as const;
const CATEGORIES = ["Residential Plot", "Commercial Plot", "House", "Apartment"] as const;
const BLOCKS = ["A", "B", "C", "D", "E"] as const;
const STATUSES: readonly UnitStatus[] = ["available", "available", "available", "reserved", "sold"];
const PAYMENT_TYPES: readonly UnitPaymentType[] = ["installment", "installment", "cash"];

const IMAGES = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
  "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800&q=80",
  "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
];

export const units: Unit[] = range(42).map((i) => {
  const sizeMarla = pick(rand, [5, 7, 10, 12, 20]);
  const sqft = sizeMarla * 272;
  const pricePerMarla = 1200000 + Math.floor(rand() * 900000);
  const price = Math.round((sizeMarla * pricePerMarla) / 10000) * 10000;
  return {
    id: `unit-${i + 1}`,
    code: `UNT-${(1000 + i).toString()}`,
    title: `Plot ${i + 1}`,
    project: pick(rand, PROJECTS),
    category: pick(rand, CATEGORIES),
    sizeMarla,
    sqft,
    price,
    status: pick(rand, STATUSES),
    paymentType: pick(rand, PAYMENT_TYPES),
    block: pick(rand, BLOCKS),
    imageUrl: pick(rand, IMAGES),
  };
});
