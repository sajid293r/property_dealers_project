curl -sI https://property-dealers-project.netlify.app/login# Fixing the production QA findings — brief

**How to use.** Open a new Claude Code chat in this repository and paste:

> Read `docs/QA_FIX_PROMPT.md` completely, then `CLAUDE.md` and `docs/QA_REPORT.md` (section 4, the bug list, in full). Fix the bugs in the order given there, with tests, and stop for my review after each group. Do not commit. Do not run anything against the live database.

## Goal
`docs/QA_REPORT.md` recommends **NO-GO**. Close every blocker so the QA can be repeated and the system can go to production. Fix the cause, not the symptom, and add a regression test for every bug.

## Rules
- Follow `CLAUDE.md`: schema changes are new numbered migration files in `api/db/migrations/` (next number is `0017`; `core.sql` is frozen); a migration that creates a view ends with `select app.secure_views();`; business rules belong in the database, the API stays thin; front-end text goes through `t()` (all 8 languages, then `node scripts/check-i18n.mjs`).
- **Never run `migrate`, `setup` or anything else against the live Supabase database.** Test only on the in-memory test database and the local sandbox. Tell the owner explicitly which migrations to apply, and in what order relative to the deploy (migrate first, then push).
- Do not commit. Do not edit `AGENTS.md`.
- Keep user-facing messages plain and non-technical.
- Do not weaken a test to make it pass. If a bug turns out not to be a bug, say why with evidence.

## Order of work

**Group 1 — blockers (must be closed before go-live)**
1. **BUG-001 (S1)** deleting an approved voucher leaves its ledger entry. An approved or posted voucher must never be deletable: only the existing void/reversal path is allowed. Enforce it in the database (the delete must be refused, not just hidden in the screen), remove or disable the Delete button for approved vouchers, and make sure the API route cannot do it either. Add a check to `v_reconciliation` that finds any journal entry whose source voucher is gone or marked void without a reversal, and a test proving the old scenario is now refused.
2. **BUG-002 (S2)** budgets can reference another company's project. Add the missing company-checked foreign key (use the same helper the other tables use, `app.add_tenant_fk`, and the `links` list in the cross-tenant protection block). The report mentions **82 informational tenant-foreign-key gaps** from `v_tenant_fk_gaps`: review the whole list, fix every one that can be reached through the API, and explain any you leave. Add tests for each fixed link.
3. **BUG-003 (S2)** a Sales Agent can record a payment on a booking they cannot open. Apply the same data-scope rule used for bookings to every booking-related write (receipts, refunds, transfers, reminders, commissions, attachments, schedule changes). Test each as an agent against someone else's booking.
4. **BUG-005 (S2)** `/v1/leads-summary` is not plan-gated. Add it to the gating, then **audit every API route** against the plan lists in `api/src/plans.ts` and make the parity test fail if a route belonging to a gated module is not covered.

**Group 2 — S2, needed before real customers**
5. **BUG-004** list screens show 0 and an empty list while loading or when the server fails. Show a skeleton while loading and a clear error with a Retry button when a request fails. Fix it in the shared list/table/KPI pattern, not screen by screen, then check every live screen.
6. **BUG-006** a very fast double-click creates two receipts. Add server-side duplicate protection: the front end sends a unique request id with each money-creating action and the server returns the earlier result for a repeated id (receipts first, then vouchers, refunds, payroll runs, late-fee assessments, cheques). Keep the booking flow's existing behaviour. Also disable the button while a request is running.

**Group 3 — S3 (fix in this order, each small)**
BUG-007 and BUG-009 (oversized/malformed input → clear 4xx; no internal names in errors), BUG-008 (overlapping leave → a plain refusal), BUG-010 (same account debit and credit in one journal), BUG-011 (assessing a late fee twice), BUG-012 (identical bank statement imported twice; wrong closing balance), BUG-018 (duplicate cheque number), BUG-017 (check the real file type from the file's first bytes, not the name), BUG-014 and BUG-015 (print page "not found"; workspace error screen with Retry and no raw server text), BUG-013 (phone-width overflow), BUG-016 (clickjacking and browser hardening headers in `netlify.toml`), BUG-019 (large upload speed: investigate; if the cause is the base64 path or the database round trips, propose the fix and say what it would cost). Anything in the report marked as an observation is optional.

## Verification (after each group)
`npx tsc --noEmit`, `npx eslint app components lib`, `node scripts/check-i18n.mjs`, `npx next build`, `cd api && npm run typecheck && npm test`, `node docs/schema/smoke-test.mjs` (needs `npm i --no-save @electric-sql/pglite`), the browser suites in `e2e/` on a fresh sandbox, and the QA scripts the tester left in `api/qa/` and `e2e/qa/` (read them first; they reproduce the bugs and should now pass). Report counts honestly.

## Hand-off
1. Update `docs/QA_REPORT.md`: for each bug, add a `Status` line (fixed / not a bug / deferred) with the test that proves it.
2. A plain-language summary for the owner: what was fixed, what remains, and **the exact order of deployment** (which new migrations to run first with `cd api && npm run migrate`, then push).
3. Say which tests the QA chat should re-run on the live site afterwards (the two-in-a-row smoke test and the five blocker scenarios).
