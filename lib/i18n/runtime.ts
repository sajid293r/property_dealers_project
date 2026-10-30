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

/** True when the dictionary has this key (for labels built from stored codes, where an unknown code should show as it is). */
export function hasMessage(key: string): boolean {
  return key in (en as Record<string, string>);
}

/** Key for a stored English label, e.g. "On track" -> "dm.x.on_track" (see the "dm.x." entries in messages/en/demo.ts). */
export const xKey = (text: string) => "dm.x." + text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60).replace(/_+$/, "");

/** The label in the language on screen; an unknown label shows as it is. */
export function tx(text: string, vars?: Vars): string {
  return tOr(translate, xKey(text), text, vars);
}

/** `t(key)` when the key exists, otherwise the fallback (usually the stored value itself). */
export function tOr(t: TranslateFn, key: string, fallback: string, vars?: Vars): string {
  return hasMessage(key) ? t(key, vars) : fallback;
}
