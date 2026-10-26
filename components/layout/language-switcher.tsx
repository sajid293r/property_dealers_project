"use client";

import * as React from "react";
import { Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LANGUAGES } from "@/lib/i18n/config";
import { useLanguage } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Language picker. Every language is written in its own script, with its own `lang`, so a person can find theirs
 * whatever language the screen is in. "icon" is the compact top-bar button; "full" shows the language name.
 */
export function LanguageSwitcher({ variant = "icon", className, align = "end" }: { variant?: "icon" | "full"; className?: string; align?: "start" | "end" }) {
  const { lang, info, setLanguage, t } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button variant="ghost" size="sm" className={cn("h-8 gap-1.5 px-2 text-xs font-medium", className)} aria-label={t("common.language")}>
            <Globe className="size-4" />
            <span lang={info.code} className="hidden sm:inline">{info.native}</span>
          </Button>
        ) : (
          <Button type="button" variant="outline" className={cn("h-10 gap-2", className)} aria-label={t("common.language")}>
            <Globe className="size-4" />
            <span lang={info.code}>{info.native}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("shell.language.title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} lang={l.code} dir={l.dir} onSelect={() => void setLanguage(l.code)} className="justify-between gap-3">
            <span className="text-sm font-medium">{l.native}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground" lang="en" dir="ltr">
              {l.code !== "en" && l.english.split(" ")[0]}
              {l.code === lang && <Check className="size-4 text-primary" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
