import common from "./common";
import nav from "./nav";
import shell from "./shell";
import auth from "./auth";
import account from "./account";
import dashboard from "./dashboard";
import admin from "./admin";

/** English is the source of truth: every other language must have exactly these keys (tsc and scripts/check-i18n.mjs enforce it). */
const en = { ...common, ...nav, ...shell, ...auth, ...account, ...dashboard, ...admin };

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export default en as Messages;
