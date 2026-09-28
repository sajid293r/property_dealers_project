import type { PayrollAdjustment, PayrollAdjustmentStatus, PayrollAdjustmentType } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";
import { staff } from "./staff";
import { ALLOWANCE_CATEGORIES, DEDUCTION_REASONS } from "@/lib/payroll";

const rand = mulberry32(8508);

const approvers = staff.filter((s) => s.role === "admin" || s.role === "manager");

const TYPE_WEIGHTS: readonly PayrollAdjustmentType[] = [
  "allowance", "allowance", "allowance",
  "deduction", "deduction",
  "loan", "loan",
  "increment",
];

const STATUS_WEIGHTS: readonly PayrollAdjustmentStatus[] = ["approved", "approved", "approved", "pending", "rejected"];

export const payrollAdjustments: PayrollAdjustment[] = range(18).map((i) => {
  const member = pick(rand, staff);
  const type = pick(rand, TYPE_WEIGHTS);
  const status = pick(rand, STATUS_WEIGHTS);
  const daysAgo = 3 + Math.floor(rand() * 60);
  const approver = pick(rand, approvers.length > 0 ? approvers : staff);
  const decided = status !== "pending";

  let amount = 0;
  let reason = "";
  let previousSalary: number | undefined;
  let newSalary: number | undefined;

  if (type === "allowance") {
    reason = pick(rand, ALLOWANCE_CATEGORIES);
    amount = Math.round((3000 + rand() * 12000) / 500) * 500;
  } else if (type === "deduction") {
    reason = pick(rand, DEDUCTION_REASONS);
    amount = Math.round((1000 + rand() * 6000) / 500) * 500;
  } else if (type === "loan") {
    reason = "Salary advance";
    amount = Math.round((10000 + rand() * 60000) / 1000) * 1000;
  } else {
    reason = "Annual performance review";
    const increase = Math.round((5000 + rand() * 20000) / 1000) * 1000;
    previousSalary = member.salary - increase;
    newSalary = member.salary;
    amount = increase;
  }

  return {
    id: `padj-${i + 1}`,
    staffId: member.id,
    type,
    amount,
    reason,
    effectiveDate: dateOffset(-daysAgo),
    status,
    previousSalary,
    newSalary,
    createdBy: approver.name,
    createdAt: dateOffset(-daysAgo - 1),
    approvedBy: decided ? approver.name : undefined,
    approvedAt: decided ? dateOffset(-daysAgo + 1) : undefined,
  };
});
