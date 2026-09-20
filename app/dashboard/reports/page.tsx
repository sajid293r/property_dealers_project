"use client";

import { ComingSoon } from "@/components/coming-soon";
import { FileText } from "lucide-react";

export default function ReportsPage() {
  return (
    <ComingSoon
      title="Reports"
      description="Income statements, profit reports and exportable financial statements"
      icon={FileText}
      tier="moderate"
    />
  );
}
