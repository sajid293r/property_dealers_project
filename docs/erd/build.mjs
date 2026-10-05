// Generates every ERD artifact from docs/erd/schema.mjs
//   node docs/erd/build.mjs
// Outputs (in docs/erd/):  ERD.md  erd.dbml  viewer.html  — and prints validation errors, if any.

import fs from "node:fs";
import { MODULES, TABLES, SUBGROUPS } from "./schema.mjs";

const OUT = new URL("./", import.meta.url);

// ───────────────────────────────────────────────────────────── parse + validate
const SKIP_EDGE = new Set(["company_id", "created_by", "updated_by", "approved_by", "posted_by", "changed_by", "uploaded_by", "added_by", "invited_by", "requested_by", "reported_by", "rated_by", "received_by", "verified_by", "done_by", "reconciled_by", "held_by", "author_id"]);
const NEVER_DRAW_TARGET = new Set(["users", "companies", "documents", "organizations"]);

const byName = new Map();
for (const tb of TABLES) {
  const cols = [];
  if (!tb.opts.noid) cols.push({ name: "id", type: "uuid", pk: true });
  if (!tb.opts.global) cols.push({ name: "company_id", type: "uuid", fk: "companies", implicit: true });
  for (const raw of tb.cols.trim().split("\n")) {
    const [line, note = ""] = raw.split("#");
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const col = { name: parts[0], type: parts[1], note: note.trim() };
    for (const f of parts.slice(2)) {
      if (f === "pk") col.pk = true;
      else if (f === "uq") col.uq = true;
      else if (f === "null") col.nullable = true;
      else if (f.startsWith("fk=")) col.fk = f.slice(3);
      else throw new Error(`Unknown flag "${f}" in ${tb.name}.${parts[0]}`);
    }
    cols.push(col);
  }
  if (byName.has(tb.name)) throw new Error(`Duplicate table ${tb.name}`);
  byName.set(tb.name, { ...tb, columns: cols });
}

const errors = [];
const edges = []; // { child, parent, col, nullable, unique, draw }
for (const tb of byName.values()) {
  const modKeys = new Set(MODULES.map((m) => m.key));
  if (!modKeys.has(tb.module)) errors.push(`${tb.name}: unknown module ${tb.module}`);
  for (const c of tb.columns) {
    if (!c.fk) continue;
    if (!byName.has(c.fk)) {
      errors.push(`${tb.name}.${c.name} -> unknown table "${c.fk}"`);
      continue;
    }
    const draw = !SKIP_EDGE.has(c.name) && !c.implicit;
    edges.push({ child: tb.name, parent: c.fk, col: c.name, nullable: !!c.nullable, unique: !!c.uq || (!!c.pk && tb.columns.filter((x) => x.pk).length === 1), draw });
  }
}
if (errors.length) {
  console.error("SCHEMA ERRORS:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}

const tablesOf = (mod) => [...byName.values()].filter((t) => t.module === mod);

// Sub-diagram groups: every table of a module must appear in exactly one group.
function groupsOf(modKey) {
  const own = tablesOf(modKey);
  const defined = SUBGROUPS[modKey];
  if (!defined) return [{ title: "All tables", tables: own }];
  const seen = new Set();
  const groups = defined.map(([title, names]) => ({
    title,
    tables: names.map((n) => {
      const tb = byName.get(n);
      if (!tb || tb.module !== modKey) throw new Error(`SUBGROUPS ${modKey}/${title}: unknown or foreign table "${n}"`);
      if (seen.has(n)) throw new Error(`Table "${n}" appears in two sub-diagrams`);
      seen.add(n);
      return tb;
    }),
  }));
  const missing = own.filter((t) => !seen.has(t.name)).map((t) => t.name);
  if (missing.length) throw new Error(`${modKey}: tables missing from SUBGROUPS: ${missing.join(", ")}`);
  return groups;
}
const visibleEdges = edges.filter((e) => e.draw);

// ───────────────────────────────────────────────────────────── mermaid
const mType = { uuid: "uuid", text: "text", int: "int", bigint: "bigint", num: "numeric", bool: "bool", date: "date", ts: "timestamptz", jsonb: "jsonb", geom: "geometry" };
const safe = (s) => (s || "").replace(/["\n]/g, "'");

function mermaidFor(own) {
  const ownNames = new Set(own.map((t) => t.name));
  const lines = ["erDiagram"];
  const stubs = new Set();
  const rels = [];
  for (const e of visibleEdges) {
    if (ownNames.has(e.child)) {
      if (!ownNames.has(e.parent)) stubs.add(e.parent);
      rels.push(e);
    }
  }
  for (const tb of own) {
    lines.push(`  ${tb.name} {`);
    for (const c of tb.columns) {
      const keys = [c.pk ? "PK" : null, c.fk ? "FK" : null, c.uq ? "UK" : null].filter(Boolean).join(", ");
      const comment = safe(c.note) || (c.nullable ? "nullable" : "");
      lines.push(`    ${mType[c.type]} ${c.name}${keys ? " " + keys : ""}${comment ? ` "${comment}"` : ""}`);
    }
    lines.push("  }");
  }
  for (const s of [...stubs].filter((s) => !ownNames.has(s))) {
    const st = byName.get(s);
    const mod = MODULES.find((m) => m.key === st.module).title;
    lines.push(`  ${s} {`, `    uuid id PK "from ${safe(mod)}"`, "  }");
  }
  const seen = new Set();
  for (const e of rels) {
    const k = `${e.child}.${e.col}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const left = e.nullable ? "|o" : "||";
    const right = e.unique ? "o|" : "o{";
    lines.push(`  ${e.parent} ${left}--${right} ${e.child} : "${e.col}"`);
  }
  return lines.join("\n");
}

// module-level map: aggregate FK counts between modules
function overviewMermaid() {
  const lines = ["flowchart LR"];
  for (const m of MODULES) {
    lines.push(`  ${m.key}["<b>${m.title}</b><br/>${tablesOf(m.key).length} tables"]`);
  }
  const agg = new Map();
  for (const e of edges) {
    if (!e.draw || NEVER_DRAW_TARGET.has(e.parent)) continue;
    const a = byName.get(e.child).module, b = byName.get(e.parent).module;
    if (a === b) continue;
    const key = `${a}>${b}`;
    agg.set(key, (agg.get(key) || 0) + 1);
  }
  for (const [k, n] of agg) {
    const [a, b] = k.split(">");
    lines.push(`  ${a} -->|${n}| ${b}`);
  }
  for (const m of MODULES) lines.push(`  style ${m.key} fill:${m.color},stroke:${m.color},color:#fff`);
  return lines.join("\n");
}

// ───────────────────────────────────────────────────────────── stats
const stats = {
  tables: byName.size,
  modules: MODULES.length,
  columns: [...byName.values()].reduce((n, t) => n + t.columns.length, 0),
  relationships: edges.filter((e) => !(e.col === "company_id")).length,
  drawn: visibleEdges.length,
};

// ───────────────────────────────────────────────────────────── ERD.md
let md = `# PropIQ — Entity Relationship Diagrams

> Generated from [\`schema.mjs\`](schema.mjs) by \`node docs/erd/build.mjs\` — **do not edit by hand**.
> **${stats.tables} tables · ${stats.columns} key attributes · ${stats.relationships} relationships · ${stats.modules} feature areas.**
> Open this file in VS Code (Markdown preview with a Mermaid extension) or on GitHub to see the diagrams.
> For the interactive viewer open [\`viewer.html\`](viewer.html). To edit visually, import [\`erd.dbml\`](erd.dbml) into https://dbdiagram.io.

**How to read.** Each box is a table. \`PK\` primary key · \`FK\` foreign key · \`UK\` unique. The line between two tables is a relationship: the single bar \`||\` end is the *parent* (one), the crow's-foot \`o{\` end is the *child* (many); a circle \`o\` means optional (nullable). Boxes that show only an \`id\` are tables from **another** feature area, shown so you can see the connection. Every table also has \`company_id\` (multi-company isolation) — those lines are not drawn, to keep the pictures readable.

## Map of the whole system

\`\`\`mermaid
${overviewMermaid()}
\`\`\`

`;
for (const m of MODULES) {
  md += `## ${m.title} (${tablesOf(m.key).length} tables)\n\n${m.blurb}\n\n`;
  for (const g of groupsOf(m.key)) md += `### ${g.title} (${g.tables.length})\n\n\`\`\`mermaid\n${mermaidFor(g.tables)}\n\`\`\`\n\n`;
}
fs.writeFileSync(new URL("ERD.md", OUT), md);

// ───────────────────────────────────────────────────────────── DBML (dbdiagram.io)
const dbType = { uuid: "uuid", text: "text", int: "int", bigint: "bigint", num: "numeric(18,2)", bool: "boolean", date: "date", ts: "timestamptz", jsonb: "jsonb", geom: "geometry" };
let dbml = `// PropIQ — generated by docs/erd/build.mjs. Import at https://dbdiagram.io (Import → DBML).\n\n`;
for (const tb of byName.values()) {
  dbml += `Table ${tb.name} {\n`;
  for (const c of tb.columns) {
    const attrs = [];
    if (c.pk && !tb.columns.some((x) => x !== c && x.pk && tb.opts.noid)) attrs.push("pk");
    if (c.uq) attrs.push("unique");
    if (!c.nullable && !c.pk) attrs.push("not null");
    if (c.note) attrs.push(`note: '${c.note.replace(/'/g, "")}'`);
    dbml += `  ${c.name} ${dbType[c.type]}${attrs.length ? ` [${attrs.join(", ")}]` : ""}\n`;
  }
  const pks = tb.columns.filter((c) => c.pk);
  if (tb.opts.noid && pks.length > 1) dbml += `\n  indexes {\n    (${pks.map((c) => c.name).join(", ")}) [pk]\n  }\n`;
  dbml += `  Note: '${tb.desc.replace(/'/g, "")}'\n}\n\n`;
}
for (const e of edges) dbml += `Ref: ${e.child}.${e.col} > ${e.parent}.id\n`;
dbml += "\n";
for (const m of MODULES) dbml += `TableGroup "${m.title}" {\n${tablesOf(m.key).map((t) => "  " + t.name).join("\n")}\n}\n\n`;
fs.writeFileSync(new URL("erd.dbml", OUT), dbml);

// ───────────────────────────────────────────────────────────── viewer.html
const data = {
  stats,
  modules: MODULES.map((m) => ({
    ...m,
    count: tablesOf(m.key).length,
    groups: groupsOf(m.key).map((g) => ({ title: g.title, count: g.tables.length, mermaid: mermaidFor(g.tables), names: g.tables.map((t) => t.name) })),
    tables: tablesOf(m.key).map((t) => ({
      name: t.name,
      desc: t.desc,
      columns: t.columns.map((c) => ({ n: c.name, t: c.type, pk: !!c.pk, fk: c.fk || null, uq: !!c.uq, nl: !!c.nullable, note: c.note })),
      refs: edges.filter((e) => e.child === t.name && e.col !== "company_id").map((e) => e.parent),
      usedBy: edges.filter((e) => e.parent === t.name && e.col !== "company_id").map((e) => e.child),
    })),
  })),
  overview: overviewMermaid(),
};
const template = fs.readFileSync(new URL("viewer.template.html", OUT), "utf8");
fs.writeFileSync(new URL("viewer.html", OUT), template.replace("/*__DATA__*/null", JSON.stringify(data)));

console.log(`OK  ${stats.tables} tables, ${stats.columns} attributes, ${stats.relationships} relationships, ${stats.drawn} drawn lines, ${stats.modules} modules`);
for (const m of MODULES) console.log(`    ${m.title.padEnd(28)} ${tablesOf(m.key).length}`);
