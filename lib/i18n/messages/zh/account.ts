import type en from "../en/account";

const account: Record<keyof typeof en, string> = {
  "account.demoNotice": "请使用你自己的账户登录后再进行管理。演示模式没有账户。",
  "account.eyebrow": "账户",
  "account.title": "我的账户",
  "account.description": "你的姓名、语言和密码",
  "account.profile": "个人资料",
  "account.yourName": "你的姓名",
  "account.emailField": "邮箱（用于登录）",
  "account.saveName": "保存姓名",
  "account.nameSaved": "姓名已保存",
  "account.changePassword": "修改密码",
  "account.newPassword": "新密码",
  "account.typeAgain": "再输入一次",
  "account.passwordShort": "请设置至少 8 个字符的密码。",
  "account.passwordMismatch": "两次输入的密码不一致。",
  "account.passwordChanged": "密码已更改",

  "account.language.title": "语言",
  "account.language.help": "此应用为你显示的语言，在你登录的每台设备上都适用。姓名、备注及其他由用户输入的内容不会被翻译。",
  "account.language.companyDefault": "使用公司的默认语言（{language}）",
  "account.language.saved": "语言已保存",
};
export default account;
