"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><TriangleAlert className="size-7" /></span>
      <h1 className="font-heading text-3xl font-semibold">{t("edge.error.title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("edge.error.text")}</p>
      <Button onClick={reset}>{t("common.retry")}</Button>
    </main>
  );
}
