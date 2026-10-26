/**
 * The interface languages. The API keeps its own copy (api/src/languages.ts); api/test/language.test.ts fails if they drift.
 * `LANGUAGE_CODES` must stay a plain list of string literals on one statement: that test reads it.
 */
export const LANGUAGE_CODES = ["en", "ur", "ps", "zh", "fr", "de", "ja", "ar"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export interface LanguageInfo {
  code: LanguageCode;
  /** The language written in its own script, as shown in the picker. */
  native: string;
  english: string;
  dir: "ltr" | "rtl";
  /** BCP-47 tag for dates (Western digits and the Gregorian calendar are forced; see lib/format.ts). */
  locale: string;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: "en", native: "English", english: "English", dir: "ltr", locale: "en-PK" },
  { code: "ur", native: "اردو", english: "Urdu", dir: "rtl", locale: "ur-PK-u-nu-latn-ca-gregory" },
  { code: "ps", native: "پښتو", english: "Pashto", dir: "rtl", locale: "ps-AF-u-nu-latn-ca-gregory" },
  { code: "zh", native: "中文", english: "Chinese (Simplified)", dir: "ltr", locale: "zh-CN-u-nu-latn-ca-gregory" },
  { code: "fr", native: "Français", english: "French", dir: "ltr", locale: "fr-FR-u-nu-latn-ca-gregory" },
  { code: "de", native: "Deutsch", english: "German", dir: "ltr", locale: "de-DE-u-nu-latn-ca-gregory" },
  { code: "ja", native: "日本語", english: "Japanese", dir: "ltr", locale: "ja-JP-u-nu-latn-ca-gregory" },
  { code: "ar", native: "العربية", english: "Arabic", dir: "rtl", locale: "ar-SA-u-nu-latn-ca-gregory" },
];

/**
 * Chinese and Japanese fonts are split into about a hundred pieces each, so next/font would bundle them all at
 * build time. Instead their stylesheet is added to the page only when that language is on screen (layout.tsx on
 * first load, provider.tsx when switching), and the browser then fetches just the pieces it needs. Without network
 * access the system fonts listed in globals.css take over.
 */
export const FONT_STYLESHEETS: Partial<Record<LanguageCode, string>> = {
  zh: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
  ja: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap",
};

export const DEFAULT_LANGUAGE: LanguageCode = "en";
export const LANGUAGE_COOKIE = "propiq-lang";
export const LANGUAGE_STORAGE_KEY = "propiq-lang";

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === "string" && (LANGUAGE_CODES as readonly string[]).includes(v);
}

export function languageInfo(code: LanguageCode): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
}
