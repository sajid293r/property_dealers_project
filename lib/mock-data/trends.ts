import { mulberry32, range } from "./seed";

const rand = mulberry32(9009);

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export const monthlyCollections = range(12).map((i) => {
  const base = 2200000 + i * 140000;
  const collections = Math.round((base + rand() * 900000) / 10000) * 10000;
  const target = Math.round((base + 400000) / 10000) * 10000;
  return { month: MONTHS[i], collections, target };
});

export const weeklyCollections = range(8).map((i) => ({
  week: `W${i + 1}`,
  collections: Math.round((450000 + rand() * 600000) / 10000) * 10000,
}));
