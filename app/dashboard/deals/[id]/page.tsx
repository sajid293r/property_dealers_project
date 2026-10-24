"use client";

import Link from "next/link";
import { Handshake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LiveBookingDetail } from "@/components/live/booking-detail";
import { useCompany } from "@/lib/providers/company-provider";

export default function BookingDetailPage() {
  const { live } = useCompany();
  if (!live) {
    return (
      <div className="mx-auto max-w-[700px] pt-10">
        <Card className="p-10 text-center">
          <Handshake className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Booking details are available for real companies</p>
          <p className="mt-1 text-sm text-muted-foreground"><Link href="/dashboard/deals" className="text-primary underline">Back to deals</Link></p>
        </Card>
      </div>
    );
  }
  return <LiveBookingDetail />;
}
