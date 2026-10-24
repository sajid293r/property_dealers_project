"use client";

import * as React from "react";
import { CalendarClock } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountInput } from "@/components/live/amount-input";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance } from "@/lib/hooks/use-live";
import { buildSchedule } from "@/lib/api/sales";
import { num } from "@/lib/api/finance";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

/** Set up the payment plan: a down payment, then equal installments. The total always equals the price. */
export function ScheduleDialog({ open, onOpenChange, bookingId, netPrice }: { open: boolean; onOpenChange: (o: boolean) => void; bookingId: string; netPrice: number }) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [down, setDown] = React.useState("");
  const [count, setCount] = React.useState("12");
  const [interval, setIntervalMonths] = React.useState("1");
  const [first, setFirst] = React.useState("");
  const [balloon, setBalloon] = React.useState("");

  const n = Math.max(Number(count) || 0, 0);
  const rest = netPrice - num(down) - num(balloon);
  const each = n > 0 ? rest / n : 0;
  const invalid = rest < 0 || (n === 0 && rest !== 0) || (n > 0 && !first);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={CalendarClock}
      title="Payment plan"
      description="The plan always adds up to exactly the price. Any rounding paisa goes into the last installment."
      submitLabel="Create plan"
      submitDisabled={invalid}
      onSubmit={async () => {
        await buildSchedule(company.id, bookingId, {
          downPayment: down || "0",
          installments: n,
          firstDue: first || undefined,
          intervalMonths: Number(interval),
          balloon: balloon || "0",
        });
        await invalidate();
        toast.success("Payment plan created");
      }}
    >
      <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">Price to be paid: <span className="font-mono font-medium">{formatMoney(netPrice)}</span></div>
      <Field label="Down payment"><AmountInput value={down} onChange={setDown} /></Field>
      <FieldRow>
        <Field label="Number of installments"><Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 3))} /></Field>
        <Field label="Every">
          <Select value={interval} onValueChange={setIntervalMonths}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Month</SelectItem>
              <SelectItem value="2">2 months</SelectItem>
              <SelectItem value="3">3 months (quarterly)</SelectItem>
              <SelectItem value="6">6 months</SelectItem>
              <SelectItem value="12">Year</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>
      <Field label="First installment due"><Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
      <Field label="Balloon payment at the end (optional)"><AmountInput value={balloon} onChange={setBalloon} /></Field>
      <div className="rounded-lg border border-border/70 px-3 py-2 text-sm">
        {rest < 0 ? (
          <span className="text-destructive">The down payment and balloon are more than the price.</span>
        ) : n > 0 ? (
          <>{n} installments of about <span className="font-mono font-medium">{formatMoney(each)}</span></>
        ) : (
          <span className="text-muted-foreground">With no installments, the down payment must be the whole price.</span>
        )}
      </div>
    </FormDialog>
  );
}
