import type en from "../en/admin";

const admin: Record<keyof typeof en, string> = {
  "admin.language.title": "语言",
  "admin.language.label": "新用户的默认语言",
  "admin.language.notSet": "未设置（每个人保留自己的选择）",
  "admin.language.help": "尚未选择自己语言的用户将以此语言显示应用。每个人都可以在“我的账户”中更改自己的语言。",
  "admin.language.saved": "默认语言已保存",
};
export default admin;
