import { cookies } from "next/headers";
import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE, isLanguageCode, type LanguageCode } from "@/lib/i18n/config";

/** The language from the last visit on this browser (the cookie the picker writes). */
export async function getServerLanguage(): Promise<LanguageCode> {
  const v = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  return isLanguageCode(v) ? v : DEFAULT_LANGUAGE;
}
