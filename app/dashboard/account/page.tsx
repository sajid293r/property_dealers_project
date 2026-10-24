"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/dialogs/form-dialog";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/providers/auth-provider";
import { useCompany } from "@/lib/providers/company-provider";
import { toast } from "sonner";

interface Me {
  user: { id: string; email: string | null; fullName: string };
  companies: { companyId: string; name: string; role: string; plan: string }[];
}

export default function AccountPage() {
  const { live } = useCompany();
  const { changePassword, signOut } = useAuth();
  const me = useQuery({ queryKey: ["live", "me"], queryFn: () => api<Me>("/v1/me"), enabled: live, staleTime: 30_000 });
  const [name, setName] = React.useState<string | null>(null);
  const [pw, setPw] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  if (!live) {
    return <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">Sign in with your own account to manage it. The demo has no account.</div>;
  }

  async function saveName() {
    setBusy(true);
    try {
      await api("/v1/me", { method: "PATCH", body: { fullName: (name ?? me.data?.user.fullName ?? "").trim() } });
      await me.refetch();
      setName(null);
      toast.success("Name saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (pw.length < 8) return toast.error("Choose a password of at least 8 characters.");
    if (pw !== again) return toast.error("The two passwords are not the same.");
    setBusy(true);
    const r = await changePassword(pw);
    setBusy(false);
    if (!r.ok) return toast.error(r.message);
    setPw("");
    setAgain("");
    toast.success("Password changed");
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <PageHeader icon={UserRound} eyebrow="Account" title="My account" description="Your name and your password" />
      {me.isLoading || !me.data ? <Skeleton className="h-72 rounded-xl" /> : (
        <>
          <Card className="space-y-4 p-5">
            <h3 className="font-heading text-base font-semibold">Profile</h3>
            <Field label="Your name"><Input value={name ?? me.data.user.fullName} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
            <Field label="Email (used to sign in)"><Input value={me.data.user.email ?? ""} disabled /></Field>
            <div className="flex justify-end"><Button disabled={busy || name === null || name.trim().length < 2} onClick={() => void saveName()}>Save name</Button></div>
            <div className="border-t border-border/60 pt-3 text-sm text-muted-foreground">
              {me.data.companies.map((c) => <p key={c.companyId}>{c.name} — {c.role}</p>)}
            </div>
          </Card>
          <Card className="space-y-4 p-5">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><KeyRound className="size-4" /> Change password</h3>
            <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Type it again"><Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></Field>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
              <Button disabled={busy || !pw || !again} onClick={() => void savePassword()}>Change password</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
