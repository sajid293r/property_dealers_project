export function formatPkr(amount: number, options?: { compact?: boolean }) {
  if (options?.compact) {
    // Node's ICU and browser ICU format 0 in compact notation differently
    // ("Rs 0" vs "Rs 0.0"), which causes an SSR/client hydration mismatch — special-case it.
    if (amount === 0) return "Rs 0";
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: "PKR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}
