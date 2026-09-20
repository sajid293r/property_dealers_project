"use client";

import { ComingSoon } from "@/components/coming-soon";
import { Banknote } from "lucide-react";

export default function PayrollPage() {
  return (
    <ComingSoon
      title="Payroll"
      description="Salary disbursement, loans and advances tied to each staff ledger"
      icon={Banknote}
      tier="moderate"
    />
  );
}
