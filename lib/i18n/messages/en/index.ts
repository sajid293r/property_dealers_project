import common from "./common";
import nav from "./nav";
import shell from "./shell";
import auth from "./auth";
import account from "./account";
import dashboard from "./dashboard";
import admin from "./admin";
import files from "./files";
import projects from "./projects";
import properties from "./properties";
import customers from "./customers";
import deals from "./deals";
import sales from "./sales";
import vouchers from "./vouchers";
import finance from "./finance";
import people from "./people";
import administration from "./administration";
import site from "./site";
import output from "./output";
import demo from "./demo";

/** English is the source of truth: every other language must have exactly these keys (tsc and scripts/check-i18n.mjs enforce it). */
const en = { ...common, ...nav, ...shell, ...auth, ...account, ...dashboard, ...admin, ...files, ...projects, ...properties, ...customers, ...deals, ...sales, ...vouchers, ...finance, ...people, ...administration, ...site, ...output, ...demo };

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export default en as Messages;
