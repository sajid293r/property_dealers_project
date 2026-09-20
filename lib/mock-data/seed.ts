// Deterministic PRNG so mock data is identical on server and client render
// (avoids hydration mismatches from Math.random()).
export function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export function dateOffset(daysFromToday: number): string {
  const d = new Date(2026, 8, 20); // fixed "today" for deterministic demo data
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

export const PAKISTANI_FIRST_NAMES = [
  "Ahmed", "Bilal", "Hassan", "Usman", "Farhan", "Imran", "Kamran", "Adnan",
  "Zeeshan", "Shahid", "Fahad", "Waqas", "Asad", "Rizwan", "Tariq",
  "Ayesha", "Sana", "Mehwish", "Rabia", "Hira", "Sadia", "Nadia", "Fatima",
  "Zainab", "Amna", "Maria", "Saba",
] as const;

export const PAKISTANI_LAST_NAMES = [
  "Khan", "Malik", "Butt", "Chaudhry", "Sheikh", "Qureshi", "Raja", "Awan",
  "Mirza", "Baig", "Abbasi", "Gill", "Bhatti", "Cheema", "Dar",
] as const;

export const CITIES = [
  "Lahore", "Islamabad", "Rawalpindi", "Karachi", "Faisalabad", "Multan", "Gujranwala",
] as const;

export function fullName(rand: () => number) {
  return `${pick(rand, PAKISTANI_FIRST_NAMES)} ${pick(rand, PAKISTANI_LAST_NAMES)}`;
}

export function cnic(rand: () => number) {
  const p2 = Math.floor(rand() * 10000000)
    .toString()
    .padStart(7, "0");
  return `3520${p2.slice(0, 6)}-${Math.floor(rand() * 10)}`;
}

export function phone(rand: () => number) {
  const n = Math.floor(rand() * 10000000)
    .toString()
    .padStart(7, "0");
  return `03${Math.floor(rand() * 9) + 1}${n.slice(0, 7)}`;
}
