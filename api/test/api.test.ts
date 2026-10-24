import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ID, startHarness, type Harness } from "./helpers.js";

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});

const A = ID.coA;
const B = ID.coB;

describe("sign-in", () => {
  it("health checks need no sign-in", async () => {
    expect((await h.call("GET", "/health")).body).toEqual({ ok: true });
    expect((await h.call("GET", "/health/db")).body).toEqual({ ok: true });
  });

  it("refuses a request with no sign-in, a garbage token, an expired token, a foreign signature or the wrong audience", async () => {
    expect((await h.call("GET", "/v1/me")).status).toBe(401);
    expect((await h.call("GET", "/v1/me", { headers: { authorization: "Bearer not-a-token" } })).status).toBe(401);
    for (const opts of [{ expiresIn: "-1h" }, { secret: "another-secret-another-secret-12345" }, { audience: "anon" }]) {
      const t = await h.token(ID.alice, "alice@a.pk", opts);
      const r = await h.call("GET", "/v1/me", { headers: { authorization: `Bearer ${t}` } });
      expect(r.status, JSON.stringify(opts)).toBe(401);
      expect(r.body.error.code).toBe("invalid_sign_in");
    }
  });

  it("/v1/me lists only the companies the person belongs to", async () => {
    const alice = await h.call("GET", "/v1/me", { as: ID.alice });
    expect(alice.status).toBe(200);
    expect(alice.body.companies.map((c: { companyId: string }) => c.companyId)).toEqual([A]);
    expect(alice.body.companies[0].role).toBe("Owner");
    const carol = await h.call("GET", "/v1/me", { as: ID.carol });
    expect(carol.body.companies.map((c: { companyId: string }) => c.companyId)).toEqual([B]);
  });

  it("creates the profile row the first time someone new signs in, using Supabase's user id", async () => {
    const eve = await h.call("GET", "/v1/me", { as: ID.eve });
    expect(eve.status).toBe(200);
    expect(eve.body.companies).toEqual([]);
    const row = await h.admin((c) => c.query(`select id, email from users where id = $1`, [ID.eve]));
    expect(row.rows[0]).toEqual({ id: ID.eve, email: "eve@nowhere.pk" });
  });
});

describe("company access", () => {
  it("needs a company to be named", async () => {
    const r = await h.call("GET", "/v1/properties", { as: ID.alice });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("company_required");
  });

  it("gives a non-member the same answer whether the company exists or not (ids cannot be probed)", async () => {
    const real = await h.call("GET", "/v1/properties", { as: ID.alice, company: B });
    const fake = await h.call("GET", "/v1/properties", { as: ID.alice, company: "99999999-9999-9999-9999-999999999999" });
    expect(real.status).toBe(403);
    expect(fake.status).toBe(403);
    expect(real.body.error.message).toBe(fake.body.error.message);
  });

  it("keeps two companies completely apart, side by side", async () => {
    const a = await h.call("GET", "/v1/properties", { as: ID.alice, company: A });
    const b = await h.call("GET", "/v1/properties", { as: ID.carol, company: B });
    expect(a.body.map((p: { code: string }) => p.code)).toEqual(["PRP-A1", "PRP-A2", "PRP-A3", "PRP-A4", "PRP-A5"]);
    expect(b.body.map((p: { code: string }) => p.code)).toEqual(["PRP-B1"]);
    // asking for the other company's record by its exact id finds nothing
    expect((await h.call("GET", `/v1/properties/${ID.propB1}`, { as: ID.alice, company: A })).status).toBe(404);
    expect((await h.call("GET", `/v1/properties/${ID.propA(1)}`, { as: ID.carol, company: B })).status).toBe(404);
  });

  it("cannot book another company's property even by naming its exact id", async () => {
    const r = await h.call("POST", "/v1/bookings", { as: ID.alice, company: A, body: { propertyId: ID.propB1, customerId: ID.custA, paymentType: "cash" } });
    expect(r.status).toBe(404);
    const r2 = await h.call("POST", "/v1/bookings", { as: ID.alice, company: A, body: { propertyId: ID.propA(5), customerId: ID.custB, paymentType: "cash" } });
    expect([404, 422]).toContain(r2.status); // company B's customer is invisible or refused: never accepted
    const rows = await h.admin((c) => c.query(`select count(*)::int n from bookings where property_id in ('${ID.propB1}','${ID.propA(5)}')`));
    expect(rows.rows[0].n).toBe(0);
  });

  it("does not leave the company or user set on the connection after a request", async () => {
    await h.call("GET", "/v1/properties", { as: ID.alice, company: A });
    const r = await h.db.pool.query(`select current_setting('app.company_id', true) as c, current_setting('app.user_id', true) as u, current_setting('app.permissions', true) as p`);
    expect([null, ""]).toContain(r.rows[0].c);
    expect([null, ""]).toContain(r.rows[0].u);
    expect([null, ""]).toContain(r.rows[0].p);
  });
});

describe("permissions", () => {
  it("lets a viewer look but not change", async () => {
    expect((await h.call("GET", "/v1/properties", { as: ID.bob, company: A })).status).toBe(200);
    const r = await h.call("POST", "/v1/bookings", { as: ID.bob, company: A, body: { propertyId: ID.propA(1), customerId: ID.custA, paymentType: "cash" } });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("not_permitted");
    expect((await h.call("POST", `/v1/properties/${ID.propA(1)}/holds`, { as: ID.bob, company: A, body: {} })).status).toBe(403);
  });

  it("rejects malformed input with the field named", async () => {
    const r = await h.call("POST", "/v1/bookings", { as: ID.alice, company: A, body: { propertyId: "nope", customerId: ID.custA, paymentType: "cash", discount: "12.345" } });
    expect(r.status).toBe(400);
    const fields = r.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("propertyId");
    expect(fields).toContain("discount");
  });
});

describe("the sales flow, enforced by the database", () => {
  let bookingId: string;
  const P = () => ID.propA(1);

  it("holds a property; a second hold and a stranger's booking are refused with plain messages", async () => {
    const hold = await h.call("POST", `/v1/properties/${P()}/holds`, { as: ID.alice, company: A, body: { partyId: ID.custA, minutes: 60 } });
    expect(hold.status).toBe(201);
    const view = await h.call("GET", `/v1/properties/${P()}`, { as: ID.alice, company: A });
    expect(view.body.status).toBe("reserved");
    expect(view.body.activeHold.heldForPartyId).toBe(ID.custA);
    expect(view.body.statusHistory[0]).toMatchObject({ from: "available", to: "reserved" });
    const second = await h.call("POST", `/v1/properties/${P()}/holds`, { as: ID.alice, company: A, body: {} });
    expect(second.status).toBe(422);
    expect(second.body.error.message).toMatch(/not available/);
  });

  it("books it for the person it is held for, and retrying with the same key does not double-book", async () => {
    const headers = { "idempotency-key": "web-form-123" };
    const first = await h.call("POST", "/v1/bookings", { as: ID.alice, company: A, headers, body: { propertyId: P(), customerId: ID.custA, paymentType: "installment", discount: "0" } });
    expect(first.status).toBe(201);
    expect(first.body.bookingNo).toMatch(/^BOOKING-\d{5}$/);
    expect(first.body.netPrice).toBe("1000000.00");
    bookingId = first.body.id;
    const retry = await h.call("POST", "/v1/bookings", { as: ID.alice, company: A, headers, body: { propertyId: P(), customerId: ID.custA, paymentType: "installment", discount: "0" } });
    expect(retry.body.id).toBe(bookingId);
    const n = await h.admin((c) => c.query(`select count(*)::int n from bookings where property_id = $1`, [P()]));
    expect(n.rows[0].n).toBe(1);
  });

  it("refuses a second live booking with a clear message", async () => {
    const r = await h.call("POST", "/v1/bookings", { as: ID.alice, company: A, body: { propertyId: P(), customerId: ID.custA, paymentType: "cash" } });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toBe("This property already has a live booking.");
  });

  it("will not confirm an installment booking until its schedule exists and adds up", async () => {
    const early = await h.call("POST", `/v1/bookings/${bookingId}/status`, { as: ID.alice, company: A, body: { to: "confirmed" } });
    expect(early.status).toBe(422);
    expect(early.body.error.message).toMatch(/needs its payment schedule/);

    const sched = await h.call("POST", `/v1/bookings/${bookingId}/schedule`, {
      as: ID.alice, company: A, body: { downPayment: 100000, installments: 7, firstDue: "2026-11-05" },
    });
    expect(sched.status).toBe(200);
    const cents = sched.body.installments.reduce((t: number, i: { amount: string }) => t + Math.round(Number(i.amount) * 100), 0);
    expect(sched.body.installments).toHaveLength(8);
    expect(cents).toBe(100_000_000);

    const ok = await h.call("POST", `/v1/bookings/${bookingId}/status`, { as: ID.alice, company: A, body: { to: "confirmed" } });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("confirmed");
  });

  it("will not complete it while installments are still due", async () => {
    const r = await h.call("POST", `/v1/bookings/${bookingId}/status`, { as: ID.alice, company: A, body: { to: "completed" } });
    expect(r.status).toBe(422);
    expect(r.body.error.message).toMatch(/still unpaid/);
  });

  it("shows what a person can do next, based on THEIR permissions", async () => {
    const dave = await h.call("GET", "/v1/transitions/booking/confirmed", { as: ID.dave, company: A });
    const cancel = dave.body.find((t: { to: string }) => t.to === "cancelled");
    const complete = dave.body.find((t: { to: string }) => t.to === "completed");
    expect(cancel.allowedForYou).toBe(false);
    expect(complete.allowedForYou).toBe(true);
  });

  it("lets the database, not the API, refuse a cancellation by someone without the approve permission", async () => {
    // Dave sells (deals.create / deals.edit) but may not cancel (deals.approve). The role is checked in Postgres.
    const mine = await h.call("POST", "/v1/bookings", { as: ID.dave, company: A, body: { propertyId: ID.propA(2), customerId: ID.custA, paymentType: "cash" } });
    expect(mine.status).toBe(201);
    const r = await h.call("POST", `/v1/bookings/${mine.body.id}/status`, { as: ID.dave, company: A, body: { to: "cancelled", reason: "customer changed mind" } });
    expect(r.status).toBe(403);
    expect(r.body.error.message).toMatch(/deals\.approve/);
    const still = await h.admin((c) => c.query(`select status from bookings where id = $1`, [mine.body.id]));
    expect(still.rows[0].status).toBe("pending");
  });

  it("needs a reason to cancel; cancelling frees the property", async () => {
    const noReason = await h.call("POST", `/v1/bookings/${bookingId}/status`, { as: ID.alice, company: A, body: { to: "cancelled" } });
    expect(noReason.status).toBe(400);
    const done = await h.call("POST", `/v1/bookings/${bookingId}/status`, { as: ID.alice, company: A, body: { to: "cancelled", reason: "buyer withdrew" } });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("cancelled");
    const prop = await h.call("GET", `/v1/properties/${P()}`, { as: ID.alice, company: A });
    expect(prop.body.status).toBe("available");
  });

  it("applies each person's data scope: an agent sees only their own bookings, the owner sees all", async () => {
    const daveList = await h.call("GET", "/v1/bookings", { as: ID.dave, company: A });
    const aliceList = await h.call("GET", "/v1/bookings", { as: ID.alice, company: A });
    expect(daveList.body.every((b: { createdBy: string }) => b.createdBy === ID.dave)).toBe(true);
    expect(aliceList.body.length).toBeGreaterThan(daveList.body.length);
    const alices = aliceList.body.find((b: { id: string }) => b.id === bookingId);
    expect((await h.call("GET", `/v1/bookings/${alices.id}`, { as: ID.dave, company: A })).status).toBe(404);
    expect((await h.call("GET", `/v1/bookings/${alices.id}`, { as: ID.alice, company: A })).status).toBe(200);
  });

  it("records who did what in the audit trail, with the request that did it", async () => {
    const rows = await h.admin((c) =>
      c.query(`select user_id, action, request_id from audit_log where entity_type = 'bookings' and entity_id = $1 order by id`, [bookingId]),
    );
    expect(rows.rows.length).toBeGreaterThanOrEqual(3); // created, confirmed, cancelled
    expect(rows.rows.every((r) => r.user_id === ID.alice)).toBe(true);
    expect(rows.rows.every((r) => typeof r.request_id === "string" && r.request_id.length > 10)).toBe(true);
    expect(rows.rows.map((r) => r.action)).toContain("status_change");
  });
});

describe("projects and properties", () => {
  let projectId: string;

  it("lists the property types a company sells", async () => {
    const r = await h.call("GET", "/v1/property-types", { as: ID.alice, company: A });
    expect(r.status).toBe(200);
    expect(r.body.map((t: { code: string }) => t.code)).toContain("plot");
  });

  it("creates a project with a database-numbered code, and shows property counts", async () => {
    const r = await h.call("POST", "/v1/projects", { as: ID.alice, company: A, body: { name: "Green Meadows", type: "residential", city: "Lahore" } });
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(/^PRJ-\d{5}$/);
    expect(r.body).toMatchObject({ name: "Green Meadows", status: "planning", propertyCount: 0 });
    projectId = r.body.id;
    const full = await h.call("POST", "/v1/projects", {
      as: ID.alice, company: A,
      body: { name: "Lake View", type: "mixed_use", landAreaMarla: 1200, approvedBudget: "250000000", plannedStart: "2026-11-01", plannedEnd: "2028-06-30" },
    });
    expect(full.status).toBe(201);
    expect(full.body).toMatchObject({ landAreaMarla: "1200.00", approvedBudget: "250000000.00", plannedStart: "2026-11-01", plannedEnd: "2028-06-30" });
    const backwards = await h.call("POST", "/v1/projects", { as: ID.alice, company: A, body: { name: "Backwards", plannedStart: "2027-01-01", plannedEnd: "2026-01-01" } });
    expect(backwards.status).toBe(400);
    expect(backwards.body.error.code).toBe("invalid_dates");
  });

  it("adds a property with a block and a size; the size is also stored in square feet", async () => {
    const r = await h.call("POST", "/v1/properties", {
      as: ID.alice, company: A,
      body: { title: "Plot 12, Block C", typeId: ID.typeA, projectId, block: "Block C", listPrice: "4500000", size: { value: 5, unit: "marla" }, installmentsAvailable: true },
    });
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(/^PRP-\d{5}$/);
    expect(r.body).toMatchObject({ project: "Green Meadows", block: "Block C", type: "Plot", status: "available", listPrice: "4500000.00", sizeValue: "5.00", sizeUnit: "marla", sizeSqft: "1361.25", installmentsAvailable: true });
  });

  it("reuses a block that already exists and keeps the property counts on the project right", async () => {
    await h.call("POST", "/v1/properties", { as: ID.alice, company: A, body: { title: "Plot 13, Block C", typeId: ID.typeA, projectId, block: "Block C", listPrice: 4600000, size: { value: 1, unit: "kanal" } } });
    const blocks = await h.admin((c) => c.query(`select count(*)::int n from project_blocks where project_id = $1`, [projectId]));
    expect(blocks.rows[0].n).toBe(1);
    const list = await h.call("GET", `/v1/properties?projectId=${projectId}`, { as: ID.alice, company: A });
    expect(list.body).toHaveLength(2);
    expect(list.body.find((p: { sizeUnit: string }) => p.sizeUnit === "kanal").sizeSqft).toBe("5445.00");
    const projects = await h.call("GET", "/v1/projects", { as: ID.alice, company: A });
    expect(projects.body.find((p: { id: string }) => p.id === projectId)).toMatchObject({ propertyCount: 2, availableCount: 2 });
  });

  it("refuses bad input in plain terms", async () => {
    const noProject = await h.call("POST", "/v1/properties", { as: ID.alice, company: A, body: { title: "Plot X", typeId: ID.typeA, block: "Block Z", listPrice: 1000000 } });
    expect(noProject.status).toBe(400);
    expect(noProject.body.error.code).toBe("project_required");
    const badSize = await h.call("POST", "/v1/properties", { as: ID.alice, company: A, body: { title: "Plot X", typeId: ID.typeA, listPrice: 1000000, size: { value: 0, unit: "marla" } } });
    expect(badSize.status).toBe(400);
    const badUnit = await h.call("POST", "/v1/properties", { as: ID.alice, company: A, body: { title: "Plot X", typeId: ID.typeA, listPrice: 1000000, size: { value: 5, unit: "furlong" } } });
    expect(badUnit.status).toBe(400);
  });

  it("will not let a viewer create, nor another company's project or type be used", async () => {
    const viewer = await h.call("POST", "/v1/projects", { as: ID.bob, company: A, body: { name: "Nope" } });
    expect(viewer.status).toBe(403);
    const foreignProject = await h.call("POST", "/v1/properties", { as: ID.carol, company: B, body: { title: "Sneaky", typeId: ID.typeB, projectId, listPrice: 1000 } });
    expect(foreignProject.status).toBe(422);
    const foreignType = await h.call("POST", "/v1/properties", { as: ID.carol, company: B, body: { title: "Sneaky", typeId: ID.typeA, listPrice: 1000 } });
    expect(foreignType.status).toBe(422);
    const seen = await h.call("GET", "/v1/projects", { as: ID.carol, company: B });
    expect(seen.body.find((p: { id: string }) => p.id === projectId)).toBeUndefined();
  });

  it("records the creation in the audit trail", async () => {
    const rows = await h.admin((c) => c.query(`select action, user_id from audit_log where entity_type = 'properties' and action = 'create' and after_data->>'title' = 'Plot 12, Block C'`));
    expect(rows.rows).toEqual([{ action: "create", user_id: ID.alice }]);
  });
});

describe("the API's own database login", () => {
  it("is the restricted role: it cannot bypass row-level security or change the rule tables", async () => {
    const who = await h.db.pool.query(`select current_user as u, (select rolbypassrls or rolsuper from pg_roles where rolname = current_user) as bypass`);
    expect(who.rows[0]).toEqual({ u: "propiq_app", bypass: false });
    const rules = await h.db.pool.query(
      `select has_table_privilege('propiq_app','state_transitions','SELECT') as can_read,
              has_table_privilege('propiq_app','state_transitions','UPDATE') as can_edit,
              has_table_privilege('propiq_app','state_transitions','DELETE') as can_delete`,
    );
    expect(rules.rows[0]).toEqual({ can_read: true, can_edit: false, can_delete: false });
  });

  it("is confined by the database itself: even an unfiltered query sees only the named company", async () => {
    const count = (company: string | null) =>
      h.db.inTenant(
        { userId: ID.alice, companyId: company ?? "", permissions: [], requestId: "t", plan: "premium" },
        async (q) => Number((await q.query(`select count(*)::int n from properties`)).rows[0]?.n),
      );
    const truth = await h.admin((c) => c.query(`select company_id, count(*)::int n from properties group by company_id`));
    const total = (co: string) => truth.rows.find((r) => r.company_id === co)?.n as number;
    expect(total(A)).toBeGreaterThan(0);
    expect(total(B)).toBeGreaterThan(0);
    expect(await count(A)).toBe(total(A));
    expect(await count(B)).toBe(total(B));
    expect(await count(A)).not.toBe(total(A) + total(B)); // never both
    expect(await count(null)).toBe(0); // no company chosen: nothing, not everything
  });
});

describe("browser access (CORS)", () => {
  it("answers the browser's pre-flight check for an allowed origin only", async () => {
    const { buildApp } = await import("../src/app.js");
    const { createVerifier } = await import("../src/auth.js");
    const { JWT_SECRET } = await import("./helpers.js");
    const app = buildApp({
      config: { LOG_LEVEL: "silent", CORS_ORIGIN: "http://localhost:3000, https://app.example.pk" },
      db: h.db,
      verifier: createVerifier({ SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_JWT_AUDIENCE: "authenticated", SUPABASE_JWKS_URL: undefined, SUPABASE_JWT_ISSUER: undefined }),
    });
    const ask = (origin: string) =>
      app.inject({ method: "OPTIONS", url: "/v1/properties", headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization,x-company-id" } });
    const ok = await ask("https://app.example.pk");
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe("https://app.example.pk");
    expect(String(ok.headers["access-control-allow-headers"])).toMatch(/x-company-id/);
    const stranger = await ask("https://evil.example.com");
    expect(stranger.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });
});

describe("migrations", () => {
  it("are recorded, and re-running changes nothing", async () => {
    const { migrate } = await import("../src/migrate.js");
    const again = await h.admin((c) => migrate(c, () => {}));
    expect(again.applied).toEqual([]);
    expect(again.unchanged).toContain("0001_core");
  });

  it("stop if an already-applied migration has been edited", async () => {
    const { migrate } = await import("../src/migrate.js");
    await h.admin((c) => c.query(`update schema_migrations set sha256 = 'tampered' where name = '0001_core'`));
    await expect(h.admin((c) => migrate(c, () => {}))).rejects.toThrow(/already applied but its file has changed/);
    const fixed = await import("../src/migrate.js").then((m) => m.loadMigrations()[0]!.sha);
    await h.admin((c) => c.query(`update schema_migrations set sha256 = $1 where name = '0001_core'`, [fixed]));
  });
});
