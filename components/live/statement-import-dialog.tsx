"use client";

import * as React from "react";
import { FileSpreadsheet } from "lucide-react";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AmountInput } from "@/components/live/amount-input";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance } from "@/lib/hooks/use-live";
import { createStatement, type NewStatementInput } from "@/lib/api/finance";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";

const cleanAmount = (s: string) => s.replace(/[",\s]/g, "").replace(/^\((.*)\)$/, "-$1");

function toIso(raw: string): string | null {
  const t = raw.trim().replace(/"/g, "");
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return t;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Splits one line of a pasted statement on commas or tabs, keeping quoted text together. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if ((ch === "," && !quoted) || ch === "\t") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Turns pasted rows into statement lines. Expected columns, in order:
 * date, description, reference, deposit (money in), withdrawal (money out), optional balance.
 */
export function parseStatementText(text: string): { lines: NonNullable<NewStatementInput["lines"]>; skipped: number } {
  const lines: NonNullable<NewStatementInput["lines"]> = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const c = cells(raw);
    const date = toIso(c[0] ?? "");
    if (!date) {
      skipped++;
      continue;
    }
    const deposit = cleanAmount(c[3] ?? "");
    const withdrawal = cleanAmount(c[4] ?? "");
    const balance = cleanAmount(c[5] ?? "");
    lines.push({
      date,
      description: c[1] || undefined,
      reference: c[2] || undefined,
      deposit: deposit && !Number.isNaN(Number(deposit)) ? deposit : "0",
      withdrawal: withdrawal && !Number.isNaN(Number(withdrawal)) ? withdrawal : "0",
      balance: balance && !Number.isNaN(Number(balance)) ? balance : undefined,
    });
  }
  return { lines, skipped };
}

/** Enter a bank statement by pasting its rows (from the bank's Excel or CSV download). */
export function StatementImportDialog({
  open,
  onOpenChange,
  bankAccountId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bankAccountId: string;
  onCreated?: (id: string) => void;
}) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [opening, setOpening] = React.useState("");
  const [closing, setClosing] = React.useState("");
  const [text, setText] = React.useState("");
  const parsed = React.useMemo(() => parseStatementText(text), [text]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={FileSpreadsheet}
      title={t("stmt.title")}
      description={t("stmt.description")}
      submitLabel={t("stmt.submit")}
      submitDisabled={!from || !to || opening === "" || closing === "" || parsed.lines.length === 0}
      onSubmit={async () => {
        const r = await createStatement(company.id, bankAccountId, {
          periodFrom: from,
          periodTo: to,
          openingBalance: opening,
          closingBalance: closing,
          source: "manual",
          lines: parsed.lines,
        });
        await invalidate();
        toast.success(r.linesAddUp ? t("stmt.saved") : t("stmt.savedMismatch"));
        onCreated?.(r.id);
        setText("");
      }}
    >
      <FieldRow>
        <Field label={t("stmt.from")}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t("stmt.to")}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </FieldRow>
      <FieldRow>
        <Field label={t("stmt.opening")}><AmountInput value={opening} onChange={setOpening} allowNegative /></Field>
        <Field label={t("stmt.closing")}><AmountInput value={closing} onChange={setClosing} allowNegative /></Field>
      </FieldRow>
      <Field label={t("stmt.rows")}>
        <Textarea
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-xs"
          placeholder={"2026-09-02, Cheque 000123 Al-Noor Traders, 000123, 0, 150000\n2026-09-05, Online transfer from Ali, TRF9981, 75000, 0"}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        {parsed.skipped ? t("stmt.infoSkipped", { count: parsed.lines.length, skipped: parsed.skipped }) : t("stmt.info", { count: parsed.lines.length })}
      </p>
    </FormDialog>
  );
}
