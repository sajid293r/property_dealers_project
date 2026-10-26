/**
 * The interface languages PropIQ supports. The website keeps its own copy (lib/i18n/config.ts); a test compares the two.
 * Stored codes: users.preferred_language (null = not chosen) and companies.settings.default_language.
 */
export const LANGUAGES = ["en", "ur", "ps", "zh", "fr", "de", "ja", "ar"] as const;
export type Language = (typeof LANGUAGES)[number];
