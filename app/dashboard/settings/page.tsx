"use client";

import { Settings as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { ArrowRight, ClipboardList, CreditCard, UserCog, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PLAN_LABEL } from "@/lib/plan";
import { usePlanTier } from "@/lib/providers/plan-provider";

export default function SettingsPage() {
  const { tier } = usePlanTier();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow="Configuration"
        title="Settings"
        description="Account, billing and administration shortcuts"
      />

      <SettingsLink
        href="/dashboard/administration/company-profile"
        icon={ClipboardList}
        title="Company profile"
        description="Legal details, branding and regional preferences"
      />

      <SettingsLink
        href="/dashboard/administration/users"
        icon={UserCog}
        title="User management"
        description="Invite teammates, manage logins and assign roles"
      />

      <SettingsLink
        href="/dashboard/administration/roles"
        icon={UserCog}
        title="Roles & permissions"
        description="Configure per-module view/create/edit/delete/approve access"
      />

      <Link href="/dashboard/settings/billing" className="group block">
        <Card className="flex-row items-center justify-between p-5 shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-gold/[0.08] group-hover:ring-gold/40">
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
    </div>
  );
}

function SettingsLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="flex-row items-center justify-between p-5 shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-primary/[0.08] group-hover:ring-gold/40">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="size-4.5" />
          </div>
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <ArrowRight className="size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground" />
      </Card>
    </Link>
  );
}
