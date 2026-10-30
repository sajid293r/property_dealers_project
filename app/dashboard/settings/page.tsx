"use client";

import { Settings as HeaderIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { ArrowRight, ClipboardList, CreditCard, UserCog, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import { usePlanTier } from "@/lib/providers/plan-provider";

export default function SettingsPage() {
  const t = useT();
  const { tier } = usePlanTier();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        icon={HeaderIcon}
        eyebrow={t("nav.section.configuration")}
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <SettingsLink
        href="/dashboard/administration/company-profile"
        icon={ClipboardList}
        title={t("adm.profile.title")}
        description={t("settings.profileDescription")}
      />

      <SettingsLink
        href="/dashboard/administration/users"
        icon={UserCog}
        title={t("settings.users")}
        description={t("settings.usersDescription")}
      />

      <SettingsLink
        href="/dashboard/administration/roles"
        icon={UserCog}
        title={t("adm.roles.title")}
        description={t("settings.rolesDescription")}
      />

      <Link href="/dashboard/settings/billing" className="group block">
        <Card className="flex-row items-center justify-between p-5 shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-gold/[0.08] group-hover:ring-gold/40">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gold/15 text-gold transition-colors duration-300 group-hover:bg-gold group-hover:text-gold-foreground">
              <CreditCard className="size-4.5" />
            </div>
            <div>
              <p className="font-medium">{t("billing.title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("settings.currentPlan", { plan: t(`plan.${tier}`) })}
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
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
        <ArrowRight className="size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
      </Card>
    </Link>
  );
}
