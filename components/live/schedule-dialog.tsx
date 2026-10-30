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
import { useT } from "@/lib/i18n/provider";

/** Set up the payment plan: a down payment, then equal installments. The total always equals the price. */
export function ScheduleDialog({ open, onOpenChange, bookingId, netPrice }: { open: boolean; onOpenChange: (o: boolean) => void; bookingId: string; netPrice: number }) {
  const t = useT();
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
      title={t("deals.plan.title")}
      description={t("deals.plan.description")}
      submitLabel={t("deals.plan.submit")}
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
        toast.success(t("deals.plan.created"));
      }}
    >
      <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">{t("deals.plan.price")} <span className="font-mono font-medium">{formatMoney(netPrice)}</span></div>
      <Field label={t("deals.plan.down")}><AmountInput value={down} onChange={setDown} /></Field>
      <FieldRow>
        <Field label={t("deals.plan.count")}><Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 3))} /></Field>
        <Field label={t("deals.plan.every")}>
          <Select value={interval} onValueChange={setIntervalMonths}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t("deals.plan.month1")}</SelectItem>
              <SelectItem value="2">{t("deals.plan.month2")}</SelectItem>
              <SelectItem value="3">{t("deals.plan.month3")}</SelectItem>
              <SelectItem value="6">{t("deals.plan.month6")}</SelectItem>
              <SelectItem value="12">{t("deals.plan.month12")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>
      <Field label={t("deals.plan.first")}><Input type="date" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
      <Field label={t("deals.plan.balloon")}><AmountInput value={balloon} onChange={setBalloon} /></Field>
      <div className="rounded-lg border border-border/70 px-3 py-2 text-sm">
        {rest < 0 ? (
          <span className="text-destructive">{t("deals.plan.tooMuch")}</span>
        ) : n > 0 ? (
          <>{t("deals.plan.eachAbout", { count: n, amount: formatMoney(each) })}</>
        ) : (
          <span className="text-muted-foreground">{t("deals.plan.noInstallments")}</span>
        )}
      </div>
    </FormDialog>
  );
}
