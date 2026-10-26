"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Languages, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/dialogs/form-dialog";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/providers/auth-provider";
import { useCompany } from "@/lib/providers/company-provider";
import { LANGUAGES, languageInfo } from "@/lib/i18n/config";
import { useLanguage } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Me {
  user: { id: string; email: string | null; fullName: string; language: string | null };
  companies: { companyId: string; name: string; role: string; plan: string }[];
}

export default function AccountPage() {
  const { live, company } = useCompany();
  const { changePassword, signOut } = useAuth();
  const { t, lang, setLanguage, adoptCompanyDefault, savedLanguage } = useLanguage();
  const me = useQuery({ queryKey: ["live", "me"], queryFn: () => api<Me>("/v1/me"), enabled: live, staleTime: 30_000 });
  const [name, setName] = React.useState<string | null>(null);
  const [pw, setPw] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (!live) {
    return <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">{t("account.demoNotice")}</div>;
  }

  async function saveName() {
    setBusy(true);
    try {
      await api("/v1/me", { method: "PATCH", body: { fullName: (name ?? me.data?.user.fullName ?? "").trim() } });
      await me.refetch();
      setName(null);
      toast.success(t("account.nameSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (pw.length < 8) return toast.error(t("account.passwordShort"));
    if (pw !== again) return toast.error(t("account.passwordMismatch"));
    setBusy(true);
    const r = await changePassword(pw);
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    setPw("");
    setAgain("");
    toast.success(t("account.passwordChanged"));
  }

  const companyDefault = company.defaultLanguage;
  // the person has chosen nothing of their own: the company's default applies
  const usingDefault = savedLanguage === null && !!companyDefault;

  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <PageHeader icon={UserRound} eyebrow={t("account.eyebrow")} title={t("account.title")} description={t("account.description")} />
      {me.isLoading || !me.data ? <Skeleton className="h-72 rounded-xl" /> : (
        <>
          <Card className="space-y-4 p-5">
            <h3 className="font-heading text-base font-semibold">{t("account.profile")}</h3>
            <Field label={t("account.yourName")}><Input value={name ?? me.data.user.fullName} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
            <Field label={t("account.emailField")}><Input dir="ltr" className="text-start" value={me.data.user.email ?? ""} disabled /></Field>
            <div className="flex justify-end"><Button disabled={busy || name === null || name.trim().length < 2} onClick={() => void saveName()}>{t("account.saveName")}</Button></div>
            <div className="border-t border-border/60 pt-3 text-sm text-muted-foreground">
              {me.data.companies.map((c) => <p key={c.companyId}>{c.name} — {c.role}</p>)}
            </div>
          </Card>
          <Card className="space-y-4 p-5">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><Languages className="size-4" /> {t("account.language.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("account.language.help")}</p>
            <div role="radiogroup" aria-label={t("account.language.title")} className="grid gap-2 sm:grid-cols-2">
              {LANGUAGES.map((l) => {
                const active = l.code === lang && !usingDefault;
                return (
                  <button
                    key={l.code}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    lang={l.code}
                    dir={l.dir}
                    onClick={() => void setLanguage(l.code).then(() => toast.success(t("account.language.saved")))}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start text-sm font-medium transition-all hover:border-gold/50 hover:shadow-sm",
                      active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/70",
                    )}
                  >
                    <span>{l.native}</span>
                    <span className="text-xs font-normal text-muted-foreground" lang="en" dir="ltr">{l.english}</span>
                  </button>
                );
              })}
            </div>
            {companyDefault && (
              <Button variant={usingDefault ? "secondary" : "ghost"} className="w-full justify-start" onClick={() => void adoptCompanyDefault()}>
                {t("account.language.companyDefault", { language: languageInfo(companyDefault).native })}
              </Button>
            )}
          </Card>
          <Card className="space-y-4 p-5">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><KeyRound className="size-4" /> {t("account.changePassword")}</h3>
            <Field label={t("account.newPassword")}><Input type="password" dir="ltr" className="text-start" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label={t("account.typeAgain")}><Input type="password" dir="ltr" className="text-start" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => void signOut()}>{t("common.signOut")}</Button>
              <Button disabled={busy || !pw || !again} onClick={() => void savePassword()}>{t("account.changePassword")}</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
