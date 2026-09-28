import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ROLE_COLOR_CLASSES } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RoleBadge({
  role,
  showSystemIcon = false,
  className,
}: {
  role: UserRole;
  showSystemIcon?: boolean;
  className?: string;
}) {
  const palette = ROLE_COLOR_CLASSES[role.color];

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 border-transparent font-medium", palette.bg, palette.text, className)}
    >
      {showSystemIcon && role.isSystem && <ShieldCheck className="size-3" />}
      {role.name}
    </Badge>
  );
}
