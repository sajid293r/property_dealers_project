"use client";

import { useCompany } from "@/lib/providers/company-provider";
import { LiveVoucherForm } from "@/components/live/voucher-form";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NewVoucherForm } from "@/components/vouchers/new-voucher-form";

function NewVoucherFallback() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

function DemoNewVoucherPage() {
  return (
    <Suspense fallback={<NewVoucherFallback />}>
      <NewVoucherForm />
    </Suspense>
  );
}

export default function Page() {
  const { live } = useCompany();
  return live ? <Suspense fallback={null}><LiveVoucherForm /></Suspense> : <DemoNewVoucherPage />;
}
