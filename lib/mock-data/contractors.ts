import type { Contractor, ContractorTrade } from "@/lib/types";
import { mulberry32, range, pick, fullName, phone, dateOffset } from "./seed";
import { CONTRACTOR_TRADES } from "@/lib/projects";

const rand = mulberry32(1212);

const COMPANY_SUFFIXES = ["Builders", "Construction Co.", "Engineering Works", "& Sons", "Associates"] as const;

function companyName(person: string, trade: ContractorTrade, rand: () => number) {
  if (trade === "General Contractor") return `${person.split(" ")[0]} ${pick(rand, COMPANY_SUFFIXES)}`;
  return `${trade} Specialists — ${person.split(" ")[0]}`;
}

export const contractors: Contractor[] = range(9).map((i) => {
  const name = fullName(rand);
  const trade = CONTRACTOR_TRADES[i % CONTRACTOR_TRADES.length];
  return {
    id: `ctr-${i + 1}`,
    name,
    companyName: companyName(name, trade, rand),
    trade,
    phone: phone(rand),
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@${trade === "General Contractor" ? "buildco" : "trade"}.pk`,
    cnicOrNtn: `${3520 + Math.floor(rand() * 100)}-${String(Math.floor(rand() * 10000000)).padStart(7, "0")}-${Math.floor(rand() * 10)}`,
    address: pick(rand, ["Lahore", "Islamabad", "Rawalpindi"]),
    rating: Math.round((3.5 + rand() * 1.5) * 10) / 10,
    createdAt: dateOffset(-Math.floor(rand() * 500)),
  };
});
