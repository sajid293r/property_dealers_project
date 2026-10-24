"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { LivePropertyDetail } from "@/components/live/property-detail";
import { useCompany } from "@/lib/providers/company-provider";

export default function PropertyDetailPage() {
  const { live } = useCompany();
  if (!live) {
    return (
      <div className="mx-auto max-w-[700px] pt-10">
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Property details are kept for real companies. <Link href="/dashboard/properties" className="text-primary underline">Back to properties</Link>
        </Card>
      </div>
    );
  }
  return <LivePropertyDetail />;
}
