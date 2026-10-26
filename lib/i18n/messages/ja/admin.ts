import type en from "../en/admin";

const admin: Record<keyof typeof en, string> = {
  "admin.language.title": "言語",
  "admin.language.label": "新規ユーザーの既定の言語",
  "admin.language.notSet": "未設定（各自の選択が優先されます）",
  "admin.language.help": "自分の言語を選んでいないユーザーには、この言語でアプリが表示されます。各自が「マイアカウント」で変更できます。",
  "admin.language.saved": "既定の言語を保存しました",
};
export default admin;
