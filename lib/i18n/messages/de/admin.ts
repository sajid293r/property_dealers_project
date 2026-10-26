import type en from "../en/admin";

const admin: Record<keyof typeof en, string> = {
  "admin.language.title": "Sprache",
  "admin.language.label": "Standardsprache für neue Benutzer",
  "admin.language.notSet": "Nicht festgelegt (jeder behält seine eigene Wahl)",
  "admin.language.help": "Personen, die keine eigene Sprache gewählt haben, sehen die App in dieser Sprache. Jeder kann seine Sprache unter „Mein Konto“ ändern.",
  "admin.language.saved": "Standardsprache gespeichert",
};
export default admin;
