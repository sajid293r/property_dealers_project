import { companyInitials, type Company } from "@/lib/companies";
import { cn } from "@/lib/utils";

/** Square monogram tile tinted with the company's accent color. */
export function CompanyAvatar({
  company,
  className,
}: {
  company: Pick<Company, "name" | "accent">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center rounded-xl font-heading text-sm font-semibold text-white shadow-md ring-1 ring-white/20",
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${company.accent}, color-mix(in oklch, ${company.accent}, black 35%))`,
      }}
    >
      <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/25 to-transparent" />
      <span className="relative">{companyInitials(company.name)}</span>
    </span>
  );
}
