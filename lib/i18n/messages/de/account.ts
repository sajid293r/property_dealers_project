import type en from "../en/account";

const account: Record<keyof typeof en, string> = {
  "account.demoNotice": "Melden Sie sich mit Ihrem eigenen Konto an, um es zu verwalten. Die Demo hat kein Konto.",
  "account.eyebrow": "Konto",
  "account.title": "Mein Konto",
  "account.description": "Ihr Name, Ihre Sprache und Ihr Passwort",
  "account.profile": "Profil",
  "account.yourName": "Ihr Name",
  "account.emailField": "E-Mail (zur Anmeldung)",
  "account.saveName": "Namen speichern",
  "account.nameSaved": "Name gespeichert",
  "account.changePassword": "Passwort ändern",
  "account.newPassword": "Neues Passwort",
  "account.typeAgain": "Noch einmal eingeben",
  "account.passwordShort": "Wählen Sie ein Passwort mit mindestens 8 Zeichen.",
  "account.passwordMismatch": "Die beiden Passwörter stimmen nicht überein.",
  "account.passwordChanged": "Passwort geändert",

  "account.language.title": "Sprache",
  "account.language.help": "Die Sprache, in der diese App für Sie angezeigt wird – auf jedem Gerät, auf dem Sie sich anmelden. Namen, Notizen und andere von Benutzern eingegebene Texte werden nicht übersetzt.",
  "account.language.companyDefault": "Standardsprache meiner Firma verwenden ({language})",
  "account.language.saved": "Sprache gespeichert",
};
export default account;
