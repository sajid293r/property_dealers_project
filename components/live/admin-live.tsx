"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Crown, KeyRound, Lock, MailPlus, Plus, ShieldCheck, Trash2, UserCog, Users2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { StatTile } from "@/components/live/stat-tile";
import { CompanyLanguageCard } from "@/components/live/company-language-card";
import { ReasonDialog } from "@/components/live/reason-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import {
  deleteRole, fetchCompanyProfile, fetchMembers, fetchPlan, fetchRoles, inviteMember, revokeInvite, saveCompanyProfile, saveRole, updateMember,
  type Grant, type RoleRow,
} from "@/lib/api/modules";
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from "@/lib/permissions";
import { num } from "@/lib/api/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import { tOr } from "@/lib/i18n/runtime";

const PLAN_KEY: Record<string, string> = { Basic: "plan.basic", Professional: "plan.moderate", Advanced: "plan.premium" };

// ───────────────────────────────────────────── users
export function LiveUsers() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [inviting, setInviting] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [suspend, setSuspend] = React.useState<{ id: string; name: string } | null>(null);

  const members = useQuery({ queryKey: ["live", "members"], queryFn: () => fetchMembers(company.id), staleTime: 10_000 });
  const roles = useQuery({ queryKey: ["live", "roles"], queryFn: () => fetchRoles(company.id), staleTime: 30_000 });
  const plan = useQuery({ queryKey: ["live", "plan"], queryFn: () => fetchPlan(company.id), staleTime: 30_000 });

  const used = (plan.data?.users.used ?? 0) + (plan.data?.users.invited ?? 0);
  const limit = plan.data?.users.limit ?? null;
  const full = limit !== null && used >= limit;

  async function change(userId: string, body: { roleId?: string; status?: "active" | "suspended" }, message: string) {
    try {
      await updateMember(company.id, userId, body);
      await invalidate();
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.thatDidNotWork"));
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={UserCog}
        eyebrow={t("nav.section.administration")}
        title={t("adm.users.title")}
        description={t("adm.users.description")}
        actions={can("administration.create") ? <Button className="gap-1.5" disabled={full} onClick={() => { setRoleId(roles.data?.[0]?.id ?? ""); setInviting(true); }}><MailPlus className="size-4" /> {t("adm.users.invite")}</Button> : undefined}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Users2} label={t("adm.users.tile.people")} value={members.data?.members.length ?? 0} />
        <StatTile icon={MailPlus} label={t("adm.users.tile.invites")} value={members.data?.invites.length ?? 0} accent="warning" />
        <StatTile icon={Crown} label={t("adm.users.tile.plan")} value={plan.data ? tOr(t, PLAN_KEY[plan.data.name] ?? "", plan.data.name) : "—"} accent="gold" />
      </div>
      {plan.data && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{t("adm.users.seatsUsed")}</span>
            <span className="text-muted-foreground">{plan.data.users.extra > 0 ? t("adm.users.seatsExtra", { used, limit: limit ?? 0, included: plan.data.users.included, extra: plan.data.users.extra }) : limit !== null ? t("adm.users.seatsOf", { used, limit }) : t("adm.users.seatsUnlimited", { used })}</span>
          </div>
          {limit !== null && <Progress value={Math.min(100, (used / limit) * 100)} className="mt-2 h-2" />}
          {full && <p className="mt-2 text-xs text-warning">{t("adm.users.seatsFull", { packs: plan.data.seatPacks.map((p) => t("adm.users.seatPack", { seats: p.seats, price: formatMoney(p.priceMonthlyPkr, { compact: true }) })).join(", ") })}</p>}
        </Card>
      )}

      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-start text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">{t("adm.users.col.person")}</th>
                <th className="pb-2.5 font-medium">{t("adm.users.col.role")}</th>
                <th className="pb-2.5 font-medium">{t("common.status")}</th>
                <th className="pb-2.5 font-medium">{t("adm.users.col.joined")}</th>
                <th className="pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.isLoading
                ? Array.from({ length: 3 }).map((_, i) => <tr key={i}><td colSpan={5} className="py-1.5"><Skeleton className="h-10 w-full" /></td></tr>)
                : (members.data?.members ?? []).map((m) => (
                    <tr key={m.userId} className="border-b border-border/40">
                      <td className="py-2.5"><p className="font-medium">{m.fullName}</p><p className="text-xs text-muted-foreground">{m.email}</p></td>
                      <td className="py-2.5">
                        {can("administration.edit") ? (
                          <Select value={m.roleId} onValueChange={(v) => void change(m.userId, { roleId: v }, t("adm.users.roleChanged", { name: m.fullName, role: (roles.data ?? []).find((r) => r.id === v)?.name ?? t("adm.users.roleUpdated") }))}>
                            <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{(roles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : m.role}
                      </td>
                      <td className="py-2.5"><Badge variant="outline" className={m.status === "active" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"}>{m.status === "active" ? t("adm.users.status.active") : t("adm.users.status.suspended")}</Badge></td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(m.joinedAt)}</td>
                      <td className="py-2.5 text-end">
                        {can("administration.edit") && (m.status === "active"
                          ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setSuspend({ id: m.userId, name: m.fullName })}>{t("adm.users.suspend")}</Button>
                          : <Button size="sm" variant="outline" onClick={() => void change(m.userId, { status: "active" }, t("adm.users.restored", { name: m.fullName }))}>{t("adm.users.restore")}</Button>)}
                      </td>
                    </tr>
                  ))}
              {(members.data?.invites ?? []).map((i) => (
                <tr key={i.id} className="border-b border-border/40 bg-secondary/30 last:border-0">
                  <td className="py-2.5"><p className="font-medium">{i.email}</p><p className="text-xs text-muted-foreground">{t("adm.users.invitedLine", { date: formatDate(i.invitedAt) })}</p></td>
                  <td className="py-2.5">{i.role}</td>
                  <td className="py-2.5"><Badge variant="outline" className="bg-warning/12 text-warning">{t("adm.users.status.invited")}</Badge></td>
                  <td />
                  <td className="py-2.5 text-end">
                    {can("administration.delete") && (
                      <Button size="icon-sm" variant="ghost" aria-label={t("adm.users.cancelInvite")} onClick={() => void revokeInvite(company.id, i.id).then(invalidate).then(() => toast.success(t("adm.users.inviteCancelled")))}><Trash2 className="size-4" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <FormDialog
        open={inviting}
        onOpenChange={setInviting}
        icon={MailPlus}
        title={t("adm.users.invite")}
        description={t("adm.users.invite.description")}
        submitLabel={t("adm.users.invite.submit")}
        submitDisabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || !roleId}
        onSubmit={async () => {
          await inviteMember(company.id, { email: email.trim().toLowerCase(), roleId });
          await invalidate();
          toast.success(t("adm.users.invite.sent", { email: email.trim() }));
          setEmail("");
        }}
      >
        <Field label={t("adm.users.invite.email")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.pk" /></Field>
        <Field label={t("adm.users.invite.role")}>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger><SelectValue placeholder={t("adm.users.invite.chooseRole")} /></SelectTrigger>
            <SelectContent>{(roles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </FormDialog>

      <ReasonDialog
        open={!!suspend}
        onOpenChange={(o) => !o && setSuspend(null)}
        icon={Lock}
        title={t("adm.users.suspend.title", { name: suspend?.name ?? "" })}
        description={t("adm.users.suspend.description")}
        submitLabel={t("adm.users.suspend.submit")}
        reasonLabel={t("adm.users.suspend.reason")}
        onSubmit={async () => { await updateMember(company.id, suspend!.id, { status: "suspended" }); await invalidate(); toast.success(t("adm.users.suspend.done", { name: suspend!.name })); }}
      />
    </div>
  );
}

// ───────────────────────────────────────────── roles
const SCOPES = ["company", "branch", "team", "own"] as const;

function emptyGrants(): Record<string, Grant> {
  return Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, { view: false, create: false, edit: false, delete: false, approve: false }]));
}

export function LiveRoles() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const roles = useQuery({ queryKey: ["live", "roles"], queryFn: () => fetchRoles(company.id), staleTime: 30_000 });
  const plan = useQuery({ queryKey: ["live", "plan"], queryFn: () => fetchPlan(company.id), staleTime: 30_000 });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{ id: string | null; name: string; description: string; scope: string; permissions: Record<string, Grant> } | null>(null);

  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0];
  const customAllowed = plan.data?.customRoles ?? false;

  function startNew(from?: RoleRow) {
    setEditing({ id: null, name: from ? t("adm.roles.copyOf", { name: from.name }) : "", description: "", scope: from?.scope ?? "company", permissions: from ? JSON.parse(JSON.stringify({ ...emptyGrants(), ...from.permissions })) : emptyGrants() });
  }
  function startEdit(r: RoleRow) {
    setEditing({ id: r.id, name: r.name, description: r.description ?? "", scope: r.scope, permissions: JSON.parse(JSON.stringify({ ...emptyGrants(), ...r.permissions })) });
  }
  function toggle(module: string, action: keyof Grant, on: boolean) {
    setEditing((e) => (e ? { ...e, permissions: { ...e.permissions, [module]: { ...e.permissions[module]!, [action]: on } } } : e));
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={ShieldCheck}
        eyebrow={t("nav.section.administration")}
        title={t("adm.roles.title")}
        description={t("adm.roles.description")}
        actions={can("administration.create") ? (
          customAllowed
            ? <Button className="gap-1.5" onClick={() => startNew()}><Plus className="size-4" /> {t("adm.roles.new")}</Button>
            : <Badge variant="outline" className="gap-1 px-2.5 py-1"><Lock className="size-3" /> {t("adm.roles.customLocked")}</Badge>
        ) : undefined}
      />
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit p-2">
          {roles.isLoading ? <Skeleton className="h-32 w-full" /> : (roles.data ?? []).map((r) => (
            <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-start text-sm transition-colors ${selected?.id === r.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary/60"}`}>
              <span className="min-w-0"><span className="block truncate">{r.name}</span><span className="block text-xs text-muted-foreground">{t(r.isSystem ? "adm.roles.membersStandard" : "adm.roles.members", { count: r.members })}</span></span>
              {r.isSystem && <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />}
            </button>
          ))}
        </Card>

        {selected && (
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-heading text-lg font-semibold">{selected.name}</h3>
                <p className="text-sm text-muted-foreground">{selected.description ?? (selected.isSystem ? t("adm.roles.standardNote") : t("adm.roles.customNote"))}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("adm.roles.sees", { scope: tOr(t, `adm.roles.scope.${selected.scope}`, selected.scope) })}</p>
              </div>
              <div className="flex gap-2">
                {customAllowed && can("administration.create") && <Button size="sm" variant="outline" onClick={() => startNew(selected)}>{t("adm.roles.copy")}</Button>}
                {!selected.isSystem && can("administration.edit") && <Button size="sm" onClick={() => startEdit(selected)}>{t("common.edit")}</Button>}
                {!selected.isSystem && can("administration.delete") && (
                  <Button size="icon-sm" variant="ghost" aria-label={t("adm.roles.deleteAria")} className="text-destructive" onClick={() => void deleteRole(company.id, selected.id).then(invalidate).then(() => toast.success(t("adm.roles.deleted"))).catch((e) => toast.error(e instanceof Error ? e.message : t("adm.roles.couldNotDelete")))}><Trash2 className="size-4" /></Button>
                )}
              </div>
            </div>
            <PermissionGrid grants={selected.permissions} />
          </Card>
        )}
      </div>

      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        icon={ShieldCheck}
        title={editing?.id ? t("adm.roles.edit.titleEdit") : t("adm.roles.new")}
        description={t("adm.roles.edit.description")}
        submitLabel={t("adm.roles.edit.submit")}
        submitDisabled={!editing || editing.name.trim().length < 2}
        onSubmit={async () => {
          await saveRole(company.id, editing!.id, { name: editing!.name.trim(), description: editing!.description.trim() || undefined, scope: editing!.scope, permissions: editing!.permissions });
          await invalidate();
          toast.success(t("adm.roles.edit.saved"));
          setEditing(null);
        }}
      >
        {editing && (
          <>
            <FieldRow>
              <Field label={t("adm.roles.edit.name")}><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t("adm.roles.edit.namePlaceholder")} /></Field>
              <Field label={t("adm.roles.edit.canSee")}>
                <Select value={editing.scope} onValueChange={(v) => setEditing({ ...editing, scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SCOPES.map((s) => <SelectItem key={s} value={s}>{t(`adm.roles.scope.${s}`)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </FieldRow>
            <Field label={t("adm.roles.edit.descriptionLabel")}><Textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <div className="max-h-[320px] overflow-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background"><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-start font-medium">{t("adm.roles.area")}</th>{PERMISSION_ACTIONS.map((a) => <th key={a} className="p-2 font-medium">{t(`perm.action.${a}`)}</th>)}</tr></thead>
                <tbody>
                  {PERMISSION_MODULES.map((m) => (
                    <tr key={m.key} className="border-b border-border/40 last:border-0">
                      <td className="p-2">{t(`perm.module.${m.key}`)}</td>
                      {PERMISSION_ACTIONS.map((a) => (
                        <td key={a} className="p-2 text-center"><Checkbox checked={editing.permissions[m.key]?.[a] ?? false} onCheckedChange={(c) => toggle(m.key, a, c === true)} aria-label={`${t(`perm.module.${m.key}`)} ${t(`perm.action.${a}`)}`} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </FormDialog>
    </div>
  );
}

function PermissionGrid({ grants }: { grants: Record<string, Grant> }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-2 text-start font-medium">{t("adm.roles.area")}</th>{PERMISSION_ACTIONS.map((a) => <th key={a} className="pb-2 font-medium">{t(`perm.action.${a}`)}</th>)}</tr></thead>
        <tbody>
          {PERMISSION_MODULES.map((m) => (
            <tr key={m.key} className="border-b border-border/40 last:border-0">
              <td className="py-2"><span className="flex items-center gap-2"><m.icon className="size-3.5 text-muted-foreground" />{t(`perm.module.${m.key}`)}</span></td>
              {PERMISSION_ACTIONS.map((a) => (
                <td key={a} className="py-2 text-center">{grants[m.key]?.[a] ? <span className="text-success">●</span> : <span className="text-border">○</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────────────────────── company profile
export function LiveCompanyProfile() {
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const q = useQuery({ queryKey: ["live", "company-profile"], queryFn: () => fetchCompanyProfile(company.id), staleTime: 30_000 });
  const plan = useQuery({ queryKey: ["live", "plan"], queryFn: () => fetchPlan(company.id), staleTime: 30_000 });
  const [form, setForm] = React.useState<Record<string, string> | null>(null);
  const [selfApproval, setSelfApproval] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);

  const p = q.data;
  const value = (k: keyof NonNullable<typeof p>) => form?.[k as string] ?? (p?.[k] as string | null) ?? "";
  const set = (k: string, v: string) => setForm((f) => ({ ...(f ?? {}), [k]: v }));
  const editable = can("administration.edit");

  async function save() {
    if (!p || !form) return;
    setBusy(true);
    try {
      const body: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(form)) body[k] = v.trim() === "" ? null : v.trim();
      await saveCompanyProfile(company.id, body as never);
      await invalidate();
      setForm(null);
      toast.success(t("adm.profile.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("adm.profile.couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader icon={Building2} eyebrow={t("nav.section.administration")} title={t("adm.profile.title")} description={t("adm.profile.description")} />
      {q.isLoading || !p ? <Skeleton className="h-96 rounded-xl" /> : (
        <>
          <Card className="space-y-4 p-5">
            <Field label={t("adm.profile.name")}><Input value={value("name")} disabled={!editable} onChange={(e) => set("name", e.target.value)} /></Field>
            <FieldRow>
              <Field label={t("adm.profile.shortName")}><Input value={value("shortName")} disabled={!editable} onChange={(e) => set("shortName", e.target.value)} /></Field>
              <Field label={t("customers.col.city")}><Input value={value("city")} disabled={!editable} onChange={(e) => set("city", e.target.value)} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label={t("adm.profile.ntn")}><Input value={value("ntn")} disabled={!editable} onChange={(e) => set("ntn", e.target.value)} placeholder="1234567-8" /></Field>
              <Field label={t("adm.profile.strn")}><Input value={value("strn")} disabled={!editable} onChange={(e) => set("strn", e.target.value)} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label={t("common.phone")}><Input value={value("phone")} disabled={!editable} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label={t("common.email")}><Input type="email" value={value("email")} disabled={!editable} onChange={(e) => set("email", e.target.value)} /></Field>
            </FieldRow>
            <Field label={t("adm.profile.address")}><Textarea rows={2} value={value("address")} disabled={!editable} onChange={(e) => set("address", e.target.value)} /></Field>
            {editable && <div className="flex justify-end"><Button disabled={!form || busy} onClick={() => void save()}>{t("adm.profile.saveChanges")}</Button></div>}
          </Card>

          <Card className="space-y-3 p-5">
            <h3 className="font-heading text-base font-semibold">{t("adm.profile.approvals")}</h3>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-medium">{t("adm.profile.selfApproval")}</span>
                <span className="block text-xs text-muted-foreground">{t("adm.profile.selfApprovalHint")}</span>
              </span>
              <Switch
                checked={selfApproval ?? p.voucherSelfApproval}
                disabled={!editable}
                onCheckedChange={(v) => { setSelfApproval(v); void saveCompanyProfile(company.id, { voucherSelfApproval: v } as never).then(invalidate).then(() => toast.success(v ? t("adm.profile.selfOn") : t("adm.profile.selfOff"))); }}
              />
            </label>
            <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
              <Field label={t("adm.profile.lateRate")}>
                <Input inputMode="decimal" defaultValue={num(p.penaltyRatePctMonth)} disabled={!editable} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== num(p.penaltyRatePctMonth)) void saveCompanyProfile(company.id, { penaltyRatePctMonth: v }).then(invalidate).then(() => toast.success(t("adm.profile.lateRateSaved"))).catch((er) => toast.error(er instanceof Error ? er.message : t("adm.profile.couldNotSave"))); }} />
              </Field>
              <Field label={t("adm.profile.grace")}>
                <Input inputMode="numeric" defaultValue={p.penaltyGraceDays} disabled={!editable} onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v !== p.penaltyGraceDays) void saveCompanyProfile(company.id, { penaltyGraceDays: v }).then(invalidate).then(() => toast.success(t("adm.profile.graceSaved"))).catch((er) => toast.error(er instanceof Error ? er.message : t("adm.profile.couldNotSave"))); }} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">{t("adm.profile.lateHint")}</p>
            <p className="text-xs text-muted-foreground">{t("adm.profile.facts", { month: t(`people.month.${p.fiscalYearStart}`), marla: p.marlaSqft ?? "272.25", currency: p.currency })}</p>
          </Card>

          <CompanyLanguageCard saved={p.defaultLanguage} />

          {plan.data && (
            <Card className="p-5">
              <h3 className="font-heading text-base font-semibold">{t("adm.profile.plan", { name: tOr(t, PLAN_KEY[plan.data.name] ?? "", plan.data.name) })}</h3>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {plan.data.features.map((f) => (
                  <li key={f.key} className={`flex items-center gap-2 text-sm ${f.included ? "" : "text-muted-foreground"}`}>
                    <span className={f.included ? "text-success" : "text-border"}>{f.included ? "✓" : "🔒"}</span>
                    {tOr(t, `plan.feature.${f.key}`, f.name)}{!f.included && <span className="text-xs">— {tOr(t, PLAN_KEY[f.tierName] ?? "", f.tierName)}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">{t("adm.profile.planChange")}</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
