import type en from "../en/account";

const account: Record<keyof typeof en, string> = {
  "account.demoNotice": "アカウントを管理するには、ご自身のアカウントでサインインしてください。デモにはアカウントがありません。",
  "account.eyebrow": "アカウント",
  "account.title": "マイアカウント",
  "account.description": "お名前、言語、パスワード",
  "account.profile": "プロフィール",
  "account.yourName": "お名前",
  "account.emailField": "メールアドレス（サインイン用）",
  "account.saveName": "名前を保存",
  "account.nameSaved": "名前を保存しました",
  "account.changePassword": "パスワードを変更",
  "account.newPassword": "新しいパスワード",
  "account.typeAgain": "もう一度入力",
  "account.passwordShort": "8文字以上のパスワードを設定してください。",
  "account.passwordMismatch": "2つのパスワードが一致しません。",
  "account.passwordChanged": "パスワードを変更しました",

  "account.language.title": "言語",
  "account.language.help": "このアプリがあなたに表示される言語です。サインインしたすべての端末に適用されます。名前やメモなど、ユーザーが入力した内容は翻訳されません。",
  "account.language.companyDefault": "会社の既定の言語を使う（{language}）",
  "account.language.saved": "言語を保存しました",
};
export default account;
