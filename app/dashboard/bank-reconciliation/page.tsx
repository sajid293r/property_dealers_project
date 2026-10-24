"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LiveBankReconciliation } from "@/components/live/bank-reconciliation";
import { useCompany } from "@/lib/providers/company-provider";

export default function BankReconciliationPage() {
  const { live } = useCompany();
  if (!live) {
    return (
      <div className="mx-auto max-w-[700px] pt-10">
        <Card className="p-10 text-center">
          <Scale className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Bank reconciliation works with a real company</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Switch to your own company to reconcile real bank accounts. <Link href="/dashboard" className="text-primary underline">Back to dashboard</Link>
          </p>
        </Card>
      </div>
    );
  }
  return (
    <Suspense fallback={null}>
      <LiveBankReconciliation />
    </Suspense>
  );
}
