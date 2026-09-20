import type { StaffMember, StaffRole } from "@/lib/types";
import { mulberry32, range, pick, fullName, phone, dateOffset } from "./seed";

const rand = mulberry32(5005);

const ROLES: readonly StaffRole[] = ["admin", "manager", "agent", "agent", "accountant", "dealer"];
const DEPARTMENTS = ["Sales", "Accounts", "Marketing", "Operations"] as const;

export const staff: StaffMember[] = range(14).map((i) => {
  const role = pick(rand, ROLES);
  const salary = role === "manager" ? 120000 : role === "accountant" ? 90000 : role === "admin" ? 150000 : 60000;
  return {
    id: `staff-${i + 1}`,
    name: fullName(rand),
    role,
    phone: phone(rand),
    department: pick(rand, DEPARTMENTS),
    salary,
    balance: Math.round((rand() * 40000 - 10000) / 500) * 500,
    joinedAt: dateOffset(-Math.floor(rand() * 900)),
    avatarUrl: `https://i.pravatar.cc/80?u=staff-${i + 1}`,
  };
});
