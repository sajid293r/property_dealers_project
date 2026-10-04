/**
 * A tenant of the platform. One login (the group owner) can operate several
 * companies; every project, property, customer, ledger and staff record
 * belongs to exactly one company and is never visible from another.
 */
export interface Company {
  id: string;
  name: string;
  /** Short label for tight spaces (switcher, chips). */
  shortName: string;
  city: string;
  industry: string;
  ntn: string;
  phone: string;
  email: string;
  /** CSS color (oklch) used to tint the company's avatar and highlights. */
  accent: string;
  /** True for companies created at runtime — they start with an empty workspace. */
  custom?: boolean;
}

export const SEED_COMPANIES: Company[] = [
  {
    id: "co-1",
    name: "Al-Noor Estate Advisors",
    shortName: "Al-Noor Estates",
    city: "Lahore",
    industry: "Real estate agency",
    ntn: "1234567-8",
    phone: "042-111-000-999",
    email: "info@alnoorestates.pk",
    accent: "oklch(0.5 0.1 165)",
  },
  {
    id: "co-2",
    name: "Capital Heights Developers (Pvt) Ltd",
    shortName: "Capital Heights",
    city: "Islamabad",
    industry: "Housing scheme developer",
    ntn: "2345678-1",
    phone: "051-111-222-333",
    email: "contact@capitalheights.pk",
    accent: "oklch(0.52 0.14 255)",
  },
  {
    id: "co-3",
    name: "Karachi Coastal Properties",
    shortName: "Coastal Properties",
    city: "Karachi",
    industry: "Dealer network",
    ntn: "3456789-2",
    phone: "021-111-444-555",
    email: "hello@coastalproperties.pk",
    accent: "oklch(0.62 0.15 45)",
  },
];

export function companyInitials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
