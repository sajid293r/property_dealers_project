"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Building2, Eye, EyeOff, Loader2, LockKeyhole, PlayCircle, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlotGridMotif } from "@/components/plot-grid-motif";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { APP_NAME } from "@/lib/brand";
import { useAuth } from "@/lib/providers/auth-provider";
import { useLanguage } from "@/lib/i18n/provider";

const POINTS = [
  { icon: Building2, key: "auth.brand.point1" },
  { icon: Wallet, key: "auth.brand.point2" },
  { icon: ShieldCheck, key: "auth.brand.point3" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const { t, dir } = useLanguage();
  const { status, liveAvailable, signIn, signUp, sendPasswordReset, startDemo } = useAuth();
  const [resetting, setResetting] = React.useState(false);
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Already signed in (or in the demo)? Go straight in.
  React.useEffect(() => {
    if (status === "live" || status === "demo") router.replace("/dashboard");
  }, [status, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    if (resetting) {
      const sent = await sendPasswordReset(email);
      if (!sent.ok) setError(sent.message);
      else setNotice(t("auth.notice.resetSent"));
      setBusy(false);
      return;
    }
    if (mode === "signup") {
      const created = await signUp(email, password, fullName);
      if (!created.ok) setError(created.message);
      else if (created.needsConfirmation) setNotice(t("auth.notice.confirm"));
      setBusy(false);
      return;
    }
    const result = await signIn(email, password);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
    }
    // on success the effect above moves on once the session is in
  }

  function demo() {
    startDemo();
    router.replace("/dashboard");
  }

  // the brand panel's list slides in from the side the text starts on
  const slide = dir === "rtl" ? 12 : -12;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* brand panel */}
      <section className="surface-hero sheen relative isolate hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <PlotGridMotif variant="inverted" className="opacity-60" />
        <div className="pointer-events-none absolute -start-16 top-10 -z-10 size-80 animate-aurora rounded-full bg-[oklch(0.55_0.12_165/0.35)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 end-10 -z-10 size-72 animate-aurora rounded-full bg-gold/25 blur-3xl [animation-delay:-6s]" />
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-[color-mix(in_oklch,var(--sidebar-primary),black_15%)] text-sidebar-primary-foreground shadow-[0_0_24px_-2px_var(--sidebar-primary)]">
            <Building2 className="size-5" />
          </span>
          <span className="font-heading text-xl font-semibold">{APP_NAME}</span>
        </div>

        <div className="max-w-md">
          <h1 className="font-heading text-4xl font-semibold leading-tight xl:text-5xl">
            {t("auth.brand.headlineA")}<span className="text-gradient-gold italic">{t("auth.brand.headlineB")}</span>{t("auth.brand.headlineC")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/70">{t("auth.brand.sub", { tagline: t("shell.tagline") })}</p>
          <ul className="mt-8 space-y-3.5">
            {POINTS.map((p, i) => (
              <motion.li
                key={p.key}
                initial={{ opacity: 0, x: slide }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3 text-sm text-white/85"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <p.icon className="size-4 text-gold" />
                </span>
                {t(p.key)}
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/45"><bdi dir="ltr">© {new Date().getFullYear()} {APP_NAME}</bdi></p>
      </section>

      {/* sign-in form */}
      <main className="relative flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="absolute end-4 top-4"><LanguageSwitcher variant="full" /></div>
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="size-5" />
            </span>
            <span className="font-heading text-lg font-semibold">{APP_NAME}</span>
          </div>

          <h2 className="font-heading text-3xl font-semibold">{mode === "signup" ? t("auth.signup.title") : t("auth.signin.title")}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{mode === "signup" ? t("auth.signup.sub") : t("auth.signin.sub")}</p>

          {liveAvailable ? (
            <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fullname">{t("auth.field.name")}</Label>
                  <Input id="fullname" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("auth.field.namePlaceholder")} required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("auth.field.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  className="text-start"
                  autoComplete="username"
                  inputMode="email"
                  placeholder={t("auth.field.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error}
                  required
                />
              </div>
              {!resetting && (
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("auth.field.password")}</Label>
                <div className="relative" dir="ltr">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    dir="ltr"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!error}
                    className="pe-10 text-start"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={show ? t("auth.password.hide") : t("auth.password.show")}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              )}

              {notice && <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium text-success">{notice}</p>}
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
                >
                  {error}
                </motion.p>
              )}

              <Button type="submit" className="h-11 w-full gap-2" disabled={busy || !email.trim() || (!resetting && !password) || (mode === "signup" && (fullName.trim().length < 2 || password.length < 8))}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
                {busy ? (resetting ? t("auth.busy.reset") : mode === "signup" ? t("auth.busy.signup") : t("auth.busy.signin")) : resetting ? t("auth.submit.reset") : mode === "signup" ? t("auth.submit.signup") : t("auth.submit.signin")}
              </Button>
              {mode === "signin" && (
                <p className="text-center text-sm">
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setResetting((r) => !r); setError(null); setNotice(null); }}>
                    {resetting ? t("auth.backToSignin") : t("auth.forgot")}
                  </button>
                </p>
              )}
              <p className="text-center text-sm text-muted-foreground">
                {mode === "signup" ? t("auth.haveSignin") : t("auth.invited")}{" "}
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); setNotice(null); }}>
                  {mode === "signup" ? t("auth.submit.signin") : t("auth.signup.title")}
                </button>
              </p>
            </form>
          ) : (
            <p className="mt-8 rounded-lg border border-border/70 bg-secondary/50 px-3.5 py-3 text-sm text-muted-foreground">
              {t("auth.notSetUp", { app: APP_NAME })}
            </p>
          )}

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("auth.or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" className="h-11 w-full gap-2" onClick={demo}>
            <PlayCircle className="size-4" />
            {t("auth.demo")}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">{t("auth.demoNote")}</p>
        </motion.div>
      </main>
    </div>
  );
}
