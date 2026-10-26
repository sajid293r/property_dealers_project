import type en from "../en/admin";

const admin: Record<keyof typeof en, string> = {
  "admin.language.title": "اللغة",
  "admin.language.label": "اللغة الافتراضية للمستخدمين الجدد",
  "admin.language.notSet": "غير محددة (يحتفظ كل شخص باختياره)",
  "admin.language.help": "يرى الأشخاص الذين لم يختاروا لغتهم الخاصة التطبيق بهذه اللغة. يمكن لكل شخص تغيير لغته من «حسابي».",
  "admin.language.saved": "تم حفظ اللغة الافتراضية",
};
export default admin;
