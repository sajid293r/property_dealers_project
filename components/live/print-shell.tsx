"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/lib/providers/company-provider";
import { fetchCompanyProfile } from "@/lib/api/modules";
import { useT } from "@/lib/i18n/provider";

/**
 * The frame every printed document shares: the company's name and details on top, a title with the document number,
 * the body, and signature lines at the bottom. On screen it is a white A4-width sheet with Print / Close buttons;
 * the buttons disappear when printing, and "Save as PDF" in the print dialog gives a PDF.
 */
export function PrintShell({
  title,
  number,
  date,
  signatures,
  children,
  ready = true,
}: {
  title: string;
  number?: string;
  date?: string;
  signatures?: string[];
  children: React.ReactNode;
  /** Print automatically once everything has loaded. */
  ready?: boolean;
}) {
  const t = useT();
  const sigs = signatures ?? [t("print.sig.preparedBy"), t("print.sig.checkedBy"), t("print.sig.receivedBy")];
  const { company } = useCompany();
  const profile = useQuery({ queryKey: ["live", "company-profile"], queryFn: () => fetchCompanyProfile(company.id), staleTime: 60_000 });
  const p = profile.data;

  React.useEffect(() => {
    if (!ready || !p) return;
    const t = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(t);
  }, [ready, p]);

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[794px] justify-end gap-2 px-4 print:hidden">
        <Button onClick={() => window.print()} className="gap-1.5"><Printer className="size-4" /> {t("print.button")}</Button>
        <Button variant="outline" onClick={() => window.close()} className="gap-1.5"><X className="size-4" /> {t("common.close")}</Button>
      </div>
      <article className="mx-auto min-h-[1000px] max-w-[794px] bg-white p-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-800 pb-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">{p?.name ?? company.name}</h1>
            <p className="mt-1 text-neutral-600">{[p?.address, p?.city].filter(Boolean).join(", ")}</p>
            <p className="text-neutral-600">{[p?.phone && t("print.tel", { phone: p.phone }), p?.email, p?.ntn && t("print.ntn", { ntn: p.ntn }), p?.strn && t("print.strn", { strn: p.strn })].filter(Boolean).join("  ·  ")}</p>
          </div>
          <div className="text-end">
            <p className="font-heading text-xl font-semibold uppercase tracking-wide">{title}</p>
            {number && <p className="font-mono text-base">{number}</p>}
            {date && <p className="text-neutral-600">{date}</p>}
          </div>
        </header>
        <div className="py-5">{children}</div>
        {sigs.length > 0 && (
          <footer className="mt-16 grid gap-6" style={{ gridTemplateColumns: `repeat(${sigs.length}, minmax(0, 1fr))` }}>
            {sigs.map((s) => (
              <div key={s} className="border-t border-neutral-500 pt-1 text-center text-xs text-neutral-600">{s}</div>
            ))}
          </footer>
        )}
        <p className="mt-8 text-center text-[10px] text-neutral-400 print:fixed print:bottom-2 print:start-0 print:end-0">{t("print.generated", { company: company.name })}</p>
      </article>
    </div>
  );
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="font-medium">{children || "—"}</p>
    </div>
  );
}

export function PrintTable({ head, rows, right = [], foot }: { head: string[]; rows: React.ReactNode[][]; right?: number[]; foot?: React.ReactNode[] }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="border-y border-neutral-800 bg-neutral-50">
          {head.map((h, i) => <th key={h} className={`px-2 py-1.5 font-semibold ${right.includes(i) ? "text-end" : "text-start"}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-neutral-200">
            {r.map((c, j) => <td key={j} className={`px-2 py-1.5 ${right.includes(j) ? "text-end font-mono tabular-nums" : ""}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
      {foot && (
        <tfoot>
          <tr className="border-t-2 border-neutral-800 font-semibold">
            {foot.map((c, j) => <td key={j} className={`px-2 py-1.5 ${right.includes(j) ? "text-end font-mono tabular-nums" : ""}`}>{c}</td>)}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
