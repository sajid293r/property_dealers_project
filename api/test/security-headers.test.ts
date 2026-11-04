import { describe, expect, it } from "vitest";
import fs from "node:fs";

// BUG-016: the live site could be framed by any other page. netlify.toml headers do not reach on-demand pages or function
// answers, so the pages get them from next.config.ts and the API sets its own; this test keeps them from being dropped.
const block = fs.readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
const value = (name: string) => new RegExp(`key:\\s*"${name}",\\s*value:\\s*"([^"]*)"`).exec(block)?.[1];

describe("BUG-016: browser hardening headers", () => {
  it("applies to every path", () => {
    expect(block).toMatch(/source:\s*"\/:path\*"/);
  });

  it("forbids framing (clickjacking) in both the old and the new way", () => {
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("sets the other standard protections", () => {
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    const perms = value("Permissions-Policy") ?? "";
    for (const p of ["camera=()", "microphone=()", "geolocation=()"]) expect(perms).toContain(p);
    const csp = value("Content-Security-Policy") ?? "";
    for (const d of ["base-uri 'self'", "form-action 'self'", "object-src 'none'"]) expect(csp).toContain(d);
  });

  it("does not break the site: no script or style restriction that would block Next.js, Supabase or the fonts", () => {
    const csp = value("Content-Security-Policy") ?? "";
    expect(csp).not.toMatch(/script-src|style-src|default-src|connect-src|font-src|img-src/);
  });

  it("the API sets the same protections on its own answers", () => {
    const app = fs.readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
    for (const h of ["x-frame-options", "x-content-type-options", "referrer-policy", "content-security-policy"]) expect(app).toContain(`"${h}"`);
  });
});
