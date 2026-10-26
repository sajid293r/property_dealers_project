import type { LanguageCode } from "@/lib/i18n/config";

export type Vars = Record<string, string | number>;

/** Index of the "}" that closes the "{" at `open`, or -1. */
function closing(msg: string, open: number): number {
  let depth = 0;
  for (let i = open; i < msg.length; i++) {
    if (msg[i] === "{") depth++;
    else if (msg[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** "one {# item} other {# items}" -> { one: "# item", other: "# items" } */
function parseCases(src: string): Record<string, string> {
  const cases: Record<string, string> = {};
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{", i);
    if (open < 0) break;
    const name = src.slice(i, open).trim();
    const end = closing(src, open);
    if (end < 0) break;
    cases[name] = src.slice(open + 1, end);
    i = end + 1;
  }
  return cases;
}

/**
 * Fill {name} placeholders and {count, plural, one {# item} other {# items}} choices.
 * Never throws: an unknown placeholder is left as it is.
 */
export function interpolate(msg: string, vars: Vars | undefined, lang: LanguageCode): string {
  if (!msg.includes("{")) return msg;
  let out = "";
  let i = 0;
  while (i < msg.length) {
    if (msg[i] !== "{") {
      out += msg[i++];
      continue;
    }
    const end = closing(msg, i);
    if (end < 0) {
      out += msg[i++];
      continue;
    }
    const inner = msg.slice(i + 1, end);
    const plural = /^(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inner);
    if (plural) {
      const n = Number(vars?.[plural[1]!] ?? 0);
      const cases = parseCases(plural[2]!);
      let category = `=${n}`;
      if (cases[category] === undefined) {
        try {
          category = new Intl.PluralRules(lang).select(n);
        } catch {
          category = "other";
        }
      }
      out += interpolate((cases[category] ?? cases.other ?? "").replace(/#/g, String(n)), vars, lang);
    } else if (/^\w+$/.test(inner)) {
      out += vars && inner in vars ? String(vars[inner]) : `{${inner}}`;
    } else {
      out += msg.slice(i, end + 1);
    }
    i = end + 1;
  }
  return out;
}
