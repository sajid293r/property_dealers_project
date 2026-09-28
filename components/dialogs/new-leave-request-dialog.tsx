"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Palmtree } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaff, useLeaveRequests } from "@/lib/hooks/use-data";
import { LEAVE_TYPES, daysBetween, leaveBalance } from "@/lib/payroll";
import { dateOffsetFromToday } from "@/lib/format";
import type { LeaveRequest, LeaveType } from "@/lib/types";
import { toast } from "sonner";

export function NewLeaveRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: staff } = useStaff();
  const { data: leaveRequests } = useLeaveRequests();

  const [staffId, setStaffId] = React.useState("");
  const [type, setType] = React.useState<LeaveType>("Casual");
  const [fromDate, setFromDate] = React.useState(() => dateOffsetFromToday(1));
  const [toDate, setToDate] = React.useState(() => dateOffsetFromToday(1));
  const [reason, setReason] = React.useState("");

  const member = staff?.find((s) => s.id === staffId);
  const days = daysBetween(fromDate, toDate);
  const balance = member ? leaveBalance(leaveRequests ?? [], member.id, type, fromDate) : undefined;

  function resetForm() {
    setStaffId("");
    setType("Casual");
    setFromDate(dateOffsetFromToday(1));
    setToDate(dateOffsetFromToday(1));
    setReason("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function handleSubmit() {
    const today = new Date().toISOString().slice(0, 10);
    const newRequest: LeaveRequest = {
      id: `leave-${Date.now()}`,
      staffId,
      type,
      fromDate,
      toDate,
      days,
      reason,
      status: "pending",
      createdAt: today,
    };

    queryClient.setQueryData<LeaveRequest[]>(["leaveRequests"], (old = []) => [newRequest, ...old]);
    toast.success(`Leave request submitted for ${member?.name}`, { description: `${days} day${days > 1 ? "s" : ""} — awaiting approval` });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      icon={Palmtree}
      title="New Leave Request"
      description="Request time off on behalf of a staff member."
      submitLabel="Submit Request"
      submitDisabled={!staffId || !fromDate || !toDate || fromDate > toDate}
      onSubmit={handleSubmit}
    >
      <FieldRow>
        <Field label="Staff member">
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select staff" /></SelectTrigger>
            <SelectContent>
              {staff?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name} · {s.department}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Leave type">
          <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAVE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="From">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
      </FieldRow>

      <Field label="Reason">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional notes..." rows={2} />
      </Field>

      {member && fromDate <= toDate && (
        <p className="text-xs text-muted-foreground">
          {days} day{days > 1 ? "s" : ""} ·{" "}
          {balance === undefined || !Number.isFinite(balance) ? (
            "no annual cap for unpaid leave"
          ) : (
            <>
              <span className={balance - days < 0 ? "font-medium text-destructive" : "font-medium text-foreground"}>
                {balance - days}
              </span>{" "}
              {type.toLowerCase()} days remaining after this request
            </>
          )}
        </p>
      )}
    </FormDialog>
  );
}
