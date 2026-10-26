"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/lib/brand";
import { supabase, liveConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/providers/auth-provider";
import { useT } from "@/lib/i18n/provider";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

/**
 * Where the link in the "reset your password" email lands. Supabase puts a short-lived sign-in in the address
 * (after the #); we start a session from it, and the person chooses a new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { changePassword } = useAuth();
  const t = useT();
  const [state, setState] = React.useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!liveConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("invalid");
      return;
    }
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    if (!access || !refresh) {
      setState("invalid");
      return;
    }
    void supabase()
      .auth.setSession({ access_token: access, refresh_token: refresh })
      .then(({ error: e }) => {
        window.history.replaceState(null, "", window.location.pathname);
        setState(e ? "invalid" : "ready");
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) return setError(t("auth.reset.tooShort"));
    if (password !== again) return setError(t("auth.reset.mismatch"));
    setBusy(true);
    setError(null);
    const r = await changePassword(password);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setState("done");
    window.setTimeout(() => router.replace("/dashboard"), 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Building2 className="size-5" /></span>
          <span className="font-heading text-lg font-semibold">{APP_NAME}</span>
          <LanguageSwitcher variant="icon" className="ms-auto" />
        </div>
        {state === "checking" && <p className="text-sm text-muted-foreground">{t("auth.reset.checking")}</p>}
        {state === "invalid" && (
          <div className="space-y-3">
            <h1 className="font-heading text-2xl font-semibold">{t("auth.reset.expiredTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.reset.expiredBody")}</p>
            <Button asChild><Link href="/login">{t("auth.backToSignin")}</Link></Button>
          </div>
        )}
        {state === "done" && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium text-success">{t("auth.reset.done")}</p>}
        {state === "ready" && (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <h1 className="font-heading text-2xl font-semibold">{t("auth.reset.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("auth.reset.sub")}</p>
            </div>
            <div className="space-y-1.5"><Label htmlFor="pw">{t("auth.reset.newPassword")}</Label><Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="pw2">{t("auth.reset.again")}</Label><Input id="pw2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></div>
            {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full gap-2" disabled={busy || !password || !again}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />} {t("auth.reset.submit")}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
