// Checks the translation dictionaries: every language must have exactly the keys English has, and each message must
// use the same {placeholders} as English. Run: node scripts/check-i18n.mjs   (exit code 1 if anything is wrong)
// Check just some languages while writing them:  node scripts/check-i18n.mjs ar de
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "lib", "i18n", "messages");
const LANGS = ["en", "ur", "ps", "zh", "fr", "de", "ja", "ar"];

async function load(lang) {
  const dir = path.join(root, lang);
  const out = {};
  const areas = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts");
  for (const f of areas) {
    const js = ts.transpileModule(fs.readFileSync(path.join(dir, f), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
    const mod = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
    for (const [k, v] of Object.entries(mod.default)) {
      if (k in out) problems.push(`${lang}/${f}: duplicate key ${k}`);
      out[k] = { value: v, area: f.replace(/\.ts$/, "") };
    }
  }
  return out;
}

/** Names used as {name} or {name, plural, ...} (the words inside the plural cases are not names). */
function placeholders(msg) {
  const names = new Set();
  let depth = 0;
  let i = 0;
  while (i < msg.length) {
    if (msg[i] === "{") {
      // read the name at the start of this brace group
      const m = /^\{\s*(\w+)\s*(,|\})/.exec(msg.slice(i));
      if (m) names.add(m[1]);
      depth++;
    } else if (msg[i] === "}") depth--;
    i++;
  }
  return names;
}

const problems = [];
const en = await load("en");
let checked = 0;

const only = process.argv.slice(2);
for (const lang of LANGS.filter((l) => l !== "en" && (only.length === 0 || only.includes(l)))) {
  const dict = await load(lang);
  for (const key of Object.keys(en)) {
    if (!(key in dict)) problems.push(`${lang}: missing ${key}`);
  }
  for (const key of Object.keys(dict)) {
    if (!(key in en)) problems.push(`${lang}: extra key ${key} (not in English)`);
  }
  for (const [key, { value }] of Object.entries(dict)) {
    const source = en[key]?.value;
    if (source === undefined) continue;
    if (typeof value !== "string") {
      problems.push(`${lang}: ${key} is not a string`);
      continue;
    }
    checked++;
    const a = [...placeholders(source)].sort().join(",");
    const b = [...placeholders(value)].sort().join(",");
    if (a !== b) problems.push(`${lang}: ${key} uses {${b}} but English uses {${a}}`);
    // a plural group must be closed properly
    const open = (value.match(/\{/g) ?? []).length;
    const close = (value.match(/\}/g) ?? []).length;
    if (open !== close) problems.push(`${lang}: ${key} has unbalanced braces`);
    if (/plural/.test(value) && !/other\s*\{/.test(value)) problems.push(`${lang}: ${key} has a plural without an "other" case`);
    if (value === "" && source !== "") {
      // allowed only for the Japanese headline, where the sentence has no leading words
      if (!(lang === "ja" && key === "auth.brand.headlineA")) problems.push(`${lang}: ${key} is empty`);
    }
  }
}
for (const key of Object.keys(en)) {
  if (!/^[a-z][a-z0-9-]*(\.[^.\s][^.]*)+$/.test(key)) problems.push(`en: unusual key ${key}`);
}

console.log(`${Object.keys(en).length} English keys, ${LANGS.length - 1} other languages, ${checked} translations compared.`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 80)) console.error("  - " + p);
  process.exit(1);
}
console.log("OK: every language has every key, with matching placeholders.");
