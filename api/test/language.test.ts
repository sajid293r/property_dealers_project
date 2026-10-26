import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import { ID, startHarness, type Harness } from "./helpers.js";
import { LANGUAGES } from "../src/languages.js";
import { MODULE_KEYS } from "../src/roles.js";

let h: Harness;
const A = ID.coA;
const owner = { as: ID.alice, company: A };

beforeAll(async () => {
  h = await startHarness();
  await h.admin(async (c) => {
    for (const m of MODULE_KEYS) {
      await c.query(`insert into role_permissions(role_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope) values ($1,$2,true,true,true,true,true,'company') on conflict (role_id,module) do update set can_view=true,can_create=true,can_edit=true,can_delete=true,can_approve=true`, [ID.roleOwner, m]);
    }
  });
});
afterAll(async () => {
  await h.close();
});

describe("interface language", () => {
  it("keeps the same language list as the website", () => {
    const cfg = fs.readFileSync(new URL("../../lib/i18n/config.ts", import.meta.url), "utf8");
    const m = /LANGUAGE_CODES\s*=\s*\[([^\]]*)\]/.exec(cfg);
    expect(m, "LANGUAGE_CODES not found in lib/i18n/config.ts").toBeTruthy();
    const codes = [...(m![1] ?? "").matchAll(/"(\w+)"/g)].map((x) => x[1]);
    expect(codes).toEqual([...LANGUAGES]);
  });

  it("starts with no personal choice, saves one, and clears it again", async () => {
    expect((await h.call("GET", "/v1/me", { as: ID.bob })).body.user.language).toBeNull();
    const r = await h.call("PATCH", "/v1/me", { as: ID.bob, body: { language: "ur" } });
    expect(r.status).toBe(200);
    expect(r.body.user.language).toBe("ur");
    expect((await h.call("GET", "/v1/me", { as: ID.bob })).body.user.language).toBe("ur");
    // a name change alone leaves the language alone
    await h.call("PATCH", "/v1/me", { as: ID.bob, body: { fullName: "Bob Again" } });
    expect((await h.call("GET", "/v1/me", { as: ID.bob })).body.user.language).toBe("ur");
    const cleared = await h.call("PATCH", "/v1/me", { as: ID.bob, body: { language: null } });
    expect(cleared.body.user.language).toBeNull();
  });

  it("refuses an unknown language and an empty change", async () => {
    expect((await h.call("PATCH", "/v1/me", { as: ID.bob, body: { language: "xx" } })).status).toBe(400);
    expect((await h.call("PATCH", "/v1/me", { as: ID.bob, body: {} })).status).toBe(400);
  });

  it("changes only the caller's own language", async () => {
    await h.call("PATCH", "/v1/me", { as: ID.bob, body: { language: "de" } });
    expect((await h.call("GET", "/v1/me", { as: ID.alice })).body.user.language).toBeNull();
    await h.call("PATCH", "/v1/me", { as: ID.bob, body: { language: null } });
  });

  it("saves and reads the company default language, and shows it on /v1/me", async () => {
    expect((await h.call("GET", "/v1/company", owner)).body.defaultLanguage).toBeNull(); // not set: each person keeps their own choice
    const r = await h.call("PATCH", "/v1/company", { ...owner, body: { defaultLanguage: "ar", penaltyGraceDays: 3 } });
    expect(r.status).toBe(200);
    expect(r.body.defaultLanguage).toBe("ar");
    const co = (await h.call("GET", "/v1/company", owner)).body;
    expect(co.defaultLanguage).toBe("ar");
    expect(co.penaltyGraceDays).toBe(3); // other settings survive the merge
    const me = (await h.call("GET", "/v1/me", owner)).body;
    expect(me.companies.find((c: { companyId: string }) => c.companyId === A).defaultLanguage).toBe("ar");
    expect((await h.call("PATCH", "/v1/company", { ...owner, body: { defaultLanguage: "klingon" } })).status).toBe(400);
  });
});
