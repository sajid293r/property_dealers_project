import { runtimeLanguage, translate } from "@/lib/i18n/runtime";
import type { LanguageCode } from "@/lib/i18n/config";

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ""));
  } else if (n > 0) {
    parts.push(ONES[n]!);
  }
  return parts.join(" ");
}

/** Whole rupees in the Pakistani system: thousand, lakh, crore, arab. */
function integerWords(n: number): string {
  if (n === 0) return "Zero";
  const units: [number, string][] = [[1_000_000_000, "Arab"], [10_000_000, "Crore"], [100_000, "Lakh"], [1_000, "Thousand"]];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of units) {
    if (rest >= size) {
      const q = Math.floor(rest / size);
      parts.push(`${below1000(q)} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(below1000(rest));
  return parts.join(" ");
}


// ── Urdu: every number below 100 has its own word, so it is a table, not a rule.
const UR_BELOW_100 = [
  "صفر", "ایک", "دو", "تین", "چار", "پانچ", "چھ", "سات", "آٹھ", "نو", "دس", "گیارہ", "بارہ", "تیرہ", "چودہ", "پندرہ", "سولہ", "سترہ", "اٹھارہ", "انیس",
  "بیس", "اکیس", "بائیس", "تئیس", "چوبیس", "پچیس", "چھبیس", "ستائیس", "اٹھائیس", "انتیس", "تیس", "اکتیس", "بتیس", "تینتیس", "چونتیس", "پینتیس", "چھتیس", "سینتیس", "اڑتیس", "انتالیس",
  "چالیس", "اکتالیس", "بیالیس", "تینتالیس", "چوالیس", "پینتالیس", "چھیالیس", "سینتالیس", "اڑتالیس", "انچاس", "پچاس", "اکاون", "باون", "ترپن", "چون", "پچپن", "چھپن", "ستاون", "اٹھاون", "انسٹھ",
  "ساٹھ", "اکسٹھ", "باسٹھ", "تریسٹھ", "چونسٹھ", "پینسٹھ", "چھیاسٹھ", "سڑسٹھ", "اڑسٹھ", "انہتر", "ستر", "اکہتر", "بہتر", "تہتر", "چوہتر", "پچھتر", "چھہتر", "ستہتر", "اٹھہتر", "اناسی",
  "اسی", "اکیاسی", "بیاسی", "تراسی", "چوراسی", "پچاسی", "چھیاسی", "ستاسی", "اٹھاسی", "نواسی", "نوے", "اکانوے", "بانوے", "ترانوے", "چورانوے", "پچانوے", "چھیانوے", "ستانوے", "اٹھانوے", "ننانوے",
];

function urBelow1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${UR_BELOW_100[Math.floor(n / 100)]} سو`);
    n %= 100;
  }
  if (n > 0) parts.push(UR_BELOW_100[n]!);
  return parts.join(" ");
}

function urIntegerWords(n: number): string {
  if (n === 0) return UR_BELOW_100[0]!;
  const units: [number, string][] = [[1_000_000_000, "ارب"], [10_000_000, "کروڑ"], [100_000, "لاکھ"], [1_000, "ہزار"]];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of units) {
    if (rest >= size) {
      parts.push(`${urBelow1000(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(urBelow1000(rest));
  return parts.join(" ");
}

/**
 * "Rupees Five Lakh Seventy-Five Thousand and Fifty Paisa Only".
 * Takes the amount as typed (a string with up to 2 decimals) so it is never rounded by a float.
 */
export function amountInWords(amount: string | number, lang: LanguageCode = runtimeLanguage()): string {
  const text = String(amount).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return "";
  const negative = text.startsWith("-");
  const [whole = "0", frac = ""] = text.replace("-", "").split(".");
  if (whole.length > 12) return "";
  const rupees = Number(whole);
  const paisa = Number(frac.padEnd(2, "0"));
  if (rupees === 0 && paisa === 0) return "";
  // Urdu has its own words and word order ("روپے ... صرف"). Every other language prints the English words (see docs/I18N_REVIEW.md).
  if (lang === "ur") {
    const r = rupees > 0 ? urIntegerWords(rupees) : "";
    const p = paisa > 0 ? `${urIntegerWords(paisa)} ${translate("words.paisa")}` : "";
    const body = r && p ? `${r} ${translate("words.and")} ${p}` : r || p;
    return `${negative ? `${translate("words.minus")} ` : ""}${translate("words.rupees")} ${body} ${translate("words.only")}`;
  }
  const r = rupees > 0 ? `${integerWords(rupees)}` : "";
  const p = paisa > 0 ? `${integerWords(paisa)} Paisa` : "";
  const body = r && p ? `${r} and ${p}` : r || p;
  return `${negative ? "Minus " : ""}Rupees ${body} Only`;
}
