"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Languages } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/dialogs/form-dialog";
import { saveCompanyProfile } from "@/lib/api/modules";
import { LANGUAGES, isLanguageCode, type LanguageCode } from "@/lib/i18n/config";
import { useT } from "@/lib/i18n/provider";
import { useCompany } from "@/lib/providers/company-provider";
import { usePermissions } from "@/lib/hooks/use-live";

const DEMO_KEY = "propiq-demo-default-language";

/**
 * "Default language for new users": the language people see until they choose their own (they can change theirs
 * under My account). Real company: saved on the company. Demo: kept in this browser only.
 */
export function CompanyLanguageCard({ saved }: { saved?: string | null }) {
  const t = useT();
  const { company, live, reloadAccount } = useCompany();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [demoValue, setDemoValue] = React.useState<string | null>(null);
  const editable = !live || can("administration.edit");

  // demo mode: remembered locally
  React.useEffect(() => {
    if (live) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDemoValue(window.localStorage.getItem(DEMO_KEY));
    } catch {
      /* private mode */
    }
  }, [live]);

  const current = live ? (isLanguageCode(saved) ? saved : "none") : (isLanguageCode(demoValue) ? demoValue : "none");

  async function change(v: string) {
    const code = v as LanguageCode;
    if (!live) {
      setDemoValue(code);
      try {
        window.localStorage.setItem(DEMO_KEY, code);
      } catch {
        /* private mode */
      }
      toast.success(t("admin.language.saved"));
      return;
    }
    try {
      await saveCompanyProfile(company.id, { defaultLanguage: code } as never);
      await queryClient.invalidateQueries({ queryKey: ["live", "company-profile"] });
      reloadAccount();
      toast.success(t("admin.language.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.couldNotSave"));
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><Languages className="size-4" /> {t("admin.language.title")}</h3>
      <Field label={t("admin.language.label")}>
        <Select value={current} onValueChange={(v) => void change(v)} disabled={!editable}>
          <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            {current === "none" && <SelectItem value="none" disabled>{t("admin.language.notSet")}</SelectItem>}
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code} lang={l.code}>{l.native} <span className="text-muted-foreground" lang="en">· {l.english}</span></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <p className="text-xs text-muted-foreground">{t("admin.language.help")}</p>
    </Card>
  );
}
