"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/providers/auth-provider";
import { useCompany } from "@/lib/providers/company-provider";
import { useT } from "@/lib/i18n/provider";
import { BookingDoc, ContractDoc, PayslipDoc, QuotationDoc, ReceiptDoc, ServiceInvoiceDoc, StatementDoc, VoucherDoc } from "@/components/live/print-docs";

function Printable() {
  const t = useT();
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const line = useSearchParams().get("line") ?? "";
  const router = useRouter();
  const { status } = useAuth();
  const { live, ready } = useCompany();

  React.useEffect(() => {
    if (status === "signedOut") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || status === "signedOut" || (live && !ready)) return <p className="py-20 text-center text-neutral-500">{t("print.opening")}</p>;
  if (!live) return <p className="py-20 text-center text-neutral-500">{t("print.realOnly")}</p>;

  switch (kind) {
    case "receipt": return <ReceiptDoc id={id} />;
    case "voucher": return <VoucherDoc id={id} />;
    case "service-invoice": return <ServiceInvoiceDoc id={id} />;
    case "booking": return <BookingDoc id={id} />;
    case "statement": return <StatementDoc id={id} />;
    case "quotation": return <QuotationDoc id={id} />;
    case "contract": return <ContractDoc id={id} />;
    case "payslip": return <PayslipDoc id={id} lineId={line} />;
    default: return <p className="py-20 text-center text-neutral-500">{t("print.unknown")}</p>;
  }
}

export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <Printable />
    </Suspense>
  );
}
