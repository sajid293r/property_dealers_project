import { Card } from "@/components/ui/card";
import { formatPkr } from "@/lib/format";
import { lineTotals } from "@/lib/vouchers";
import type { VoucherLine } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VoucherSummaryPanel({ lines }: { lines: VoucherLine[] }) {
  const { debit, credit, difference } = lineTotals(lines);
  const hasAmounts = debit > 0 || credit > 0;
  const balanced = difference === 0 && hasAmounts;

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Voucher Summary</h3>
      <dl className="space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Debit</dt>
          <dd className="tabular-nums font-medium">{formatPkr(debit)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Credit</dt>
          <dd className="tabular-nums font-medium">{formatPkr(credit)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
          <dt className="text-muted-foreground">Difference</dt>
          <dd className={cn("tabular-nums font-semibold", difference === 0 ? "text-success" : "text-destructive")}>
            {formatPkr(Math.abs(difference))}
          </dd>
        </div>
      </dl>
      {!balanced && (
        <p className="mt-3 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs leading-relaxed text-warning">
          {hasAmounts
            ? "Debit and credit must be equal before this voucher can be submitted."
            : "Add at least two lines to balance this voucher."}
        </p>
      )}
    </Card>
  );
}
