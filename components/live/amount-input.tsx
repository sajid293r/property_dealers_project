"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** "1234567.5" -> "1,234,567.5" (keeps what the person is still typing, such as a trailing dot). */
export function formatAmountText(raw: string): string {
  if (!raw) return "";
  const negative = raw.startsWith("-");
  const [whole = "", frac] = raw.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${frac !== undefined ? `.${frac}` : ""}`;
}

/** Keep digits, one dot, at most 2 decimals (and an optional leading minus). */
export function cleanAmountText(input: string, allowNegative: boolean): string {
  let s = input.replace(/[^\d.-]/g, "");
  const negative = allowNegative && s.startsWith("-");
  s = s.replace(/-/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  s = s.replace(/^0+(?=\d)/, "");
  return `${negative ? "-" : ""}${s}`;
}

/**
 * A money field that never hides a digit: grouped with commas, right-aligned, wide enough for crores, and the text
 * shrinks as the number grows instead of being cut off. `value` is the plain text ("1234567.50"); `onChange` gets the same.
 */
export function AmountInput({
  value,
  onChange,
  placeholder = "0.00",
  disabled,
  id,
  allowNegative = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  allowNegative?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const shown = formatAmountText(value);
  // shrink the type as the number gets longer; the box itself stays the same size
  const size = shown.length > 22 ? "text-[11px]" : shown.length > 18 ? "text-xs" : shown.length > 14 ? "text-sm" : "text-base";
  return (
    <div className={cn("relative min-w-[11rem]", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">Rs</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel}
        value={shown}
        placeholder={placeholder}
        onChange={(e) => onChange(cleanAmountText(e.target.value, allowNegative))}
        onBlur={() => {
          // tidy a trailing dot or a lone minus when the person leaves the field
          if (value.endsWith(".")) onChange(value.slice(0, -1));
          else if (value === "-") onChange("");
        }}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-right font-mono tabular-nums shadow-xs outline-none transition-[color,box-shadow,font-size]",
          "placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          size,
        )}
      />
    </div>
  );
}
