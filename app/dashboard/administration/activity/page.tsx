"use client";

import { LiveAudit } from "@/components/live/audit-live";
import { useCompany } from "@/lib/providers/company-provider";
import { useT } from "@/lib/i18n/provider";

export default function ActivityPage() {
  const t = useT();
  const { live } = useCompany();
  if (!live) return <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">{t("audit.demoNote")}</div>;
  return <LiveAudit />;
}
