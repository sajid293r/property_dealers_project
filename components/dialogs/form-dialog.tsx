"use client";

import * as React from "react";
import { Loader2, X, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PlotGridMotif } from "@/components/plot-grid-motif";
import { cn } from "@/lib/utils";

/**
 * Shared "create new record" dialog shell: a fixed brand-green header band
 * (not the theme-adaptive --primary token, which flips lightness in dark
 * mode — this stays a consistent dark surface with white text in both
 * themes) plus a standard body/footer. Individual dialogs supply the fields.
 */
export function FormDialog({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  submitLabel,
  onSubmit,
  submitDisabled,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  children: React.ReactNode;
}) {
  const [submitting, setSubmitting] = React.useState(false);

  function handleSubmit() {
    setSubmitting(true);
    window.setTimeout(() => {
      onSubmit();
      setSubmitting(false);
      onOpenChange(false);
    }, 500);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-md" showCloseButton={false}>
        <div
          className="relative isolate overflow-hidden px-6 pb-6 pt-7"
          style={{ background: "linear-gradient(135deg, oklch(0.33 0.06 162), oklch(0.24 0.045 165))" }}
        >
          <PlotGridMotif variant="inverted" className="opacity-60" />
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-3 top-3 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <span className="sr-only">Close</span>
              <X className="size-4" />
            </Button>
          </DialogClose>
          <div className="relative flex items-start gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold ring-1 ring-gold/30 backdrop-blur-sm">
              <Icon className="size-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <DialogTitle className="text-base font-semibold text-white">{title}</DialogTitle>
              <DialogDescription className="mt-0.5 text-[13px] text-white/70">
                {description}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">{children}</div>

        <DialogFooter className="mx-0 mb-0 rounded-b-xl border-t border-border bg-muted/40 px-6 py-4">
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitDisabled || submitting} className="gap-1.5">
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {submitting ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FieldRow({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid grid-cols-2 gap-3", className)}>{children}</div>;
}

export function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
