import type { LeaveRequest, LeaveStatus, LeaveType } from "@/lib/types";
import { mulberry32, range, pick, dateOffset } from "./seed";
import { staff } from "./staff";
import { daysBetween } from "@/lib/payroll";

const rand = mulberry32(9609);

const approvers = staff.filter((s) => s.role === "admin" || s.role === "manager");

const TYPE_WEIGHTS: readonly LeaveType[] = ["Casual", "Casual", "Sick", "Sick", "Annual", "Unpaid"];
const STATUS_WEIGHTS: readonly LeaveStatus[] = ["approved", "approved", "approved", "pending", "rejected"];

const REASONS: Record<LeaveType, string[]> = {
  Casual: ["Family event", "Personal errand", "Home relocation"],
  Sick: ["Fever", "Medical checkup", "Recovering from flu"],
  Annual: ["Family vacation", "Visiting hometown", "Umrah / religious trip"],
  Unpaid: ["Extended personal leave", "Visa / travel documentation"],
};

function buildRequest(startOffset: number, span: number): Omit<LeaveRequest, "id"> {
  const member = pick(rand, staff);
  const type = pick(rand, TYPE_WEIGHTS);
  const status = pick(rand, STATUS_WEIGHTS);
  const approver = pick(rand, approvers.length > 0 ? approvers : staff);
  const decided = status !== "pending";
  const fromDate = dateOffset(startOffset);
  const toDate = dateOffset(startOffset + span - 1);

  return {
    staffId: member.id,
    type,
    fromDate,
    toDate,
    days: daysBetween(fromDate, toDate),
    reason: pick(rand, REASONS[type]),
    status,
    createdAt: dateOffset(startOffset - 3),
    approvedBy: decided ? approver.name : undefined,
    approvedAt: decided ? dateOffset(startOffset - 1) : undefined,
  };
}

export const leaveRequests: LeaveRequest[] = [
  // A couple deliberately span "today" so the "on leave today" stat has real data.
  { id: "leave-1", ...buildRequest(-1, 4) },
  { id: "leave-2", ...buildRequest(-2, 6) },
  ...range(14).map((i) => {
    const startOffset = -60 + Math.floor(rand() * 80);
    const span = 1 + Math.floor(rand() * 5);
    return { id: `leave-${i + 3}`, ...buildRequest(startOffset, span) };
  }),
];
