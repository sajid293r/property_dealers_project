import { languageInfo } from "@/lib/i18n/config";
import { runtimeLanguage, runtimeLocale } from "@/lib/i18n/runtime";

// Money and numbers are written the same way in every language: Western digits, "Rs", and the same grouping,
// so a figure on screen always matches the printed voucher and the accountant's books. Only dates (month and
// day names) and the compact size words follow the language. Urdu reads big amounts as lakh / crore.
/**
 * Inside right-to-left text a plain "-Rs 13.3" can come out as "Rs 13.3-" (the minus sign and the digits are
 * ordered by the surrounding sentence). Wrapping an amount in a left-to-right isolate keeps it exactly as written,
 * wherever it is shown. Only done on right-to-left screens, so English text and CSV files are untouched.
 */
const ltr = (s: string) => (languageInfo(runtimeLanguage()).dir === "rtl" ? `\u2066${s}\u2069` : s);

const URDU_STEPS: [number, string][] = [[1e9, " ارب"], [1e7, " کروڑ"], [1e5, " لاکھ"], [1e3, " ہزار"]];
const LATIN_STEPS: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];

export function formatPkr(amount: number, options?: { compact?: boolean }) {
  if (options?.compact) {
    // Hand-rolled instead of Intl compact notation: Node and browser ICU disagree on
    // trailing zeros ("Rs 357M" vs "Rs 357.0M"), which causes SSR/client hydration mismatches.
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    const steps = runtimeLanguage() === "ur" ? URDU_STEPS : LATIN_STEPS;
    for (const [size, suffix] of steps) {
      if (abs >= size) return ltr(`${sign}Rs ${Number((abs / size).toFixed(1))}${suffix}`);
    }
    return ltr(`${sign}Rs ${Math.round(abs)}`);
  }
  return ltr(new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amount));
}

export function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat(runtimeLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

/** ISO date `days` from the real current date — for defaults on freshly-created records (not seeded mock data, which anchors to a fixed date). */
export function dateOffsetFromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Short money label for chart axes: "4.5M", "850K" — no currency prefix so it never wraps. */
export function formatAxis(amount: number) {
  return formatPkr(amount, { compact: true }).replace("Rs ", "");
}

/** Exact money for ledgers and vouchers: always shows the paisa, so a posted amount is never rounded on screen. */
export function formatMoney(amount: number, options?: { compact?: boolean }) {
  if (options?.compact) return formatPkr(amount, options);
  return ltr(new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount));
}

/** "Sep" / "ستمبر" for a "2026-09" key. */
export function formatMonthShort(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat(runtimeLocale(), { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "Sun, 20 Sep" style day label for an ISO date. */
export function formatDayShort(iso: string) {
  return new Intl.DateTimeFormat(runtimeLocale(), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
}

/** "Sunday, 20 September" for the dashboard banner. */
export function formatDayLong(d: Date) {
  return new Intl.DateTimeFormat(runtimeLocale(), { weekday: "long", day: "numeric", month: "long" }).format(d);
}

/** Time of day, 24-hour clock unless the language's own convention says otherwise. */
export function formatTime(d: Date) {
  return new Intl.DateTimeFormat(runtimeLocale(), { hour: "2-digit", minute: "2-digit" }).format(d);
}
