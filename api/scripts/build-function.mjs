// Bundles the API into one file for Netlify Functions: netlify/functions/api.mjs (generated; not committed).
// Run by the Netlify build command. The banner gives bundled CommonJS packages (pg, …) a working `require`.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL("netlify/functions-src/api.mts", root))],
  outfile: fileURLToPath(new URL("netlify/functions/api.mjs", root)),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["pg-native"],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: "info",
});
