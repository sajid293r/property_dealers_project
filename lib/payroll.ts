import { Gift, HandCoins, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { LeaveRequest, LeaveType, PayrollAdjustment, PayrollAdjustmentType } from "@/lib/types";

export interface AdjustmentTypeMeta {
  type: PayrollAdjustmentType;
  label: string;
  icon: LucideIcon;
  /** Whether it raises (+) or lowers (-) net payable. */
  direction: "credit" | "debit";
  accent: "success" | "destructive" | "gold" | "primary";
}

export const ADJUSTMENT_TYPES: AdjustmentTypeMeta[] = [
  { type: "increment", label: "Increment", icon: TrendingUp, direction: "credit", accent: "success" },
  { type: "allowance", label: "Allowance", icon: Gift, direction: "credit", accent: "gold" },
  { type: "deduction", label: "Deduction", icon: TrendingDown, direction: "debit", accent: "destructive" },
  { type: "loan", label: "Loan / Advance", icon: HandCoins, direction: "debit", accent: "primary" },
];

export function adjustmentTypeMeta(type: PayrollAdjustmentType) {
  return ADJUSTMENT_TYPES.find((t) => t.type === type)!;
}

export const ALLOWANCE_CATEGORIES = ["Fuel Allowance", "Medical Allowance", "Housing Allowance", "Bonus", "Other"] as const;
export const DEDUCTION_REASONS = ["Late arrivals", "Unpaid leave", "Uniform / equipment", "Policy violation", "Other"] as const;

/** Net effect of a staff member's currently-approved (not yet disbursed) adjustments. */
export function netAdjustmentTotal(adjustments: PayrollAdjustment[], staffId: string) {
  return adjustments
    .filter((a) => a.staffId === staffId && a.status === "approved" && a.type !== "increment")
    .reduce((sum, a) => {
      const meta = adjustmentTypeMeta(a.type);
      return sum + (meta.direction === "credit" ? a.amount : -a.amount);
    }, 0);
}

export const LEAVE_TYPES: LeaveType[] = ["Casual", "Sick", "Annual", "Unpaid"];

/** Fixed annual entitlement per leave type — a real build would make this configurable per company policy. */
export const LEAVE_ENTITLEMENT: Record<LeaveType, number> = {
  Casual: 10,
  Sick: 8,
  Annual: 14,
  Unpaid: Infinity,
};

export function daysBetween(fromDate: string, toDate: string) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
}

/** Days of `type` already approved for `staffId` in the same calendar year as `asOfDate`. */
export function leaveTakenThisYear(
  requests: LeaveRequest[],
  staffId: string,
  type: LeaveType,
  asOfDate: string,
) {
  const year = new Date(asOfDate).getFullYear();
  return requests
    .filter(
      (r) =>
        r.staffId === staffId &&
        r.type === type &&
        r.status === "approved" &&
        new Date(r.fromDate).getFullYear() === year,
    )
    .reduce((sum, r) => sum + r.days, 0);
}

export function leaveBalance(
  requests: LeaveRequest[],
  staffId: string,
  type: LeaveType,
  asOfDate: string,
) {
  const entitlement = LEAVE_ENTITLEMENT[type];
  if (!Number.isFinite(entitlement)) return Infinity;
  return entitlement - leaveTakenThisYear(requests, staffId, type, asOfDate);
}
