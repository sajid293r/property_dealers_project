import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Keeps a run of text left to right inside right-to-left text: amounts, CNIC and phone numbers, emails,
 * codes (PRP-1042), percentages, numeric dates, file names. Without it, "Rs 4.5M" or "PRP-1042" can come out
 * with the pieces in the wrong order in Urdu, Pashto or Arabic.
 */
export function Ltr({ children, className, as: Tag = "bdi" }: { children: React.ReactNode; className?: string; as?: "bdi" | "span" | "div" }) {
  return (
    <Tag dir="ltr" className={cn("[unicode-bidi:isolate]", className)}>
      {children}
    </Tag>
  );
}
