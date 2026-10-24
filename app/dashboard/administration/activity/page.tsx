"use client";

import { LiveAudit } from "@/components/live/audit-live";
import { useCompany } from "@/lib/providers/company-provider";

export default function ActivityPage() {
  const { live } = useCompany();
  if (!live) return <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">The activity log records the real changes in your company. Sign in to see it.</div>;
  return <LiveAudit />;
}
