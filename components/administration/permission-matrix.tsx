"use client";

import { Check, Minus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  accessLevel,
  type ModuleKey,
  type PermissionAction,
  type PermissionMatrix as PermissionMatrixType,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";

const ACTION_ABBR: Record<PermissionAction, string> = {
  view: "V",
  create: "C",
  edit: "E",
  delete: "D",
  approve: "A",
};

/**
 * Module x action grid used both to display a role's rights read-only (Role
 * detail sheet, User detail sheet) and to build/edit a custom role (New Role
 * dialog). Pass `onChange` to make it interactive; omit it for a read-only view.
 */
export function PermissionMatrix({
  value,
  onChange,
  compact = false,
}: {
  value: PermissionMatrixType;
  onChange?: (next: PermissionMatrixType) => void;
  compact?: boolean;
}) {
  const readOnly = !onChange;

  function toggle(moduleKey: ModuleKey, action: PermissionAction) {
    if (!onChange) return;
    onChange({
      ...value,
      [moduleKey]: { ...value[moduleKey], [action]: !value[moduleKey][action] },
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full min-w-[340px] text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
            <th className={cn("font-medium", compact ? "py-2 pl-3" : "py-2.5 pl-4")}>Module</th>
            {PERMISSION_ACTIONS.map((action) => (
              <th
                key={action}
                title={action}
                className={cn("py-2 text-center font-medium capitalize", compact ? "w-8" : "w-14")}
              >
                {compact ? ACTION_ABBR[action] : action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MODULES.map((mod) => {
            const perm = value[mod.key];
            const level = accessLevel(perm);
            return (
              <tr key={mod.key} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className={cn("flex items-center gap-2", compact ? "py-2 pl-3" : "py-2.5 pl-4")}>
                  <mod.icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className={cn("whitespace-nowrap", level === "none" && "text-muted-foreground")}>
                    {mod.label}
                  </span>
                  {level === "full" && (
                    <span className="ml-1 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                      <Check className="size-2.5" />
                    </span>
                  )}
                </td>
                {PERMISSION_ACTIONS.map((action) => (
                  <td key={action} className="py-2 text-center">
                    {readOnly ? (
                      perm[action] ? (
                        <Check className="mx-auto size-3.5 text-success" />
                      ) : (
                        <Minus className="mx-auto size-3.5 text-muted-foreground/30" />
                      )
                    ) : (
                      <Checkbox
                        checked={perm[action]}
                        onCheckedChange={() => toggle(mod.key, action)}
                        aria-label={`${mod.label} — ${action}`}
                      />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
