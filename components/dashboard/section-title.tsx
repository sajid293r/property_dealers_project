import * as React from "react";

/** Small labelled divider that groups dashboard widgets (Money, Sales, Operations …). */
export function SectionTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
        <h2 className="font-heading text-xl font-semibold">{title}</h2>
      </div>
      {right}
    </div>
  );
}

/** Standard card heading used by every widget. */
export function WidgetHead({ title, note, right }: { title: string; note?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {right}
    </div>
  );
}
