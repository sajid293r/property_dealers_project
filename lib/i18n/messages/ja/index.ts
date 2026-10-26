import type { Messages } from "../en";
import common from "./common";
import nav from "./nav";
import shell from "./shell";
import auth from "./auth";
import account from "./account";
import dashboard from "./dashboard";
import admin from "./admin";

const messages: Messages = { ...common, ...nav, ...shell, ...auth, ...account, ...dashboard, ...admin };
export default messages;
