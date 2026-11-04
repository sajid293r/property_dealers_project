import { startHarness } from "../test/helpers.js";
import { featureFor } from "../src/plans.js";
const h = await startHarness();
const t = (h.app as any).routeTable as { method: string; url: string }[];
const seg = new Map<string, number>(); const gated = new Map<string, string[]>();
for (const r of t) { if (r.method === "OPTIONS" || !r.url.startsWith("/v1")) { console.log("skip", r.method, r.url); continue; } const f = featureFor(r.url); const s = r.url.split("/")[2]!; if (f) { gated.set(f.key, [...(gated.get(f.key) ?? []), r.method + " " + r.url]); } else seg.set(s, (seg.get(s) ?? 0) + 1); }
console.log("UNGATED", [...seg.entries()].map(([k, v]) => `${k}(${v})`).join(" "));
for (const [k, v] of gated) console.log("GATED", k, v.length);
console.log("total", t.length);
await h.close(); process.exit(0);
