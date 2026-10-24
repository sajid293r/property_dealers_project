# PropIQ — Verified Weaknesses & Hardening Spec

*Written 2026-10-08 from two outside reviews (the Claude "action plan" PDF and the ChatGPT "Weaknesses & Improvements" docx), each checked against the actual repo: `docs/schema/core.sql`, `docs/erd/schema.mjs`, `lib/plan.ts`, `components/animated-number.tsx`, `app/page.tsx` and the route tree.*

---

## Progress log

| Task | Status | Notes |
|---|---|---|
| F0.1 Server-render counters | **Done 2026-10-08** | `AnimatedNumber` renders the final value on the server; count-up replays after hydration; respects reduced motion. Verified: landing HTML contains 4,999 / 12,999 / 27,999. |
| F0.2 No false zeros on the dashboard | **Done 2026-10-08** | Root cause was the hero banner (handed `0` before data arrived); it now shows placeholders until loaded. Every other counter was already behind a skeleton. |
| F0.3 Sidebar shows only the plan | **Done 2026-10-08** | Only included pages are listed, plus one "More features +N" entry; ⌘K still lists all with a lock. Re-tiered to match the pricing page (Group Overview → Premium; Quotations, Sales Invoices, Staff → Moderate) so **Basic = 10 items**. |
| F0.4 Sample data option | **Done 2026-10-08** | New Company dialog: "Sample data" (default) or "Empty workspace"; sample companies (id ends `-sample`) derive from the demo records. They keep the demo cities (Lahore etc.) because the data layer only receives the company id. |
| F0.5 MVP / phase-2 badges | **Done 2026-10-08** | Every ERD module declares `phase` (build fails otherwise); `phase2Tables` marks the unfinished parts of tax and SaaS billing. **155 MVP / 76 phase-2 tables.** Phase 2: budgets, procurement, construction, HR, consolidation. Note: 155 MVP tables is still far above the 40-60 first-migration target (a separate task: "Cut the MVP table list"). |
| D1.1 Reversible allocations + `void_receipt` | **Done 2026-10-08** | Allocations append-only (reversal rows), paid/status recomputed not incremented, receipt guard trigger, `app.void_receipt`, void metadata columns. 16 new smoke checks (115 total, all pass). ERD updated. |
| D1.2 Composite tenant FKs | **Done 2026-10-08** | 46 references across 17 tables now carry `company_id`; parents have `unique (company_id, id)`; `v_tenant_fk_gaps` lint view (83 phase-2 references still open, by design). 7 new checks run as company 2 under RLS. |
| D1.3 Holds, property status, safe booking | **Done 2026-10-08** | `property_holds`, `property_status_history` now executable; status derived by triggers; `place_hold`, `release_hold`, `expire_holds`, idempotent `create_booking`; manual contradicting edits rejected. 26 new checks. Tests found and fixed a NULL-logic hole where a staff hold let anyone book. |
| D1.4 State machines | **Done 2026-10-08** | Table-driven `state_transitions` + one trigger on booking, installment, receipt, property, voucher; permissions use the app's `module.action` names; `app.allowed_transitions` for the UI; diagrams in `docs/STATE_MACHINES.md`. Cheque, quotation, deal machines wait for their tables. 22 new checks. |
| D1.5 CNIC hash | **Done 2026-10-08** | `parties.cnic` replaced by `cnic_enc` + keyed `cnic_hash` + `cnic_last4`, all-or-none; unique `(company_id, cnic_hash)`; API-side helper `docs/schema/cnic.mjs` (AES-256-GCM + HMAC-SHA-256). 11 new checks. NTN left as is: it is a business tax number, not a personal ID. |
| D1.6 Posting guards | **Done 2026-10-08** | `app.reverse_entry`; entry date inside its period; closed fiscal year blocks posting; a document posts once (partial unique index). Left out on purpose: a role-gated "post into a locked period" override: accountants reopen the period instead, which is auditable. 6 checks. |
| D1.7 Typed references | **Done 2026-10-08** | `combined_transaction_items` and `document_taxes` now name exactly one real document (composite FKs). `bill_payment`/`cheque` items and vendor-bill/payroll/transfer/commission taxes wait for their tables. `budget_commitments`: a non-manual commitment must name its source id; the FK arrives with the procurement tables. 11 checks. |
| D1.8 Audit + conventions | **Done 2026-10-08** | `app.audit_row` on 16 tables (changed fields only, actor, request id); audit trail immutable; `v_convention_gaps` lint (documents / master data) with 6 tables brought into line. 14 checks. |
| D1.9 Branches, teams, scope | **Done 2026-10-08** | `branches`, `teams`, `team_members`; `branch_id` on staff, bookings, receipts, vouchers; `app.user_in_scope`. Not wired into RLS: the API applies it in queries. `project` scope fails closed until a project-assignment table exists. 15 checks. |
| D1.10 Reconciliation | **Done 2026-10-08** | `v_reconciliation` (8 checks) + `app.reconciliation_summary()`; proven by corrupting data on purpose. 4 checks. |
| Booking totals | **Done 2026-10-08** | `app.build_schedule`; confirm needs a schedule that adds up, complete needs all paid/waived, total locked after confirmation, 9th reconciliation check. 24 checks (one real bug found: a shared trigger read a column the bookings table lacks). |
| **Wave 1 (database)** | **Complete** | 256 smoke checks pass. ERD 231 tables. |
| **Decisions (2026-10-09)** | Confirmed | First customer = **developers** (broker/commission work deferred: P3.7 is off the plan for now). Host = **Supabase** (Postgres + Auth + Storage). Login = **Supabase Auth**. API = **Fastify** in `api/`. |
| B2.1 API skeleton | **Done 2026-10-09** | `api/`: config, one-transaction-per-request DB layer that sets company/user/permissions/request id (transaction-local), error mapping to plain messages, request ids, migration runner with fingerprints + `db/roles.sql` (restricted `propiq_app` role; revokes Supabase `anon`/`authenticated`). |
| B2.2 Sign-in | **Done (core) 2026-10-09** | Verifies Supabase Auth tokens (JWKS or shared secret; audience/issuer/expiry), creates the profile row on first sign-in with Supabase's id, `/v1/me`. DB rule added: a person can read their own memberships before choosing a company. **Not yet: MFA enforcement for owners/accountants, session revocation.** |
| B2.3 Authorization | **Partly done** | Route-level permissions from the role, database-level per-transition permissions (`app.permissions`), data scope (`app.user_in_scope`) applied to bookings. **Not yet: the generated permission-matrix test (role x action x module).** |
| B2.4 Lifecycle endpoints | **Partly done** | Properties (list/detail/history), holds, bookings (idempotent create, schedule, confirm/complete/cancel), transitions lookup. **Not yet: receipts + allocations + void, ledger posting (needs posting rules), customer statement, parties, projects.** |
| B2.5 Idempotency + jobs | **Partly done** | `Idempotency-Key` on booking creation (database-enforced). **Not yet: outbox, retry/dead-letter worker, scheduled jobs (hold expiry per company, reminders), generic idempotency store.** |
| B2.7 End-to-end tests | **Started** | 25 API tests (`cd api && npm test`): sign-in failures, two companies side by side, cross-company booking attempts, permissions enforced by Postgres, data scope, idempotent retry, audit trail with request ids, connection settings not leaking, migrations tamper check. They run on an in-memory Postgres over a real connection; **CI on a real Postgres (Supabase branch or container) is still to do.** |
| Supabase hookup | **Done 2026-10-09** | Project created (region ap-northeast-1 = Tokyo; Postgres 17). `0001_core` applied: 96 tables, 51 functions, forced row-level security on 88 tenant tables, `anon`/`authenticated` hold no grants, reconciliation and convention checks at 0. `propiq_app` has a login and works through the transaction pooler; the migration ledger is hidden from it. The real API boots against it (health/db OK, unauthenticated calls refused). Tokens are ES256 (JWKS). **Not yet done: a real signed-in user and a first company (needs an onboarding/seed step), Data API switch confirmed off in the dashboard, rotate the owner password (it was shared in chat).** |
| First organization | **Done 2026-10-19 (people pending)** | `npm run setup` built and tested (8 tests; idempotent, transactional, role modules checked against `lib/permissions.ts`). Created in Supabase: organization **ByteCraft** (premium), company **ByteCraft**, roles **Owner** (all actions) and **Administrator** (all but delete), 14 modules each. **Linked 2026-10-19: Umair Ruman (umairruman33@gmail.com) as Owner (one account holds one role per company; Owner includes everything Administrator has). Waiting: Sajid Nazir needs his own Supabase Auth account + email in the setup file; then re-run `npm run setup` (and, if wanted, change Umair to Administrator in the file).** |
| B2.6 Front-end sign-in + first live screens | **Done 2026-10-19 (tested offline; real Supabase sign-in pending the publishable key)** | `/login` (Supabase Auth), session + company providers (real companies from `/v1/me`), demo mode kept for presentations, honest notices for unconnected sections, demo-only widgets hidden in live mode. **Connected: Properties, Projects, Plot Map** (list + create through the API; stored in the database, survive a reload). API added: projects, property types, create property (sizes in sq ft, blocks), CORS. Migration `0002` (sizes, company defaults, block-in-project; 15 new database checks). `core.sql` is now frozen; changes are migrations. `npm run sandbox` runs the whole stack offline; **27-check browser test** (`e2e/`) passes against it. |
| Next | Wave 2 continued | Customers (parties) so holds and bookings can be used in the UI, then bookings/holds screens; receipts + void + posting rules; generated permission matrix test; Storage (signed URLs); scheduled jobs. |

**Operational note for D1.5:** the HMAC key must be created once per organization and never rotated casually (rotating it means re-hashing every CNIC). Keep it separate from the data-encryption key.

**Known limits:** the smoke test runs on one connection, so "two simultaneous bookings" is proven by the row lock + unique index and sequential tests; a true parallel test belongs to the API integration suite (B2.7). `expire_holds()` sweeps the current company only (RLS); the scheduler must call it per company.

---

## Part 1 — What is actually weak

### 1.1 Method and the headline

Both reviews were written mostly from the ERD viewer and the public site. Many of the "critical schema fixes" are **already done in the executable SQL**. Some of the proposed fixes would be **wrong if applied literally**. The real weaknesses are fewer than the 29 + 30 items suggest, and they cluster in four places:

1. **There is no running backend.** No API, no auth, no jobs. 227 tables are designed, about 90 are executable and tested. Neither review says this plainly, and it is the biggest gap. Everything else only matters once there is a system to harden.
2. **The property → booking → collection lifecycle is not closed at the database level.** Holds, status transitions and receipt voiding are the holes.
3. **Dealer-broker workflow (sauda/bayana, commission) is not in the executable schema or the UI.** Whether this is a gap depends on a decision only you can make (see §1.5).
4. **A first-paint bug makes the prototype look unfinished** ("Rs 0/month", zero KPIs). Both reviews misdiagnosed the cause.

### 1.2 Verified — real weaknesses (ranked)

| # | Weakness | Evidence | Severity | Source |
| Finance wave (2026-10-19) | **Done** (vouchers, banks, reconciliation, reports, customers live) | Migrations 0003–0006: 43-bank catalog, bank accounts, 85-account chart, 10 voucher types (CPV/CRV/BPV/BRV/JV/CV/SV/PIV/CN/DN) with approval = posting and void = reversal, bank statements + reconciliation (outstanding items, adjusted balance, finish only at zero difference), trial balance/ledger/party statement. Live screens: Vouchers, Accounts, Bank Reconciliation, Reports, Customers. Tests: smoke 402, API 70, browser 27 + 19. Still preview-only: Deals/Bookings UI, Expenses, CRM, Quotations, Invoices, PDCs, Contracts, Budgets, HR, Contractors, Admin, Dashboard KPIs. Bank list is from knowledge, not an SBP export — verify. |
| Sales & production wave (2026-10-20) | **Done** | Migration 0007 receipts (`app.record_receipt`, `v_receipts`); API: receipts, richer bookings, `/v1/dashboard`, `/v1/expenses`; live screens: Dashboard, Deals & Bookings (+ detail), Sales Invoices, Expenses; unfinished pages hidden from real companies; `api/Dockerfile`, `docs/GO_LIVE.md`. Tests: smoke 414, API 74, browser 26 + 21 + 12. Not built: CRM, quotations, PDCs, contracts, budgets, HR, contractors, administration. |
| Section B — output and the money details (2026-10-21) | **Done** | Printable documents + CSV export, file attachments, property detail pages, collection reminders, late charges / refunds / booking transfer / dealer commission (migration 0015), activity log, forgot-password and My account; fixed CORS missing PUT (would have broken voucher/budget/role saving in a browser). Tests: smoke 496, API 107, browser 26+21+12+27+15. |
| Plans, administration and the rest of the modules (2026-10-20) | **Done** | Migrations 0008–0011: invites, CRM leads, quotations→bookings, PDC cheques, service invoices, contracts, staff/leave/payroll, contractor agreements/bills, budget self-approval setting. Server-enforced plans (Basic / Professional / Advanced, `api/src/plans.ts`) with seat limits and a server/website parity test. Live: leads, quotations, cheques, service invoices, contracts, contractors, budgets, staff, leave, payroll, administration (users, invites, roles, company profile), sign-up for invited staff. Tests: smoke 465, API 94, browser 26 + 21 + 12 + 27. Still not live: Settings/Billing, Group overview. |
|---|---|---|---|---|
| W1 | **No backend / auth / API / worker exists.** All data is in-memory and per-browser. | `lib/services` fakes 350 ms latency over mock arrays; CLAUDE.md "Known gaps" | Critical | Neither (found here) |
| W2 | **Receipt void does not reverse allocations.** `apply_allocation` fires on INSERT only. Voiding a receipt (`status='void'`) leaves installments `paid`. `receipt_allocations` rows can also be updated or deleted freely. | `core.sql:954-983`; no update/delete guard on `receipt_allocations` | Critical | Claude plan (correct) |
| W3 | **Cross-tenant references are possible.** FKs are single-column (`bookings.property_id → properties(id)`). RLS filters reads, but FK checks run as the table owner and ignore RLS, so a buggy or malicious write can link company A's booking to company B's property. | `core.sql:806-827` | High | Both (correct) |
| W4 | **Holds and property status are not enforced in the executable schema.** `property_holds` and `property_status_history` exist only in the ERD. Nothing ties `properties.status` to bookings, so the plot map and the booking screen can disagree. The one-live-booking index is good but covers only bookings. | `schema.mjs:958`; `core.sql:829` | High | Both (partly right — see R1) |
| W5 | **State machines exist for budgets only.** Property, booking, cheque, installment and receipt can move between any states. | `assert_budget_transition` is the only transition trigger | High | Both (correct) |
| W6 | **CNIC protection and uniqueness conflict.** The column is meant to be encrypted at rest, but a unique index on ciphertext does nothing (random nonce). The index at `core.sql:197` works today only because the column is plaintext. | `core.sql:184,197` | High | Claude plan (correct, narrower than stated) |
| W7 | **Posting guards are thin.** `assert_postable` rejects group accounts and locked periods. It does not check that the entry date falls inside the period, that the account belongs to the same company, or whether `closed` (not just `locked`) periods block posting. No reversal function exists. | `core.sql:670-680` | Medium-High | ChatGPT (partly right) |
| W8 | **Untyped references on money tables.** `combined_transaction_items.ref_id`, `document_taxes.doc_id`, `budget_commitments.doc_id` can point at nothing. | `core.sql:736,1099,1575` | Medium | Both (correct) |
| W9 | **Audit is a table, not a mechanism.** `audit_log` exists and is partitioned, but nothing writes to it. No trigger or app interceptor is specified for property status, price, allocation, commission. | `core.sql:134-149` | Medium | ChatGPT (correct) |
| W10 | **`team` data scope has no `teams` table; no `branches` table.** The pricing page sells "multi-branch". | `schema.mjs:89` | Medium | Claude plan (correct) |
| W11 | **First-paint zeros.** `AnimatedNumber` starts at 0 and renders `format(0)` on the server, so every counter (pricing, hero counters, dashboard KPIs) ships as "Rs 0" / "0" in the HTML and in link previews. The prices themselves are fine (Rs 4,999 / 12,999 / 27,999 in `lib/plan.ts`). | `animated-number.tsx:15-22`; `app/page.tsx:700` | High (cheap to fix) | Both (symptom right, cause wrong) |
| W12 | **No operational workspaces.** There is no Recovery Center (due-today / overdue / promise-to-pay), no Customer 360, no property detail screen, no lead→property matching. Overdue figures exist only as dashboard KPIs. | Route tree under `app/dashboard`; CLAUDE.md "Designed but no UI yet" | High (product) | Both (correct) |
| W13 | **Dealer sauda / commission not executable.** `commission_rules` and `commissions` exist in the ERD only. There is no `deals` table in `core.sql` (the prototype's `/deals` page is a sales-pipeline screen). Only `bookings.dealer_id` exists. | `schema.mjs:1575-1587`; `core.sql:813` | Decision-dependent | Claude plan |
| W14 | **Sidebar shows too much.** 26 nav items; 14 are visible to Basic. The target of ≤10 is reasonable for a non-technical owner. | `lib/plan.ts:51+` | Low-Medium | Claude plan |
| W15 | **Scope breadth.** 227 tables for a 2-developer team is a delivery risk. Phase-2 modules should be frozen and labelled. | ERD | Strategic | Both (correct) |

### 1.3 Rejected — already solved, so not a weakness

| # | Claim | Reality |
|---|---|---|
| R1 | "Make double-booking impossible" via unique index on `status IN ('pending','confirmed')` | `bookings_one_live_per_property` **already exists** and covers `pending, confirmed, completed` (`core.sql:829`). **The plan's version is worse**: it would allow a second booking on an already-completed sale. Do not apply it. What is missing is holds and the status sync (W4). |
| R2 | "Scope every unique constraint to the tenant" | Done. `(company_id, code)`, `(company_id, number)`, `(company_id, receipt_no)`, `(company_id, booking_no)`, `(company_id, start_date)` and the rest are all tenant-scoped (`core.sql:218-1017`). |
| R3 | "Add company_id to document_sequences key" | Done. PK is `(company_id, doc_type, period_key)`; `app.next_doc_no` is an atomic upsert with a row lock (`core.sql:152-172`). |
| R4 | "CNIC unique per tenant" | Done in plaintext form (`core.sql:197`). Only the encryption interaction is open (W6). |
| R5 | "Accounting invariants not visible" (ChatGPT) | Balanced entries (deferred constraint trigger), append-only entries and lines, locked-period and group-account guards, rolled balances — all exist and are tested in the smoke test. Remaining gaps are W7 only. |
| R6 | "RLS should be considered" (ChatGPT) | Already enabled and forced on every `company_id` table, plus org-level policies (`core.sql:1748-1803`). Needs **testing as the app role** at the API layer, not a design change. |
| R7 | "Rs 0/month → show Free during beta" | Prices are defined. Replacing them with "Free during beta" throws away real pricing to hide a rendering bug (W11). Fix the bug; decide separately whether to publish prices. |
| R8 | "Homepage metrics vs zeros inside the app" | Seeded companies are populated; only **new** companies start empty, by design (CLAUDE.md). The real issue is that a prospect creating a company sees an empty app. Fix with an optional "start with sample data" choice (the starter-data pack in `BACKEND_DESIGN.md` §11.2), not by changing the data model. |
| R9 | "Collapse to one role system" | Could not verify two systems: `roles` + `company_members.role_id` look like one. Dropped until someone points at the second. |
| R10 | "Cut to 40-60 tables" as a migration rule | Sensible as sequencing but wrong as a goal on its own. Keep the full ERD as design; migrate in waves (§2.5). Do not delete designed tables. |

### 1.4 Accepted but deferred (valid, not now)

Customer self-service portal, public shareable property pages, report builder, full HR attendance, procurement/stock, tax returns, GIS, white-label. These are real opportunities and none can ship before W1–W5 are closed.

### 1.5 Decisions needed from you (these change scope, not just order)

1. **Primary buyer.** The Claude plan *assumed* brokers/dealers with 2-15 staff; ChatGPT suggests two editions. CLAUDE.md says "property dealers **and** housing-scheme developers." The booking → installment → recovery lifecycle is developer-style; sauda/token/commission is broker-style. **Recommendation:** Wave 1-2 below is buyer-agnostic. Wave 3 splits: build Recovery first (serves both), and build `deals` + commission only if the first target customers are brokers. Decide before Wave 3 starts.  **→ Decided 2026-10-09: developers.**
2. **Published prices.** Keep Rs 4,999 / 12,999 / 27,999 on the page, switch to "Contact us", or "Free during beta". Pure content change.
3. **Hosting / residency** and the other items in `BACKEND_DESIGN.md` §14 — still open.

---

## Part 2 — Spec plan

**Principle (agreed by both reviews):** build less breadth, make the **lead → hold → booking → installments → receipt → ledger → statement** lifecycle trustworthy end to end.

**Assumptions:** 2 developers, ~6 weeks to a first design-partner pilot; Postgres + NestJS + Drizzle as already chosen in `BACKEND_DESIGN.md`; estimates are rough and should be re-cut after Wave 0.

### 2.0 Definition of done for every task

Migration + SQL test in `docs/schema/smoke-test.mjs` (or API test) + ERD/doc updated (`node docs/erd/build.mjs`) + `tsc`, `eslint app components lib`, `next build` clean. Tests run as the **non-owner app role**, never as the migration owner.

### Wave 0 — Quick wins, front-end only (days 1-3, one developer)

| ID | Task | Acceptance |
|---|---|---|
| F0.1 | **Fix W11 at the root.** `AnimatedNumber` renders the final `format(value)` on the server and on first client render, and only animates from 0 after mount when the user has not requested reduced motion and the element is in view. | `curl` the landing page: pricing, hero counters show real numbers. Dashboard no longer flashes "Rs 0". No hydration warnings. |
| F0.2 | Dashboard KPIs and charts show skeletons until data resolves (check each `use-dashboard-data` consumer). | Throttled-network load shows skeletons, never false zeros. |
| F0.3 | Sidebar: show only items in the user's plan, plus one "More features" entry. Re-check tier assignments in `NAV_ITEMS`. | Basic user sees ≤10 items; ⌘K palette still lists everything with a lock badge. |
| F0.4 | "Start with sample data" option in New Company dialog. | A new company can be created pre-populated or empty. |
| F0.5 | Mark each ERD module **MVP / phase-2** in `schema.mjs` and `viewer.html` (W15). | Every module carries a badge; `build.mjs` fails if one is untagged. |

### Wave 1 — Database invariants (week 1-2, one developer, in parallel with Wave 0)

All in `docs/schema/core.sql` + smoke tests. These close W2-W8 and need no API.

| ID | Task | Detail | Acceptance test |
|---|---|---|---|
| D1.1 | **Reversible allocations** (W2) | Make `receipt_allocations` append-only (block UPDATE/DELETE). Add `app.void_receipt(receipt_id, by, reason)`: marks the receipt void, inserts negative reversal rows (or a `reversed_at` marker) so a single recompute function sets `installments/penalty_charges/invoices.paid_amount/status` from allocations. Replace the incremental `+ new.amount` update with a recompute so it cannot drift. Also post the reversing journal entry. | Void a paid receipt → installment returns to `due`/`partial`, journal reversed, `account_balances` net to zero effect. Updating or deleting an allocation raises. |
| D1.2 | **Composite tenant FKs** (W3) | Add `unique (company_id, id)` on tenant tables, then composite FKs `(company_id, X_id)` for the core chain: bookings→properties/parties, installments→bookings, receipts→parties/bookings, allocations→receipts/installments, journal_lines→gl_accounts/entries, properties→projects. Start with the lifecycle tables; extend by lint. | Insert a booking in company A referencing company B's property **as the app role with RLS on** fails. |
| D1.3 | **Property status + holds** (W4) | Promote `property_holds` and `property_status_history` into `core.sql`. Add `properties.status` check (`available, on_hold, booked, sold, blocked`) maintained by trigger from holds/bookings, with every change written to `property_status_history`. Partial unique index: one active hold per property. `app.create_booking(...)` locks the property row (`FOR UPDATE`), rejects if a live booking or someone else's unexpired hold exists, inserts the booking, and updates status in one transaction. `app.expire_holds()` for the scheduler. | Two concurrent `create_booking` calls on one plot → exactly one succeeds. An expired hold releases the plot. Cancelling a booking returns the plot to `available` and writes history. |
| D1.4 | **State machines** (W5) | Table-driven allowed transitions (`state_transitions(entity, from, to, required_permission)`) enforced by one generic `before update` trigger on property, booking, installment, cheque, receipt, quotation. Reuse the budget pattern. Diagrams in `docs/STATE_MACHINES.md`. | Illegal transitions raise; each legal one is covered by a test; permission requirement is returned to the API. |
| D1.5 | **CNIC hash** (W6) | Add `cnic_hash` (HMAC-SHA-256 with a server-held key, computed in the API, never in SQL) and `cnic_enc`; unique index becomes `(company_id, cnic_hash)`; drop the plaintext unique index. Same pattern for NTN. | Same CNIC at two companies is accepted; twice at one company is rejected; plaintext never stored. |
| D1.6 | **Posting guards** (W7) | Trigger: entry date must lie within `period_id` range; account and period must share `company_id`; `closed` and `locked` both block ordinary posting (a role-gated override for adjustments). Add `app.reverse_entry(entry_id, date, reason)`. | Each rule has a failing-case test. |
| D1.7 | **Typed refs on money tables** (W8) | `combined_transaction_items`, `document_taxes`, `budget_commitments`: replace `ref_id/doc_id` with nullable typed FKs + `num_nonnulls(...) = 1`. Keep polymorphic links for comments/tags/files. | Row pointing at a missing document cannot exist. |
| D1.8 | **Audit mechanism** (W9) | A generic row-audit trigger (before/after jsonb, `app.current_user_id()`, request id) attached to a named list: properties (status, price), bookings, installments, receipt_allocations, commissions, gl accounts, approvals. Convention lint: every table has `created_at`; mutable masters have `updated_at/version`; financial docs have no `deleted_at`. | Changing a property price writes one audit row with old and new values. Lint fails CI on a non-conforming table. |
| D1.9 | **Branches and teams** (W10) | `branches (company_id, …)`, `teams`, `team_members`; `branch_id` on users' membership, bookings, receipts, leads. Data scope `team`/`branch` resolves to real rows. | Pricing's "multi-branch" has a table behind it; scope tests for own/team/branch/company. |
| D1.10 | **Reconciliation views** | `v_recon_ledger`, `v_recon_allocations` (allocated vs receipt, installment paid vs allocations sum), `v_recon_inventory` (status vs live booking/hold), `v_recon_orphans`. All should return zero rows on a healthy DB. | Smoke test seeds an inconsistency (as owner) and sees it detected. |

### Wave 2 — Backend vertical slice (weeks 2-5, both developers)

Goal: **one real path through the system**, replacing the mock seam (`lib/services`) for these entities only. Everything else stays on mock data.

| ID | Task | Detail |
|---|---|---|
| B2.1 | API skeleton | NestJS modular monolith; Drizzle; per-request transaction that runs `SET LOCAL app.company_id/app.user_id`; request id; OpenAPI; Postgres connection as **non-owner app role**. |
| B2.2 | Auth + membership | Better-Auth or Auth.js (decide), argon2id, short-lived JWT + rotating refresh, active-company switching reflects the existing `useCompany()`. TOTP for owner/accountant roles. |
| B2.3 | Authorization | Permission guard driven by `PERMISSION_MODULES` / roles; data scope; **a permission matrix test** (role × action × module for view, create, edit, post, approve, export, void, delete) generated from the same source as the UI. |
| B2.4 | Lifecycle endpoints | Parties, projects, properties, holds, `create_booking`, installment schedule generation, receipts + allocations, `void_receipt`, customer statement. State-transition errors map to readable 409/422 messages. |
| B2.5 | Idempotency + jobs | `Idempotency-Key` on create/post endpoints; outbox table; worker with retry/backoff and dead-letter; scheduled jobs: `expire_holds`, reconciliation views, reminder generation. |
| B2.6 | Frontend swap | Implement the real `xService` for the slice behind a flag (`NEXT_PUBLIC_API`), keep React Query keys unchanged; mock remains default for the demo. Optimistic edits use `setQueryData` only where the server confirms. |
| B2.7 | End-to-end tests | Playwright + API tests for the 3 flows below with two tenants running side by side. |

**The three flows that must be proven (cut down from ChatGPT's seven):**
1. Lead → quotation → hold → booking → schedule → plot map shows the status change.
2. Installment due → receipt (split tender, multi-allocation) → ledger entry → customer statement → **void** → everything returns.
3. Tenant A cannot see, reference or number-collide with tenant B at any step (API and raw SQL as app role).

### Wave 3 — Operational workspaces (weeks 5-8)

| ID | Task | Detail |
|---|---|---|
| P3.1 | **Recovery Center** (W12) | Due today / overdue / upcoming queues, aging buckets, promise-to-pay with date and officer, PDC follow-up, collection-officer workload, "send reminder". Built on D1.1 allocations and `installments`. One page, reuse KPI + table components. |
| P3.2 | **WhatsApp reminders** | Token deadline, installment due, cheque date, using `message_templates` + `outbound_messages`; scheduled job with delivery status logged; dry-run mode until a WhatsApp Business account is approved. |
| P3.3 | **Customer 360 and Property 360** | One screen each: bookings, schedule, receipts, ledger, documents; property specs, history, holds, status log. Replaces the table-only views. |
| P3.4 | **Lead requirements + matching** | Wanted type, size range, areas, purpose, timeline on `leads`; a matching view over available listings; dedupe by `(company_id, phone_e164)` with merge flow. |
| P3.5 | **Property-sales reports** | Sales by project/block/agent, conversion and cancellation, installment aging, recovery efficiency, inventory aging, expected collections, commission liability, PDC exposure. Reads from read models, never raw journal scans. |
| P3.6 | **Role dashboards / "needs my attention"** | Overdue, new leads, holds expiring, PDCs due, approvals, commissions payable, per role. |
| P3.7 | *(only if brokers are the first buyer — decision 1.5)* **Deals + commission** | `deals` (seller, buyer, property/listing, token amount/date, agreement deadline, forfeiture terms, stage), `deal_commissions` (receivable from buyer and/or seller, splits to agents and co-brokers), posting through `posting_rules`, dealer statements, clawback on cancellation. Move `commission_rules/commissions` into `core.sql` with tests. |

### 2.4 Explicitly out of scope until Waves 1-3 are green

Construction/IPC, procurement and stock, full HR attendance, tax returns, consolidation UI, GIS, white-label, report builder, customer portal, public property pages. They stay in the ERD, tagged phase-2.

### 2.5 Migration packaging

Keep the full ERD. Executable migrations are layered: `001_platform`, `002_accounting_core`, `003_property_core`, `004_sales_collections`, `005_crm_messaging`; everything else lives in a `phase2/` folder that CI does not run. Each wave adds numbered migrations; no edits to applied ones.

### 2.6 Validation with real users (runs alongside Wave 2-3)

Recruit 5-10 dealers/developers across two cities; task-based sessions (record a token/booking, add a buyer lead, post an installment, find a matching plot, void a wrong receipt); watch, don't demo; end each with "what do you pay today (register, munshi, other software) and what would you pay for this." Use the results to rank Wave 3 and to settle decisions 1.5.1-1.5.2. Notes in one shared doc.

### 2.7 Risks

| Risk | Mitigation |
|---|---|
| W1 turns out larger than 6 weeks for 2 developers | Wave 2 is a *slice*; cut P3.x, never D1.x |
| Composite FKs complicate every insert | Do the lifecycle chain only (D1.2), and add the lint for the rest |
| Voiding and reversal rules differ by accountant | Confirm with the client's accountant before D1.1/D1.6 are final; keep reversal as new rows so the rule can change |
| RLS tested only as owner, passing falsely | Test harness connects as a non-owner role; fail the suite if it connects as owner |
| Reminder messages sent twice or to wrong tenant | Outbox + idempotency key per (tenant, event); dry-run first |

### 2.8 Suggested order, one line

**F0.1 → D1.1-D1.3 → D1.4-D1.10 → B2.1-B2.3 → B2.4-B2.7 → P3.1-P3.6 (P3.7 if brokers).**
