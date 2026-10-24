"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FileImage, FileSpreadsheet, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCompany } from "@/lib/providers/company-provider";
import { useInvalidateFinance } from "@/lib/hooks/use-live";
import { api, apiBlob } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

export type AttachmentEntity = "party" | "property" | "project" | "booking" | "voucher" | "contract" | "cheque" | "quotation" | "lead" | "employee" | "construction_contract";

interface FileRow { id: string; fileName: string; mime: string; sizeBytes: number; category: string | null; note: string | null; createdAt: string; uploadedBy: string | null }

const MAX = 4 * 1024 * 1024;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const icon = (mime: string) => (mime.startsWith("image/") ? FileImage : mime.includes("sheet") || mime.includes("excel") || mime === "text/csv" ? FileSpreadsheet : FileText);

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

/** The files kept against one record. Shown in a side panel opened by <AttachmentsButton />. */
export function AttachmentsPanel({ entityType, entityId, canEdit = true, categories }: { entityType: AttachmentEntity; entityId: string; canEdit?: boolean; categories?: string[] }) {
  const { company } = useCompany();
  const invalidate = useInvalidateFinance();
  const input = React.useRef<HTMLInputElement>(null);
  const [category, setCategory] = React.useState(categories?.[0] ?? "");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const q = useQuery({ queryKey: ["live", "attachments", entityType, entityId], queryFn: () => api<FileRow[]>(`/v1/attachments?entityType=${entityType}&entityId=${entityId}`, { companyId: company.id }) });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX) throw new Error(`${f.name} is larger than 4 MB. Compress it or split it.`);
        const data = await toBase64(f);
        await api("/v1/attachments", { method: "POST", companyId: company.id, body: { entityType, entityId, fileName: f.name, mime: f.type || "application/octet-stream", data, category: category || undefined, note: note.trim() || undefined } });
      }
      setNote("");
      await invalidate();
      toast.success(files.length > 1 ? "Files added" : "File added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function open(f: FileRow) {
    try {
      const { blob, type } = await apiBlob(`/v1/attachments/${f.id}/file`, { companyId: company.id });
      const url = URL.createObjectURL(new Blob([blob], { type }));
      if (type === "application/pdf" || type.startsWith("image/")) window.open(url, "_blank", "noopener");
      else {
        const a = document.createElement("a");
        a.href = url;
        a.download = f.fileName;
        a.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the file.");
    }
  }

  async function remove(f: FileRow) {
    try {
      await api(`/v1/attachments/${f.id}`, { method: "DELETE", companyId: company.id });
      await invalidate();
      toast.success("File removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove it.");
    }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <div className="flex flex-wrap gap-2">
            {categories && (
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="What is this file?">
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            )}
            <Input className="h-8 min-w-[160px] flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={300} />
          </div>
          <input ref={input} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(e) => void upload(e.target.files)} />
          <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => input.current?.click()}><Upload className="size-3.5" /> {busy ? "Uploading…" : "Choose file"}</Button>
          <p className="text-xs text-muted-foreground">PDF, photos, Word or Excel. Up to 4 MB each.</p>
        </div>
      )}
      {q.isLoading ? <Skeleton className="h-24 w-full" /> : (q.data ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No files yet.</p>
      ) : (
        <ul className="space-y-2">
          {(q.data ?? []).map((f) => {
            const Icon = icon(f.mime);
            return (
              <li key={f.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void open(f)}>
                  <span className="block truncate font-medium hover:text-primary hover:underline">{f.fileName}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[f.category, kb(f.sizeBytes), formatDate(f.createdAt), f.uploadedBy, f.note].filter(Boolean).join(" · ")}</span>
                </button>
                {canEdit && <Button size="icon-sm" variant="ghost" aria-label="Remove file" onClick={() => void remove(f)}><Trash2 className="size-4" /></Button>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A "Documents" button that opens the panel in a side sheet. */
export function AttachmentsButton({ entityType, entityId, title, canEdit = true, categories, iconOnly, size = "sm" }: { entityType: AttachmentEntity; entityId: string; title: string; canEdit?: boolean; categories?: string[]; iconOnly?: boolean; size?: "sm" | "default" }) {
  const { company } = useCompany();
  const [open, setOpen] = React.useState(false);
  const count = useQuery({ queryKey: ["live", "attachments", entityType, entityId], queryFn: () => api<FileRow[]>(`/v1/attachments?entityType=${entityType}&entityId=${entityId}`, { companyId: company.id }), staleTime: 20_000, retry: false });
  const n = count.data?.length ?? 0;
  return (
    <>
      <Button size={iconOnly ? "icon-sm" : size} variant="outline" className="gap-1.5" onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={iconOnly ? "Documents" : undefined}>
        <Paperclip className="size-3.5" /> {!iconOnly && "Documents"}{n > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">{n}</span>}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Documents</SheetTitle>
            <SheetDescription>{title}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{open && <AttachmentsPanel entityType={entityType} entityId={entityId} canEdit={canEdit} categories={categories} />}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
