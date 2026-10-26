import type en from "../en/admin";

const admin: Record<keyof typeof en, string> = {
  "admin.language.title": "Langue",
  "admin.language.label": "Langue par défaut des nouveaux utilisateurs",
  "admin.language.notSet": "Non définie (chacun garde son propre choix)",
  "admin.language.help": "Les personnes qui n'ont pas choisi leur langue voient l'application dans celle-ci. Chacun peut changer la sienne sous « Mon compte ».",
  "admin.language.saved": "Langue par défaut enregistrée",
};
export default admin;
