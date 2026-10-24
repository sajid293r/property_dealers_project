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

// ───────────────────────────────────────────── users
export function LiveUsers() {
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
      toast.error(e instanceof Error ? e.message : "That did not work.");
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={UserCog}
        eyebrow="Administration"
        title="Users"
        description="Who can sign in to this company, and what each person can do"
        actions={can("administration.create") ? <Button className="gap-1.5" disabled={full} onClick={() => { setRoleId(roles.data?.[0]?.id ?? ""); setInviting(true); }}><MailPlus className="size-4" /> Invite someone</Button> : undefined}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={Users2} label="People in this company" value={members.data?.members.length ?? 0} />
        <StatTile icon={MailPlus} label="Invitations waiting" value={members.data?.invites.length ?? 0} accent="warning" />
        <StatTile icon={Crown} label="Your plan" value={plan.data?.name ?? "—"} accent="gold" />
      </div>
      {plan.data && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Seats used</span>
            <span className="text-muted-foreground">{used} of {limit ?? "unlimited"}{plan.data.users.extra > 0 ? ` (${plan.data.users.included} in your plan + ${plan.data.users.extra} extra)` : ""}</span>
          </div>
          {limit !== null && <Progress value={Math.min(100, (used / limit) * 100)} className="mt-2 h-2" />}
          {full && <p className="mt-2 text-xs text-warning">All seats are taken. Remove someone, upgrade the plan, or buy extra seats: {plan.data.seatPacks.map((p) => `+${p.seats} for ${formatMoney(p.priceMonthlyPkr, { compact: true })}/month`).join(", ")}. Contact PropIQ support to add them.</p>}
        </Card>
      )}

      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Person</th>
                <th className="pb-2.5 font-medium">Role</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium">Joined</th>
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
                          <Select value={m.roleId} onValueChange={(v) => void change(m.userId, { roleId: v }, `${m.fullName} is now ${(roles.data ?? []).find((r) => r.id === v)?.name ?? "updated"}`)}>
                            <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{(roles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : m.role}
                      </td>
                      <td className="py-2.5"><Badge variant="outline" className={m.status === "active" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"}>{m.status === "active" ? "Active" : "Suspended"}</Badge></td>
                      <td className="py-2.5 text-muted-foreground">{formatDate(m.joinedAt)}</td>
                      <td className="py-2.5 text-right">
                        {can("administration.edit") && (m.status === "active"
                          ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setSuspend({ id: m.userId, name: m.fullName })}>Suspend</Button>
                          : <Button size="sm" variant="outline" onClick={() => void change(m.userId, { status: "active" }, `${m.fullName} can sign in again`)}>Restore</Button>)}
                      </td>
                    </tr>
                  ))}
              {(members.data?.invites ?? []).map((i) => (
                <tr key={i.id} className="border-b border-border/40 bg-secondary/30 last:border-0">
                  <td className="py-2.5"><p className="font-medium">{i.email}</p><p className="text-xs text-muted-foreground">Invited {formatDate(i.invitedAt)} · waiting for them to sign up</p></td>
                  <td className="py-2.5">{i.role}</td>
                  <td className="py-2.5"><Badge variant="outline" className="bg-warning/12 text-warning">Invited</Badge></td>
                  <td />
                  <td className="py-2.5 text-right">
                    {can("administration.delete") && (
                      <Button size="icon-sm" variant="ghost" aria-label="Cancel invitation" onClick={() => void revokeInvite(company.id, i.id).then(invalidate).then(() => toast.success("Invitation cancelled"))}><Trash2 className="size-4" /></Button>
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
        title="Invite someone"
        description="They create their own sign-in with this email address, and join with the role you choose. Nothing else is needed."
        submitLabel="Send invitation"
        submitDisabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || !roleId}
        onSubmit={async () => {
          await inviteMember(company.id, { email: email.trim().toLowerCase(), roleId });
          await invalidate();
          toast.success(`${email.trim()} has been invited. Ask them to sign up with this address.`);
          setEmail("");
        }}
      >
        <Field label="Email address"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.pk" /></Field>
        <Field label="Role">
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
            <SelectContent>{(roles.data ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </FormDialog>

      <ReasonDialog
        open={!!suspend}
        onOpenChange={(o) => !o && setSuspend(null)}
        icon={Lock}
        title={`Suspend ${suspend?.name ?? ""}`}
        description="They will no longer be able to open this company. You can restore them at any time. Their past work stays in the books."
        submitLabel="Suspend"
        reasonLabel="Reason (kept for your records)"
        onSubmit={async () => { await updateMember(company.id, suspend!.id, { status: "suspended" }); await invalidate(); toast.success(`${suspend!.name} suspended`); }}
      />
    </div>
  );
}

// ───────────────────────────────────────────── roles
const SCOPES = [
  { v: "company", label: "Everything in the company" },
  { v: "branch", label: "Their branch only" },
  { v: "team", label: "Their team only" },
  { v: "own", label: "Only records they created" },
];

function emptyGrants(): Record<string, Grant> {
  return Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, { view: false, create: false, edit: false, delete: false, approve: false }]));
}

export function LiveRoles() {
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
    setEditing({ id: null, name: from ? `${from.name} (copy)` : "", description: "", scope: from?.scope ?? "company", permissions: from ? JSON.parse(JSON.stringify({ ...emptyGrants(), ...from.permissions })) : emptyGrants() });
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
        eyebrow="Administration"
        title="Roles & permissions"
        description="Decide what each kind of person can see and do"
        actions={can("administration.create") ? (
          customAllowed
            ? <Button className="gap-1.5" onClick={() => startNew()}><Plus className="size-4" /> New role</Button>
            : <Badge variant="outline" className="gap-1 px-2.5 py-1"><Lock className="size-3" /> Custom roles are part of Professional</Badge>
        ) : undefined}
      />
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit p-2">
          {roles.isLoading ? <Skeleton className="h-32 w-full" /> : (roles.data ?? []).map((r) => (
            <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${selected?.id === r.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary/60"}`}>
              <span className="min-w-0"><span className="block truncate">{r.name}</span><span className="block text-xs text-muted-foreground">{r.members} {r.members === 1 ? "person" : "people"}{r.isSystem ? " · standard" : ""}</span></span>
              {r.isSystem && <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />}
            </button>
          ))}
        </Card>

        {selected && (
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-heading text-lg font-semibold">{selected.name}</h3>
                <p className="text-sm text-muted-foreground">{selected.description ?? (selected.isSystem ? "A standard role — it cannot be changed, but you can make a copy." : "A custom role.")}</p>
                <p className="mt-1 text-xs text-muted-foreground">Sees: {SCOPES.find((s) => s.v === selected.scope)?.label ?? selected.scope}</p>
              </div>
              <div className="flex gap-2">
                {customAllowed && can("administration.create") && <Button size="sm" variant="outline" onClick={() => startNew(selected)}>Make a copy</Button>}
                {!selected.isSystem && can("administration.edit") && <Button size="sm" onClick={() => startEdit(selected)}>Edit</Button>}
                {!selected.isSystem && can("administration.delete") && (
                  <Button size="icon-sm" variant="ghost" aria-label="Delete role" className="text-destructive" onClick={() => void deleteRole(company.id, selected.id).then(invalidate).then(() => toast.success("Role deleted")).catch((e) => toast.error(e instanceof Error ? e.message : "Could not delete it."))}><Trash2 className="size-4" /></Button>
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
        title={editing?.id ? "Edit role" : "New role"}
        description="Tick what this role may do in each area. Money records are never deleted — they are voided or reversed."
        submitLabel="Save role"
        submitDisabled={!editing || editing.name.trim().length < 2}
        onSubmit={async () => {
          await saveRole(company.id, editing!.id, { name: editing!.name.trim(), description: editing!.description.trim() || undefined, scope: editing!.scope, permissions: editing!.permissions });
          await invalidate();
          toast.success("Role saved");
          setEditing(null);
        }}
      >
        {editing && (
          <>
            <FieldRow>
              <Field label="Role name"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Sales Agent" /></Field>
              <Field label="Can see">
                <Select value={editing.scope} onValueChange={(v) => setEditing({ ...editing, scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SCOPES.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </FieldRow>
            <Field label="Description (optional)"><Textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <div className="max-h-[320px] overflow-auto rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background"><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-left font-medium">Area</th>{PERMISSION_ACTIONS.map((a) => <th key={a} className="p-2 font-medium capitalize">{a}</th>)}</tr></thead>
                <tbody>
                  {PERMISSION_MODULES.map((m) => (
                    <tr key={m.key} className="border-b border-border/40 last:border-0">
                      <td className="p-2">{m.label}</td>
                      {PERMISSION_ACTIONS.map((a) => (
                        <td key={a} className="p-2 text-center"><Checkbox checked={editing.permissions[m.key]?.[a] ?? false} onCheckedChange={(c) => toggle(m.key, a, c === true)} aria-label={`${m.label} ${a}`} /></td>
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-2 text-left font-medium">Area</th>{PERMISSION_ACTIONS.map((a) => <th key={a} className="pb-2 font-medium capitalize">{a}</th>)}</tr></thead>
        <tbody>
          {PERMISSION_MODULES.map((m) => (
            <tr key={m.key} className="border-b border-border/40 last:border-0">
              <td className="py-2"><span className="flex items-center gap-2"><m.icon className="size-3.5 text-muted-foreground" />{m.label}</span></td>
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
      toast.success("Company profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader icon={Building2} eyebrow="Administration" title="Company profile" description="Appears on invoices, receipts and reports" />
      {q.isLoading || !p ? <Skeleton className="h-96 rounded-xl" /> : (
        <>
          <Card className="space-y-4 p-5">
            <Field label="Company name"><Input value={value("name")} disabled={!editable} onChange={(e) => set("name", e.target.value)} /></Field>
            <FieldRow>
              <Field label="Short name"><Input value={value("shortName")} disabled={!editable} onChange={(e) => set("shortName", e.target.value)} /></Field>
              <Field label="City"><Input value={value("city")} disabled={!editable} onChange={(e) => set("city", e.target.value)} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="NTN"><Input value={value("ntn")} disabled={!editable} onChange={(e) => set("ntn", e.target.value)} placeholder="1234567-8" /></Field>
              <Field label="STRN (sales tax)"><Input value={value("strn")} disabled={!editable} onChange={(e) => set("strn", e.target.value)} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Phone"><Input value={value("phone")} disabled={!editable} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="Email"><Input type="email" value={value("email")} disabled={!editable} onChange={(e) => set("email", e.target.value)} /></Field>
            </FieldRow>
            <Field label="Address"><Textarea rows={2} value={value("address")} disabled={!editable} onChange={(e) => set("address", e.target.value)} /></Field>
            {editable && <div className="flex justify-end"><Button disabled={!form || busy} onClick={() => void save()}>Save changes</Button></div>}
          </Card>

          <Card className="space-y-3 p-5">
            <h3 className="font-heading text-base font-semibold">Approvals</h3>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-medium">The person who prepares a voucher may also approve it</span>
                <span className="block text-xs text-muted-foreground">Fine for a small team. Turn it off to always need a second person.</span>
              </span>
              <Switch
                checked={selfApproval ?? p.voucherSelfApproval}
                disabled={!editable}
                onCheckedChange={(v) => { setSelfApproval(v); void saveCompanyProfile(company.id, { voucherSelfApproval: v } as never).then(invalidate).then(() => toast.success(v ? "Self-approval allowed" : "A second person must approve")); }}
              />
            </label>
            <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
              <Field label="Late-payment charge (% a month)">
                <Input inputMode="decimal" defaultValue={num(p.penaltyRatePctMonth)} disabled={!editable} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== num(p.penaltyRatePctMonth)) void saveCompanyProfile(company.id, { penaltyRatePctMonth: v }).then(invalidate).then(() => toast.success("Late-charge rate saved")).catch((er) => toast.error(er instanceof Error ? er.message : "Could not save.")); }} />
              </Field>
              <Field label="Grace period (days)">
                <Input inputMode="numeric" defaultValue={p.penaltyGraceDays} disabled={!editable} onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v !== p.penaltyGraceDays) void saveCompanyProfile(company.id, { penaltyGraceDays: v }).then(invalidate).then(() => toast.success("Grace period saved")).catch((er) => toast.error(er instanceof Error ? er.message : "Could not save.")); }} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Late charges are suggested on overdue installments using this rate (0 turns it off); you choose when to apply them.</p>
            <p className="text-xs text-muted-foreground">Financial year starts in {new Date(2000, p.fiscalYearStart - 1, 1).toLocaleString("en", { month: "long" })} · 1 marla = {p.marlaSqft ?? "272.25"} sq ft · currency {p.currency}</p>
          </Card>

          {plan.data && (
            <Card className="p-5">
              <h3 className="font-heading text-base font-semibold">Your plan: {plan.data.name}</h3>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {plan.data.features.map((f) => (
                  <li key={f.key} className={`flex items-center gap-2 text-sm ${f.included ? "" : "text-muted-foreground"}`}>
                    <span className={f.included ? "text-success" : "text-border"}>{f.included ? "✓" : "🔒"}</span>
                    {f.name}{!f.included && <span className="text-xs">— {f.tierName}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">To change your plan, contact PropIQ support.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
