import { loadConfig } from "./config.js";
import { createVerifier } from "./auth.js";
import { Db } from "./db.js";
import { buildApp } from "./app.js";
import { loadCnicKeys } from "./cnic.js";

const config = loadConfig();
const db = Db.create(config);
const app = buildApp({ config, db, verifier: createVerifier(config), cnic: loadCnicKeys(process.env) });

const stop = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

app.listen({ port: config.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
