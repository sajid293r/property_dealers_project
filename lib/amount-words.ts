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

/**
 * "Rupees Five Lakh Seventy-Five Thousand and Fifty Paisa Only".
 * Takes the amount as typed (a string with up to 2 decimals) so it is never rounded by a float.
 */
export function amountInWords(amount: string | number): string {
  const text = String(amount).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return "";
  const negative = text.startsWith("-");
  const [whole = "0", frac = ""] = text.replace("-", "").split(".");
  if (whole.length > 12) return "";
  const rupees = Number(whole);
  const paisa = Number(frac.padEnd(2, "0"));
  if (rupees === 0 && paisa === 0) return "";
  const r = rupees > 0 ? `${integerWords(rupees)}` : "";
  const p = paisa > 0 ? `${integerWords(paisa)} Paisa` : "";
  const body = r && p ? `${r} and ${p}` : r || p;
  return `${negative ? "Minus " : ""}Rupees ${body} Only`;
}
