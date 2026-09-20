import type { Lead, LeadStatus } from "@/lib/types";
import { mulberry32, range, pick, fullName, phone, dateOffset } from "./seed";

const rand = mulberry32(4004);

const SOURCES = ["Facebook", "WhatsApp", "Referral", "Walk-in", "Zameen.com", "OLX"] as const;
const STATUSES: readonly LeadStatus[] = ["new", "contacted", "negotiation", "won", "lost"];
const AGENTS = ["Bilal Khan", "Ayesha Malik", "Usman Sheikh", "Sana Qureshi"] as const;
const PROJECTS = ["Green Valley Homes", "Al-Noor Heights", "Riverside Enclave", "Emerald Gardens"] as const;

export const leads: Lead[] = range(24).map((i) => ({
  id: `lead-${i + 1}`,
  name: fullName(rand),
  phone: phone(rand),
  source: pick(rand, SOURCES),
  status: pick(rand, STATUSES),
  assignedTo: pick(rand, AGENTS),
  interestedIn: pick(rand, PROJECTS),
  createdAt: dateOffset(-Math.floor(rand() * 60)),
  nextFollowUp: rand() > 0.4 ? dateOffset(Math.floor(rand() * 10)) : undefined,
}));
