"use client";

import Link from "next/link";
import { ArrowRight, CreditCard, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PLAN_LABEL } from "@/lib/plan";
import { usePlanTier } from "@/lib/providers/plan-provider";

export default function SettingsPage() {
  const { tier } = usePlanTier();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Company profile and account preferences</p>
      </div>

      <Card className="space-y-5 p-6">
        <h3 className="font-heading text-base font-semibold">Company profile</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Company name" defaultValue="Al-Noor Estate Advisors" />
          <Field label="Display name" defaultValue="Al-Noor Estates" />
          <Field label="Phone" defaultValue="042-111-000-999" />
          <Field label="NTN" defaultValue="1234567-8" />
          <Field label="Address" defaultValue="Plot 12, MM Alam Road, Lahore" className="sm:col-span-2" />
        </div>
        <Button className="mt-1">Save changes</Button>
      </Card>

      <Link href="/dashboard/settings/billing" className="group block">
        <Card className="flex items-center justify-between p-5 shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-gold/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gold/15 text-gold transition-colors duration-300 group-hover:bg-gold group-hover:text-gold-foreground">
              <CreditCard className="size-4.5" />
            </div>
            <div>
              <p className="font-medium">Billing &amp; subscription</p>
              <p className="text-xs text-muted-foreground">
                Currently on the <span className="font-medium text-foreground">{PLAN_LABEL[tier]}</span> plan
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground" />
        </Card>
      </Link>

      <Card className="flex items-center justify-between p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Shield className="size-4.5" />
          </div>
          <div>
            <p className="font-medium">Roles &amp; permissions</p>
            <p className="text-xs text-muted-foreground">
              Configure per-module create/read/update/delete access — Moderate plan and above
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  defaultValue,
  className,
}: {
  label: string;
  defaultValue: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 text-xs font-medium text-muted-foreground">{label}</Label>
      <Input defaultValue={defaultValue} />
    </div>
  );
}
