"use client";

import * as React from "react";
import { Direction } from "radix-ui";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  FONT_STYLESHEETS,
  isLanguageCode,
  languageInfo,
  type LanguageCode,
  type LanguageInfo,
} from "@/lib/i18n/config";
import { loadMessages } from "@/lib/i18n/load";
import type { Messages } from "@/lib/i18n/messages/en";
import { makeTranslate, setRuntimeLanguage, type TranslateFn } from "@/lib/i18n/runtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { useCompany } from "@/lib/providers/company-provider";

interface LanguageContextValue {
  lang: LanguageCode;
  info: LanguageInfo;
  dir: "ltr" | "rtl";
  /** Date locale tag (Western digits, Gregorian calendar). */
  locale: string;
  t: TranslateFn;
  /** Change the language now; when signed in to a real company it is also saved to the person's account. */
  setLanguage: (code: LanguageCode) => Promise<void>;
  /** Forget the personal choice so the company's default applies (real companies only). */
  adoptCompanyDefault: () => Promise<void>;
  /** The language the person has saved on their account (null = none chosen; undefined = not known yet or demo). */
  savedLanguage: LanguageCode | null | undefined;
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

function writeBrowserChoice(code: LanguageCode) {
  try {
    document.cookie = `${LANGUAGE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* cookies blocked: the choice still holds for this page view */
  }
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    /* private mode */
  }
}

function applyToDocument(info: LanguageInfo) {
  const el = document.documentElement;
  el.lang = info.code;
  el.dir = info.dir;
  const href = FONT_STYLESHEETS[info.code];
  if (href && !document.querySelector(`link[data-lang-font="${info.code}"], link[href="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.langFont = info.code;
    document.head.appendChild(link);
  }
}

export function LanguageProvider({
  initialLang,
  initialMessages,
  children,
}: {
  initialLang: LanguageCode;
  initialMessages: Partial<Messages> | null;
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  const { company, live, userLanguage } = useCompany();
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<{ lang: LanguageCode; messages: Partial<Messages> | null }>({ lang: initialLang, messages: initialMessages });
  const info = languageInfo(state.lang);

  // Keep the non-React readers (toasts, number and date formatting) on the same language as the screen.
  // Set during render on purpose: children render after this and must already see the right language.
  setRuntimeLanguage(state.lang, state.messages);

  const t = React.useMemo(() => makeTranslate(state.lang, state.messages), [state.lang, state.messages]);

  const switchTo = React.useCallback(async (code: LanguageCode) => {
    const messages = await loadMessages(code);
    setState({ lang: code, messages });
    writeBrowserChoice(code);
    applyToDocument(languageInfo(code));
  }, []);

  const companyDefault = live ? company.defaultLanguage : undefined;

  // After sign-in the saved choice wins, then the company's default, then whatever this browser remembered.
  React.useEffect(() => {
    if (!live || userLanguage === undefined) return;
    const target = userLanguage ?? companyDefault;
    // Reconciling with the account's answer (an external system) is exactly what an effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (target && target !== state.lang) void switchTo(target);
    // state.lang is deliberately not a dependency: this only reconciles when the account's answer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, userLanguage, companyDefault, switchTo]);

  const setLanguage = React.useCallback(
    async (code: LanguageCode) => {
      await switchTo(code);
      if (status !== "live") return;
      try {
        await api("/v1/me", { method: "PATCH", body: { language: code } });
        await queryClient?.invalidateQueries({ queryKey: ["live", "me"] });
      } catch {
        toast.error(makeTranslate(code, null)("shell.language.saveFailed"));
      }
    },
    [switchTo, status, queryClient],
  );

  const adoptCompanyDefault = React.useCallback(async () => {
    if (status !== "live") return;
    try {
      await api("/v1/me", { method: "PATCH", body: { language: null } });
      await queryClient?.invalidateQueries({ queryKey: ["live", "me"] });
      if (companyDefault) await switchTo(companyDefault);
    } catch {
      toast.error(makeTranslate(state.lang, state.messages)("shell.language.saveFailed"));
    }
  }, [status, queryClient, companyDefault, switchTo, state.lang, state.messages]);

  const value = React.useMemo<LanguageContextValue>(
    () => ({ lang: state.lang, info, dir: info.dir, locale: info.locale, t, setLanguage, adoptCompanyDefault, savedLanguage: live ? userLanguage : undefined }),
    [state.lang, info, t, setLanguage, adoptCompanyDefault, live, userLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      <Direction.DirectionProvider dir={info.dir}>{children}</Direction.DirectionProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

/** The translate function for the language on screen. Re-renders the component when the language changes. */
export function useT(): TranslateFn {
  return useLanguage().t;
}

export { LANGUAGES, DEFAULT_LANGUAGE, isLanguageCode };

/** Signed offset for slide-in animations: content enters from the side the text starts on (left in English, right in Urdu). */
export function useSlide() {
  const { dir } = useLanguage();
  return React.useCallback((px: number) => (dir === "rtl" ? px : -px), [dir]);
}
