import type en from "../en/account";

const account: Record<keyof typeof en, string> = {
  "account.demoNotice": "Connectez-vous avec votre propre compte pour le gérer. La démo n'a pas de compte.",
  "account.eyebrow": "Compte",
  "account.title": "Mon compte",
  "account.description": "Votre nom, votre langue et votre mot de passe",
  "account.profile": "Profil",
  "account.yourName": "Votre nom",
  "account.emailField": "E-mail (utilisé pour vous connecter)",
  "account.saveName": "Enregistrer le nom",
  "account.nameSaved": "Nom enregistré",
  "account.changePassword": "Changer le mot de passe",
  "account.newPassword": "Nouveau mot de passe",
  "account.typeAgain": "Saisissez-le à nouveau",
  "account.passwordShort": "Choisissez un mot de passe d'au moins 8 caractères.",
  "account.passwordMismatch": "Les deux mots de passe ne sont pas identiques.",
  "account.passwordChanged": "Mot de passe modifié",

  "account.language.title": "Langue",
  "account.language.help": "La langue dans laquelle cette application vous est présentée, sur chaque appareil où vous vous connectez. Les noms, notes et autres textes saisis par les utilisateurs ne sont pas traduits.",
  "account.language.companyDefault": "Utiliser la langue par défaut de mon entreprise ({language})",
  "account.language.saved": "Langue enregistrée",
};
export default account;
