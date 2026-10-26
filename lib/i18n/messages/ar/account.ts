import type en from "../en/account";

const account: Record<keyof typeof en, string> = {
  "account.demoNotice": "سجّل الدخول بحسابك الخاص لإدارته. العرض التجريبي ليس له حساب.",
  "account.eyebrow": "الحساب",
  "account.title": "حسابي",
  "account.description": "اسمك ولغتك وكلمة المرور",
  "account.profile": "الملف الشخصي",
  "account.yourName": "اسمك",
  "account.emailField": "البريد الإلكتروني (للدخول)",
  "account.saveName": "حفظ الاسم",
  "account.nameSaved": "تم حفظ الاسم",
  "account.changePassword": "تغيير كلمة المرور",
  "account.newPassword": "كلمة المرور الجديدة",
  "account.typeAgain": "اكتبها مرة أخرى",
  "account.passwordShort": "اختر كلمة مرور من 8 أحرف على الأقل.",
  "account.passwordMismatch": "كلمتا المرور غير متطابقتين.",
  "account.passwordChanged": "تم تغيير كلمة المرور",

  "account.language.title": "اللغة",
  "account.language.help": "اللغة التي يُعرض بها التطبيق لك، على كل جهاز تسجّل الدخول منه. الأسماء والملاحظات وغيرها مما يكتبه الناس لا تُترجم.",
  "account.language.companyDefault": "استخدم اللغة الافتراضية لشركتي ({language})",
  "account.language.saved": "تم حفظ اللغة",
};
export default account;
