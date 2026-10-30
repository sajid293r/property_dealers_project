"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { FormDialog, Field } from "@/components/dialogs/form-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

/** Asks for a reason (and optionally a date) before something that cannot be undone, like voiding or rejecting. */
export function ReasonDialog({
  open,
  onOpenChange,
  icon,
  title,
  description,
  submitLabel,
  reasonLabel,
  dateLabel,
  minLength = 3,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  title: string;
  description: string;
  submitLabel: string;
  reasonLabel?: string;
  /** When given, also asks for a date (for example the date a voided voucher is reversed on). */
  dateLabel?: string;
  minLength?: number;
  onSubmit: (reason: string, date: string) => Promise<void>;
}) {
  const t = useT();
  const [reason, setReason] = React.useState("");
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason("");
        onOpenChange(o);
      }}
      icon={icon}
      title={title}
      description={description}
      submitLabel={submitLabel}
      submitDisabled={reason.trim().length < minLength}
      onSubmit={async () => {
        await onSubmit(reason.trim(), date);
        setReason("");
      }}
    >
      <Field label={reasonLabel ?? t("common.reason")}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder={t("common.reasonPlaceholder")} />
      </Field>
      {dateLabel && (
        <Field label={dateLabel}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
    </FormDialog>
  );
}
