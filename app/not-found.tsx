"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

export default function NotFound() {
  const t = useT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Compass className="size-7" /></span>
      <h1 className="font-heading text-3xl font-semibold">{t("edge.notFound.title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("edge.notFound.text")}</p>
      <Button asChild><Link href="/dashboard">{t("edge.notFound.home")}</Link></Button>
    </main>
  );
}
