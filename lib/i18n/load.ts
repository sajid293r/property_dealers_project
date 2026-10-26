import type { LanguageCode } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * Dictionaries are loaded on demand: a visitor downloads only the language they use (English is always bundled
 * as the fallback, see messages/en). Add a language here and in config.ts.
 */
const LOADERS: Record<Exclude<LanguageCode, "en">, () => Promise<{ default: Messages }>> = {
  ur: () => import("@/lib/i18n/messages/ur"),
  ps: () => import("@/lib/i18n/messages/ps"),
  zh: () => import("@/lib/i18n/messages/zh"),
  fr: () => import("@/lib/i18n/messages/fr"),
  de: () => import("@/lib/i18n/messages/de"),
  ja: () => import("@/lib/i18n/messages/ja"),
  ar: () => import("@/lib/i18n/messages/ar"),
};

export async function loadMessages(lang: LanguageCode): Promise<Partial<Messages> | null> {
  if (lang === "en") return null;
  try {
    return (await LOADERS[lang]()).default;
  } catch {
    return null; // the English fallback keeps the app usable
  }
}
