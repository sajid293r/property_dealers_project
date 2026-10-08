export function formatPkr(amount: number, options?: { compact?: boolean }) {
  if (options?.compact) {
    // Hand-rolled instead of Intl compact notation: Node and browser ICU disagree on
    // trailing zeros ("Rs 357M" vs "Rs 357.0M"), which causes SSR/client hydration mismatches.
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    const steps: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
    for (const [size, suffix] of steps) {
      if (abs >= size) return `${sign}Rs ${Number((abs / size).toFixed(1))}${suffix}`;
    }
    return `${sign}Rs ${Math.round(abs)}`;
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
