# PropIQ API

A thin, tenant-safe HTTP layer over the rules that live in Postgres (`docs/schema/core.sql`). The API does **not**
re-implement business rules: the database decides whether a status change is legal, whether this person's role allows
it, and whether a payment schedule adds up. The API signs the person in, tells the database who is asking, and
translates answers into plain-language errors.

```
Browser (Next.js)  ──►  API (Fastify)  ──►  Supabase Postgres
   Supabase Auth login      verifies the token,       row-level security + rules
                            sets company/user/        + audit trail, all keyed on the
                            permissions per request   session settings the API sets
```

## Run the tests (no database needed)

```bash
cd api && npm install
npm test            # 42 tests: real API over a real Postgres connection (in-memory), two companies side by side
npm run typecheck
```

## Run everything offline (the sandbox)

`npm run sandbox` starts an in-memory Postgres, the real API and a tiny stand-in for Supabase's sign-in service, seeded with the ByteCraft organization and an owner (`owner@bytecraft.local` / `sandbox-pass`). It prints the one command that starts the website against it. Everything resets when you stop it. The browser end-to-end test in `../e2e` runs against it.

## Set up Supabase (once)

1. Create a Supabase project. In **Project Settings → Data API**, turn the Data API **off** (PropIQ is reached only through this API).
2. Copy `.env.example` to `.env`. Fill `MIGRATION_DATABASE_URL` with the owner connection string (direct, port 5432).
3. `npm run migrate` — applies `docs/schema/core.sql` as `0001_core`, then `db/roles.sql` (creates the restricted `propiq_app` role and revokes access from Supabase's `anon`/`authenticated` roles).
4. In the SQL editor give the role a login: `alter role propiq_app login password '<long random password>';`
5. Fill `DATABASE_URL` with the **transaction pooler** string, user `propiq_app.<project-ref>`. Fill the Supabase Auth settings (JWKS URL or JWT secret).
6. `npm run dev` (the scripts read `api/.env` themselves).

Connection strings in `.env`: percent-encode special characters in passwords (`@` is `%40`). Use the **session pooler** (port 5432) for `MIGRATION_DATABASE_URL` if your network has no IPv6, and the **transaction pooler** (port 6543) for `DATABASE_URL`.

Never point `DATABASE_URL` at the owner (`postgres`) login: it can see every company.

## First organization, company and people

`npm run setup` (owner login) creates an organization, its first company, the standard roles (Owner; Administrator = everything except delete) and the people, from `db/setup.bytecraft.json` (not committed; copy `db/setup.example.json`). It is safe to run again: it only adds what is missing.

Each person needs a Supabase Auth account first (**Dashboard → Authentication → Users → Add user**, tick *Auto Confirm User*). Their account id becomes `users.id`, which is how a sign-in finds their company. People without an account are reported as WAITING and linked on the next run.

## Changing the schema

- Before the first real deployment `docs/schema/core.sql` may still be edited; rebuild a dev database with `ALLOW_DB_RESET=yes npm run migrate:reset`.
- After the first deployment it is **frozen**. Every change is a new numbered file in `db/migrations/` (`0002_add_x.sql`). The runner records a fingerprint of each applied file and stops if one was edited.

## Request flow

`Authorization: Bearer <Supabase access token>` + `X-Company-Id: <uuid>` on every company request. The API verifies the token, reads the person's membership and role from our tables, then runs the request in one transaction after setting `app.user_id`, `app.company_id`, `app.permissions`, `app.request_id` (transaction-local). Errors come back as `{ error: { code, message, details?, requestId } }`.

## Endpoints so far

| | |
|---|---|
| `GET /health`, `/health/db` | liveness |
| `GET /v1/me` | who am I, which companies can I enter |
| `GET /v1/transitions/:entity/:from` | what can this record do next, and which of those can *I* do |
| `GET /v1/property-types` | the kinds of property the company sells |
| `GET/POST /v1/projects`, `GET /v1/projects/:id` | housing schemes (code `PRJ-00001` numbered by the database), with property counts |
| `GET /v1/properties`, `/v1/properties/:id` | list / detail with project, block, size (as typed and in sq ft), active hold and status history |
| `POST /v1/properties` | add a property (code `PRP-00001`; a new block name creates the block) |
| `POST /v1/properties/:id/holds`, `DELETE /v1/holds/:id` | reserve / release |
| `GET/POST /v1/bookings`, `GET /v1/bookings/:id` | create takes an `Idempotency-Key` header |
| `POST /v1/bookings/:id/schedule` | build the payment plan (always adds up to the price) |
| `POST /v1/bookings/:id/status` | confirm / complete / cancel (the database enforces legality and permissions) |

Not built yet: receipts and their ledger posting, customers/parties, file storage (Supabase Storage via signed URLs), background jobs, rate limiting.
