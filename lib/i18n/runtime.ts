import en, { type MessageKey, type Messages } from "@/lib/i18n/messages/en";
import { DEFAULT_LANGUAGE, languageInfo, type LanguageCode } from "@/lib/i18n/config";
import { interpolate, type Vars } from "@/lib/i18n/translate";

/**
 * The language in use, readable from code that is not a React component (toasts, the insights engine,
 * number and date formatting). LanguageProvider keeps it in step with what is on screen.
 * Components should prefer useT(), which also re-renders them when the language changes.
 */
let current: { lang: LanguageCode; messages: Partial<Messages> | null } = { lang: DEFAULT_LANGUAGE, messages: null };

export function setRuntimeLanguage(lang: LanguageCode, messages: Partial<Messages> | null) {
  current = { lang, messages };
}

export function runtimeLanguage(): LanguageCode {
  return current.lang;
}

/** Date locale tag for the language in use (see config.ts). */
export function runtimeLocale(): string {
  return languageInfo(current.lang).locale;
}

export type TranslateFn = (key: MessageKey | (string & {}), vars?: Vars) => string;

/** Build a translate function for one language. Unknown key -> English -> the key itself. Never throws. */
export function makeTranslate(lang: LanguageCode, messages: Partial<Messages> | null): TranslateFn {
  return (key, vars) => {
    const table = messages as Record<string, string> | null;
    const msg = table?.[key] ?? (en as Record<string, string>)[key];
    if (msg === undefined) {
      if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    return interpolate(msg, vars, lang);
  };
}

/** Translate with the language in use right now. */
export const translate: TranslateFn = (key, vars) => makeTranslate(current.lang, current.messages)(key, vars);
