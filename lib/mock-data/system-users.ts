import type { SystemUser, SystemUserStatus } from "@/lib/types";
import { mulberry32, range, pick, fullName, phone, dateOffset } from "./seed";

const rand = mulberry32(7007);

const ROLE_POOL = [
  "administrator",
  "ceo-director",
  "cfo-financial-controller",
  "accounts-officer",
  "accounts-officer",
  "sales-officer",
  "sales-officer",
  "sales-officer",
  "project-manager",
] as const;

const DEPARTMENTS = ["Management", "Finance", "Sales", "Operations", "Projects"] as const;
const STATUS_POOL: readonly SystemUserStatus[] = ["active", "active", "active", "invited", "suspended"];

export const systemUsers: SystemUser[] = range(11).map((i) => {
  const name = fullName(rand);
  const username = name.toLowerCase().replace(/\s+/g, ".");
  const isFounder = i === 0;

  return {
    id: `user-${i + 1}`,
    name,
    username,
    email: `${username}@alnoorestates.pk`,
    phone: phone(rand),
    avatarUrl: `https://i.pravatar.cc/80?u=sysuser-${i + 1}`,
    roleId: isFounder ? "super-admin" : pick(rand, ROLE_POOL),
    department: isFounder ? "Management" : pick(rand, DEPARTMENTS),
    status: isFounder ? "active" : pick(rand, STATUS_POOL),
    lastActiveAt: dateOffset(-Math.floor(rand() * 20)),
    createdAt: dateOffset(-Math.floor(rand() * 700) - 30),
  };
});
