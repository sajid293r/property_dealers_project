"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, Gavel, Handshake, Landmark, Pencil, Plus, Scale, Tag, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog, Field, FieldRow } from "@/components/dialogs/form-dialog";
import { AmountInput } from "@/components/live/amount-input";
import { PartySelect } from "@/components/live/party-select";
import { AttachmentsPanel } from "@/components/live/attachments";
import { LiveBookingDialog } from "@/components/live/booking-dialog";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance, usePermissions } from "@/lib/hooks/use-live";
import { api } from "@/lib/api/client";
import { num } from "@/lib/api/finance";
import { todayIso } from "@/lib/fiscal";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/provider";
import { tOr, type TranslateFn } from "@/lib/i18n/runtime";
import { Ltr } from "@/components/ltr";

interface Property {
  id: string; code: string; title: string; status: string; listPrice: string; project: string | null; block: string | null; type: string; sizeValue: string | null; sizeUnit: string | null; sizeSqft: string | null;
  activeHold: { expiresAt: string } | null; statusHistory: { from: string | null; to: string; reason: string | null; changedAt: string }[];
}
interface Detail {
  legal: Record<string, string | null> | null;
  ownership: { id: string; ownerName: string; acquisitionType: string; fromDate: string; toDate: string | null; price: string | null; deedRef: string | null }[];
  encumbrances: { id: string; kind: string; holderName: string | null; amount: string | null; since: string; status: string; releasedOn: string | null; notes: string | null }[];
  valuations: { id: string; valuationDate: string; method: string; value: string; notes: string | null }[];
  priceHistory: { price: string; effectiveFrom: string; changedBy: string | null; reason: string | null }[];
  currentBooking: { id: string; bookingNo: string; status: string; customerName: string; netPrice: string; bookingDate: string } | null;
}

const STATUS_CLS: Record<string, string> = { available: "bg-success/12 text-success", reserved: "bg-gold/15 text-gold", sold: "bg-primary/12 text-primary", blocked: "bg-muted text-muted-foreground", rented: "bg-primary/12 text-primary", cancelled: "bg-muted text-muted-foreground" };
const OWNERSHIP = { prefix: "properties.own", values: ["freehold", "leasehold", "allotment", "power_of_attorney", "file"] } as const;
const TITLE = { prefix: "properties.title", values: ["clear", "under_verification", "disputed"] } as const;
const TRANSFER = { prefix: "properties.transfer", values: ["transferable", "restricted", "transferred"] } as const;
const ENC = { prefix: "properties.enc", values: ["mortgage", "lien", "court_stay", "litigation", "tenancy_right"] } as const;
const ACQ = { prefix: "properties.acq", values: ["purchase", "allotment", "transfer", "inheritance", "gift"] } as const;
type Options = { readonly prefix: string; readonly values: readonly string[] };
const label = (t: TranslateFn, list: Options, v: string | null | undefined) => (v ? tOr(t, `${list.prefix}.${v}`, v) : "—");
const DOC_KINDS = ["Registry", "Fard", "Allotment letter", "NOC", "Sale deed", "Site plan", "Tax receipt", "Photo", "Other"];

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-end font-medium">{v || "—"}</span>
    </div>
  );
}

export function LivePropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const { company } = useCompany();
  const { can } = usePermissions();
  const invalidate = useInvalidateFinance();
  const [dlg, setDlg] = React.useState<null | "legal" | "valuation" | "restriction" | "owner" | "price" | "book">(null);
  const p = useQuery({ queryKey: ["live", "property", id], queryFn: () => api<Property>(`/v1/properties/${id}`, { companyId: company.id }) });
  const d = useQuery({ queryKey: ["live", "property-detail", id], queryFn: () => api<Detail>(`/v1/properties/${id}/detail`, { companyId: company.id }) });
  const edit = can("inventory.edit");

  if (p.isLoading || !p.data) {
    return <div className="mx-auto max-w-[1200px] space-y-5"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 rounded-xl" /></div>;
  }
  const u = p.data;
  const det = d.data;
  const legal = det?.legal;

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <PageHeader
        icon={Building2}
        back={{ href: "/dashboard/properties", label: t("properties.title") }}
        title={u.title}
        badge={<><span className="font-mono text-sm text-muted-foreground"><Ltr>{u.code}</Ltr></span><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[u.status] ?? ""}`}>{tOr(t, `status.${u.status}`, u.status)}</span></>}
        description={[u.project, u.block && t("properties.d.blockLine", { block: u.block }), u.type, u.sizeValue && (u.sizeSqft ? t("properties.d.sqftLine", { value: Number(u.sizeValue), unit: u.sizeUnit ?? "", sqft: Number(u.sizeSqft).toLocaleString() }) : t("properties.d.sizeLine", { value: Number(u.sizeValue), unit: u.sizeUnit ?? "" }))].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap gap-2">
            {u.status === "available" && can("deals.create") && <Button className="gap-1.5" onClick={() => setDlg("book")}><Handshake className="size-4" /> {t("properties.d.book")}</Button>}
            {edit && <Button variant="outline" className="gap-1.5" onClick={() => setDlg("price")}><Tag className="size-4" /> {t("properties.d.changePrice")}</Button>}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-2 font-heading text-base font-semibold">{t("properties.d.at")}</h3>
          <Row k={t("properties.d.listPrice")} v={<span className="font-mono">{formatMoney(num(u.listPrice))}</span>} />
          <Row k={t("properties.d.latestValuation")} v={det?.valuations[0] ? <span className="font-mono">{formatMoney(num(det.valuations[0].value))}</span> : null} />
          {u.activeHold && <Row k={t("properties.d.holdUntil")} v={formatDate(u.activeHold.expiresAt)} />}
          {det?.currentBooking && (
            <Row k={t("properties.d.booking")} v={<Link href={`/dashboard/deals/${det.currentBooking.id}`} className="text-primary hover:underline">{det.currentBooking.bookingNo} · {det.currentBooking.customerName}</Link>} />
          )}
          <Row k={t("properties.d.currentOwner")} v={det?.ownership.find((o) => !o.toDate)?.ownerName} />
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><Scale className="size-4" /> {t("properties.d.legal")}</h3>
            {edit && <Button size="sm" variant="ghost" className="gap-1" onClick={() => setDlg("legal")}><Pencil className="size-3.5" /> {t("properties.d.edit")}</Button>}
          </div>
          {!legal ? <p className="py-3 text-sm text-muted-foreground">{t("properties.d.nothingRecorded")}</p> : (
            <>
              <Row k={t("properties.d.ownershipType")} v={label(t, OWNERSHIP, legal.ownershipType)} />
              <Row k={t("properties.d.title")} v={legal.titleStatus ? <Badge variant="outline" className={legal.titleStatus === "clear" ? "bg-success/12 text-success" : legal.titleStatus === "disputed" ? "bg-destructive/10 text-destructive" : "bg-warning/12 text-warning"}>{label(t, TITLE, legal.titleStatus)}</Badge> : null} />
              <Row k={t("properties.d.registryNo")} v={legal.registryNo} />
              <Row k={t("properties.d.fardKhasra")} v={[legal.fardNo, legal.khasraNo].filter(Boolean).join(" / ")} />
              <Row k={t("properties.d.allotment")} v={[legal.allotmentNo, legal.allotmentDate && formatDate(legal.allotmentDate)].filter(Boolean).join(" · ")} />
              <Row k={t("properties.d.mutationNoc")} v={[legal.mutationStatus, legal.nocStatus].filter(Boolean).join(" / ")} />
              <Row k={t("properties.d.transfer")} v={label(t, TRANSFER, legal.transferStatus)} />
              {legal.legalNotes && <p className="mt-2 rounded bg-secondary/50 p-2 text-sm">{legal.legalNotes}</p>}
            </>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-heading text-base font-semibold">{t("properties.d.chain")}</h3>
            {edit && <Button size="sm" variant="ghost" className="gap-1" onClick={() => setDlg("owner")}><Plus className="size-3.5" /> {t("properties.d.newOwner")}</Button>}
          </div>
          {(det?.ownership ?? []).length === 0 ? <p className="py-3 text-sm text-muted-foreground">{t("properties.d.noOwner")}</p> : (
            <ol className="space-y-2.5">
              {det!.ownership.map((o) => (
                <li key={o.id} className="border-s-2 border-gold/50 ps-3 text-sm">
                  <p className="font-medium">{o.ownerName} {!o.toDate && <Badge variant="outline" className="ms-1 bg-success/12 text-success">{t("properties.d.current")}</Badge>}</p>
                  <p className="text-xs text-muted-foreground">{label(t, ACQ, o.acquisitionType)} · {formatDate(o.fromDate)}{o.toDate ? ` – ${formatDate(o.toDate)}` : ""}{o.price ? ` · ${formatMoney(num(o.price), { compact: true })}` : ""}{o.deedRef ? ` · ${o.deedRef}` : ""}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><Gavel className="size-4" /> {t("properties.d.liens")}</h3>
            {edit && <Button size="sm" variant="ghost" className="gap-1" onClick={() => setDlg("restriction")}><Plus className="size-3.5" /> {t("properties.d.add")}</Button>}
          </div>
          {(det?.encumbrances ?? []).length === 0 ? <p className="py-3 text-sm text-success">{t("properties.d.noLiens")}</p> : (
            <ul className="space-y-2">
              {det!.encumbrances.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 text-sm">
                  <span><span className="font-medium">{label(t, ENC, e.kind)}</span>{e.holderName ? ` — ${e.holderName}` : ""}{e.amount ? ` · ${formatMoney(num(e.amount), { compact: true })}` : ""}<span className="block text-xs text-muted-foreground">{t("properties.d.since", { date: formatDate(e.since) })}{e.releasedOn ? ` · ${t("properties.d.released", { date: formatDate(e.releasedOn) })}` : ""}{e.notes ? ` · ${e.notes}` : ""}</span></span>
                  {e.status === "active" ? (edit && <Button size="sm" variant="outline" onClick={() => void api(`/v1/encumbrances/${e.id}/release`, { method: "POST", companyId: company.id, body: {} }).then(invalidate).then(() => toast.success(t("properties.d.releasedToast")))}>{t("properties.d.release")}</Button>) : <Badge variant="outline">{t("properties.d.releasedBadge")}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-heading text-base font-semibold"><TrendingUp className="size-4" /> {t("properties.d.valuations")}</h3>
            {edit && <Button size="sm" variant="ghost" className="gap-1" onClick={() => setDlg("valuation")}><Plus className="size-3.5" /> {t("properties.d.add")}</Button>}
          </div>
          {(det?.valuations ?? []).length === 0 ? <p className="py-3 text-sm text-muted-foreground">{t("properties.d.noValuation")}</p> : det!.valuations.map((v) => (
            <Row key={v.id} k={`${formatDate(v.valuationDate)} · ${tOr(t, `properties.val.${v.method}`, v.method)}`} v={<span className="font-mono">{formatMoney(num(v.value))}</span>} />
          ))}
          <h4 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("properties.d.priceHistory")}</h4>
          {(det?.priceHistory ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("properties.d.priceUnchanged")}</p> : det!.priceHistory.map((h, i) => (
            <Row key={i} k={`${formatDate(h.effectiveFrom)}${h.reason ? ` · ${h.reason}` : ""}`} v={<span className="font-mono">{formatMoney(num(h.price))}</span>} />
          ))}
        </Card>

        <Card className="p-5">
          <h3 className="mb-2 font-heading text-base font-semibold">{t("properties.d.statusHistory")}</h3>
          {u.statusHistory.length === 0 ? <p className="py-3 text-sm text-muted-foreground">{t("properties.d.noChanges")}</p> : (
            <ul className="space-y-2 text-sm">
              {u.statusHistory.slice(0, 8).map((h, i) => (
                <li key={i} className="flex justify-between gap-3"><span><span>{h.from ? tOr(t, `status.${h.from}`, h.from) : t("properties.d.statusNew")}</span> → <span className="font-medium">{tOr(t, `status.${h.to}`, h.to)}</span>{h.reason && <span className="text-xs text-muted-foreground"> · {h.reason}</span>}</span><span className="text-xs text-muted-foreground">{formatDate(h.changedAt)}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 font-heading text-base font-semibold"><Landmark className="size-4" /> {t("properties.d.documents")}</h3>
        <AttachmentsPanel entityType="property" entityId={id} canEdit={edit} categories={DOC_KINDS} />
      </Card>

      <LegalDialog open={dlg === "legal"} onOpenChange={(o) => !o && setDlg(null)} id={id} current={legal ?? null} />
      <ValuationDialog open={dlg === "valuation"} onOpenChange={(o) => !o && setDlg(null)} id={id} />
      <RestrictionDialog open={dlg === "restriction"} onOpenChange={(o) => !o && setDlg(null)} id={id} />
      <OwnerDialog open={dlg === "owner"} onOpenChange={(o) => !o && setDlg(null)} id={id} />
      <PriceDialog open={dlg === "price"} onOpenChange={(o) => !o && setDlg(null)} id={id} price={u.listPrice} />
      <LiveBookingDialog open={dlg === "book"} onOpenChange={(o) => !o && setDlg(null)} propertyId={id} />
    </div>
  );
}

type DialogProps = { open: boolean; onOpenChange: (o: boolean) => void; id: string };

function LegalDialog({ open, onOpenChange, id, current }: DialogProps & { current: Record<string, string | null> | null }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [f, setF] = React.useState<Record<string, string>>({});
  const v = (k: string) => f[k] ?? current?.[k] ?? "";
  const set = (k: string, val: string) => setF((x) => ({ ...x, [k]: val }));
  const pick = (k: string, list: Options) => (
    <Select value={v(k) || "none"} onValueChange={(x) => set(k, x === "none" ? "" : x)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="none">{t("properties.dlg.notSet")}</SelectItem>{list.values.map((a) => <SelectItem key={a} value={a}>{tOr(t, `${list.prefix}.${a}`, a)}</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={Scale} title={t("properties.dlg.legalTitle")} description={t("properties.dlg.legalDesc")} submitLabel={t("common.save")}
      onSubmit={async () => {
        const body: Record<string, string | null> = {};
        for (const [k, val] of Object.entries(f)) body[k] = val.trim() === "" ? null : val.trim();
        await api(`/v1/properties/${id}/legal`, { method: "PUT", companyId: company.id, body });
        await invalidate();
        setF({});
        toast.success(t("properties.dlg.saved"));
      }}>
      <FieldRow><Field label={t("properties.d.ownershipType")}>{pick("ownershipType", OWNERSHIP)}</Field><Field label={t("properties.dlg.titleStatus")}>{pick("titleStatus", TITLE)}</Field></FieldRow>
      <FieldRow><Field label={t("properties.d.registryNo")}><Input value={v("registryNo")} onChange={(e) => set("registryNo", e.target.value)} /></Field><Field label={t("properties.dlg.fardNo")}><Input value={v("fardNo")} onChange={(e) => set("fardNo", e.target.value)} /></Field></FieldRow>
      <FieldRow><Field label={t("properties.dlg.khasraNo")}><Input value={v("khasraNo")} onChange={(e) => set("khasraNo", e.target.value)} /></Field><Field label={t("properties.dlg.allotmentNo")}><Input value={v("allotmentNo")} onChange={(e) => set("allotmentNo", e.target.value)} /></Field></FieldRow>
      <FieldRow><Field label={t("properties.dlg.mutation")}><Input value={v("mutationStatus")} onChange={(e) => set("mutationStatus", e.target.value)} placeholder={t("properties.dlg.mutationPlaceholder")} /></Field><Field label={t("properties.dlg.noc")}><Input value={v("nocStatus")} onChange={(e) => set("nocStatus", e.target.value)} placeholder={t("properties.dlg.nocPlaceholder")} /></Field></FieldRow>
      <Field label={t("properties.d.transfer")}>{pick("transferStatus", TRANSFER)}</Field>
      <Field label={t("properties.dlg.notes")}><Textarea rows={2} value={v("legalNotes")} onChange={(e) => set("legalNotes", e.target.value)} /></Field>
    </FormDialog>
  );
}

function ValuationDialog({ open, onOpenChange, id }: DialogProps) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [date, setDate] = React.useState(todayIso());
  const [method, setMethod] = React.useState("market");
  const [value, setValue] = React.useState("");
  const [notes, setNotes] = React.useState("");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={TrendingUp} title={t("properties.dlg.valTitle")} description={t("properties.dlg.valDesc")} submitLabel={t("common.save")} submitDisabled={num(value) <= 0}
      onSubmit={async () => { await api(`/v1/properties/${id}/valuations`, { method: "POST", companyId: company.id, body: { valuationDate: date, method, value, notes: notes.trim() || undefined } }); await invalidate(); setValue(""); setNotes(""); toast.success(t("properties.dlg.valSaved")); }}>
      <FieldRow>
        <Field label={t("properties.dlg.dateLabel")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t("properties.dlg.valBy")}><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="market">{t("properties.val.market")}</SelectItem><SelectItem value="bank">{t("properties.val.bank")}</SelectItem><SelectItem value="internal">{t("properties.val.internal")}</SelectItem></SelectContent></Select></Field>
      </FieldRow>
      <Field label={t("properties.dlg.valValue")}><AmountInput value={value} onChange={setValue} /></Field>
      <Field label={t("properties.dlg.notes")}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </FormDialog>
  );
}

function RestrictionDialog({ open, onOpenChange, id }: DialogProps) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [kind, setKind] = React.useState("mortgage");
  const [holder, setHolder] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("");
  const [since, setSince] = React.useState(todayIso());
  const [notes, setNotes] = React.useState("");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={Gavel} title={t("properties.dlg.encTitle")} description={t("properties.dlg.encDesc")} submitLabel={t("properties.d.add")}
      onSubmit={async () => { await api(`/v1/properties/${id}/encumbrances`, { method: "POST", companyId: company.id, body: { kind, holderPartyId: holder || undefined, amount: amount || undefined, since, notes: notes.trim() || undefined } }); await invalidate(); setAmount(""); setNotes(""); toast.success(t("properties.d.add")); }}>
      <FieldRow>
        <Field label={t("properties.dlg.encKind")}><Select value={kind} onValueChange={setKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ENC.values.map((a) => <SelectItem key={a} value={a}>{t(`properties.enc.${a}`)}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("properties.dlg.since")}><Input type="date" value={since} onChange={(e) => setSince(e.target.value)} /></Field>
      </FieldRow>
      <Field label={t("properties.dlg.encHeldBy")}><PartySelect value={holder} onChange={(x) => setHolder(x)} placeholder={t("properties.dlg.encHolderPlaceholder")} /></Field>
      <Field label={t("properties.dlg.encAmount")}><AmountInput value={amount} onChange={setAmount} /></Field>
      <Field label={t("properties.dlg.notes")}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </FormDialog>
  );
}

function OwnerDialog({ open, onOpenChange, id }: DialogProps) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [owner, setOwner] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState("purchase");
  const [from, setFrom] = React.useState(todayIso());
  const [price, setPrice] = React.useState("");
  const [deed, setDeed] = React.useState("");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={Landmark} title={t("properties.dlg.ownTitle")} description={t("properties.dlg.ownDesc")} submitLabel={t("common.save")} submitDisabled={!owner}
      onSubmit={async () => { await api(`/v1/properties/${id}/ownership`, { method: "POST", companyId: company.id, body: { ownerPartyId: owner, acquisitionType: kind, fromDate: from, price: price || undefined, deedRef: deed.trim() || undefined } }); await invalidate(); setPrice(""); setDeed(""); toast.success(t("properties.dlg.ownRecorded")); }}>
      <Field label={t("properties.d.newOwner")}><PartySelect value={owner} onChange={(x) => setOwner(x)} placeholder={t("properties.dlg.ownPick")} createLabel={t("properties.dlg.ownAddNew")} /></Field>
      <FieldRow>
        <Field label={t("properties.dlg.ownHow")}><Select value={kind} onValueChange={setKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACQ.values.map((a) => <SelectItem key={a} value={a}>{t(`properties.acq.${a}`)}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("properties.dlg.ownFrom")}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      </FieldRow>
      <FieldRow><Field label={t("properties.dlg.ownPrice")}><AmountInput value={price} onChange={setPrice} /></Field><Field label={t("properties.dlg.ownDeed")}><Input value={deed} onChange={(e) => setDeed(e.target.value)} /></Field></FieldRow>
    </FormDialog>
  );
}

function PriceDialog({ open, onOpenChange, id, price }: DialogProps & { price: string }) {
  const t = useT();
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("");
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} icon={Tag} title={t("properties.dlg.priceTitle")} description={t("properties.dlg.priceDesc", { price: formatMoney(num(price)) })} submitLabel={t("properties.dlg.priceSubmit")} submitDisabled={num(value) <= 0 || reason.trim().length < 3}
      onSubmit={async () => { await api(`/v1/properties/${id}`, { method: "PATCH", companyId: company.id, body: { listPrice: value, reason: reason.trim() } }); await invalidate(); setValue(""); setReason(""); toast.success(t("properties.dlg.priceUpdated")); }}>
      <Field label={t("properties.dlg.priceNew")}><AmountInput value={value} onChange={setValue} /></Field>
      <Field label={t("properties.dlg.priceWhy")}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("properties.dlg.pricePlaceholder")} /></Field>
    </FormDialog>
  );
}
