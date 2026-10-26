import type en from "../en/account";

const account: Record<keyof typeof en, string> = {
  "account.demoNotice": "د خپل حساب د اداره کولو لپاره په خپل حساب ننوځئ. ډیمو کې حساب نشته.",
  "account.eyebrow": "حساب",
  "account.title": "زما حساب",
  "account.description": "ستاسو نوم، ژبه او پټنوم",
  "account.profile": "پروفایل",
  "account.yourName": "ستاسو نوم",
  "account.emailField": "ایمېل (د ننوتلو لپاره)",
  "account.saveName": "نوم خوندي کړئ",
  "account.nameSaved": "نوم خوندي شو",
  "account.changePassword": "پټنوم بدل کړئ",
  "account.newPassword": "نوی پټنوم",
  "account.typeAgain": "بیا یې ولیکئ",
  "account.passwordShort": "لږ تر لږه د 8 توریو پټنوم وټاکئ.",
  "account.passwordMismatch": "دواړه پټنومونه یو شان نه دي.",
  "account.passwordChanged": "پټنوم بدل شو",

  "account.language.title": "ژبه",
  "account.language.help": "هغه ژبه چې دا اپ به در ته پکې ښکاره کېږي، په هره وسیله چې ننوځئ. نومونه، یادښتونه او نور هغه څه چې خلک یې لیکي نه ژباړل کېږي.",
  "account.language.companyDefault": "د خپل شرکت تلواله ژبه وکاروئ ({language})",
  "account.language.saved": "ژبه خوندي شوه",
};
export default account;
