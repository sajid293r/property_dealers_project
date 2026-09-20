import { cn } from "@/lib/utils";

/**
 * Shared decorative backdrop — a dot grid with a few "plots" picked out in the
 * brand/gold colors, echoing the plot-map product feature. Used as a subtle
 * watermark behind hero, CTA and highlighted-pricing surfaces instead of a
 * plain dot pattern, so those surfaces read as the same product everywhere.
 */
export function PlotGridMotif({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "inverted";
}) {
  const cellColor = variant === "inverted" ? "white" : "var(--border)";
  const marks =
    variant === "inverted"
      ? ["rgba(255,255,255,0.35)", "rgba(255,255,255,0.2)"]
      : ["var(--primary)", "var(--gold)"];

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-20 overflow-hidden", className)}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(${cellColor} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
          maskImage: "radial-gradient(60% 55% at 50% 30%, black 0%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(60% 55% at 50% 30%, black 0%, transparent 100%)",
        }}
      />
      <span
        className="absolute left-[38%] top-[18%] size-[22px] rounded-[3px] opacity-[0.14]"
        style={{ backgroundColor: marks[0] }}
      />
      <span
        className="absolute left-[58%] top-[34%] size-[22px] rounded-[3px] opacity-[0.16]"
        style={{ backgroundColor: marks[1] }}
      />
      <span
        className="absolute left-[46%] top-[46%] size-[22px] rounded-[3px] opacity-[0.1]"
        style={{ backgroundColor: marks[0] }}
      />
    </div>
  );
}
