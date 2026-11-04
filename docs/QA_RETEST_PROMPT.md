# PropIQ — QA re-test brief (after the fixes)

**How to use.** Only after the fixes are **deployed** (migrations `0016`–`0019` applied with `cd api && npm run migrate`, then one push; wait for the Netlify deploy to finish). Open a new Claude Code chat in this repository and paste:

> Read `docs/QA_RETEST_PROMPT.md` completely, then `docs/QA_REPORT.md` (the whole file, especially section 4 and the Status lines), `docs/PRODUCTION_TEST_PROMPT.md` (rules of engagement and section 8) and `CLAUDE.md`. Act as the QA lead and run the re-test in `docs/QA_RETEST_PROMPT.md`. Do not fix anything; report. Do not commit.
>
> For the live site I authorise you to enter data in the seeded ByteCraft organisation (prefix everything `QA-`). Sign in with `umairruman33@gmail.com` and the password I am giving you now: `<type the password here, in the chat only>`. Keep it in an environment variable (`QA_EMAIL`, `QA_PASSWORD`) and never write it into any file, script, screenshot or the report.

(The real password goes in the chat message only; this file is committed.)

## What changed since the first run
All 19 bugs in `docs/QA_REPORT.md` section 4 now have a `Status` line. The fixes are migrations `0017` (voucher void guard, company-checked references, new self-checks), `0018` (request ids), `0019` (small rules: same-account journal, late fees, cheques, statements) and code changes in the API and the website. **Do not take the Status lines on trust: your job is to try to break each fix.**

## 0. Before you start (stop and report if any fails)
1. `curl -s https://property-dealers-project.netlify.app/api/health/db` returns `{"ok":true}`.
2. The deploy contains the fixes: `curl -sI https://property-dealers-project.netlify.app/login` shows `x-frame-options: DENY`. If it does not, the deploy is old: report **BLOCKED** and stop.
3. Run the automated baseline once on your machine and record the counts: `cd api && npm test` (expected 169), `node docs/schema/smoke-test.mjs` (expected 512), `npx tsc --noEmit`, `npx eslint app components lib`, `node scripts/check-i18n.mjs`.

## 1. The five blockers
Run each one, record PASS/FAIL with evidence (request, status, body; screenshot path where it is a screen).

| # | Blocker | Where it can be proven | How |
|---|---|---|---|
| 1 | BUG-001: an approved voucher cannot be deleted; the books keep a reversal | **Live** | `retest-live.mjs` checks B1, B1b, B1c (below). Also open an approved QA voucher in the browser: no Delete button, Void still works and the trial balance still balances. |
| 2 | BUG-002: a budget cannot point at another company's project (and no other single-column cross-company reference is left) | **Test database only** (live has one company) | `cd api && npx vitest run test/regression.test.ts -t "BUG-002"` and the smoke test's "lint view" check. State plainly in the report that this is proven on a test database, not on live. If the owner can give you a second company on live, repeat it there. |
| 3 | BUG-003: a Sales Agent cannot touch a colleague's booking (receipt, schedule, refund, transfer, reminder, commission, cheque, file, hold) | **Test database**; live only if the owner invites a Sales Agent to a test email | `npx vitest run test/regression.test.ts -t "BUG-003"` (7 tests). On live, if an agent account exists, repeat the calls in that test by hand. |
| 4 | BUG-005: Basic/Professional cannot reach higher-plan routes (including `/v1/leads-summary`, `/v1/budget-check`, `/v1/budget-revisions`) | **Test database** (live is Advanced and must not be changed) | `npx vitest run test/plans-routes.test.ts`. It calls every gated route as a Basic and a Professional company. |
| 5 | BUG-004: a failing request shows a clear error with Try again, never zeros; slow loads show a skeleton | **Live, in the browser** | Reuse `e2e/qa/g3-states.mjs` (read it first): it blocks each screen's main API request with browser request interception, so it changes nothing on the server. It hard-codes the sandbox sign-in; make a copy that signs in with `QA_EMAIL`/`QA_PASSWORD`, set `BASE` and `API=https://property-dealers-project.netlify.app/api`. Expect 25/25 screens. |

## 2. The ten-at-once receipt test (the one that could not be proven in a single-connection test database)
Run `node e2e/qa/retest-live.mjs` (read it first). It signs in through the real login page, creates a QA customer, property and instalment booking, then:
- **R1** sends 10 receipts at the same instant with **one** request id: exactly one receipt must exist, all 10 answers must carry the same receipt id.
- **R2** sends 3 at once with **no** request id: 3 receipts (old clients behave as before).
- **R3** re-sends the R1 id with a different amount: refused (409).
Run R1 **three times** (the script makes a new booking each run) and report the frequency. Any run that creates more than one receipt for one id is an **S1**. Also run `e2e/qa/g2-dbl.mjs`-style double-clicks in the browser on live (Record receipt, click twice in the same instant): one receipt.

## 3. The smoke test, twice in a row
Run the release smoke test (Q) from `docs/PRODUCTION_TEST_PROMPT.md` **two times, back to back**, both in the browser as a person would (sign in → dashboard → add a customer → book a property → set a payment plan → receive a payment → receipt on the customer statement and trial balance → void it → bank reconciliation opens; plus language switch persists, one print page renders, one attachment uploads and downloads). Record both runs separately. "Twice in a row" means both pass without a retry.

Add these new checks to each run (they are the fixes):
- upload a real PDF, then try a text file renamed `.pdf` containing `MZ` and a PDF renamed `.png`: the last two are refused with "not what its name says it is";
- print `/print/receipt/00000000-0000-0000-0000-0000000000ff`: "could not be found" within a second or two;
- import a QA bank statement twice: the second is refused; import one whose closing balance is wrong: refused with the figures, and the "Save it anyway" box then lets it through;
- register the same QA cheque number twice for the same person and bank: refused;
- try to assess a second late fee while one is open: refused.

## 4. The header check
`retest-live.mjs` checks `x-frame-options`, `content-security-policy` (`frame-ancestors 'none'`), `x-content-type-options`, `referrer-policy`, `permissions-policy` on `/login` and on `/api/health`. Also run `curl -sI` yourself and put the raw headers in the report. Then try framing the site from a local HTML page (`<iframe src="https://property-dealers-project.netlify.app/login">`): the browser must refuse to show it. Confirm that nothing broke: all pages load, fonts show, Urdu/Chinese/Japanese still render, sign-in and sign-out still work.

## 5. The phone-width sweep
`API=https://property-dealers-project.netlify.app/api BASE=https://property-dealers-project.netlify.app WIDTHS=320,375,768,1024 CHAIN=1 node e2e/qa/g3-overflow.mjs` (read it first; it signs in with `QA_EMAIL`/`QA_PASSWORD`). It loads about 32 pages at each width and names any element that makes a page scroll sideways. Expected: 0 overflows. Also look at screenshots of the Vouchers, Deals, booking detail and Accounts pages at 375 px and judge them as a person (tables scroll inside their card, nothing is cut off with no way to reach it).

## 6. Spot re-checks of the smaller fixes (live, `QA-` records only)
BUG-007 a body over 1 MB → 413 and broken JSON → 400, never 500; BUG-008 overlapping leave → 409 with the person's name; BUG-009 no table/constraint names in any error body (try 5 bad requests); BUG-010 a journal with the same account both sides is refused at submit; BUG-014/015 (see section 3 and: block `/api/v1/me` with request interception → the "can't open your workspace" screen has Try again and no raw text).

## 7. Report
Update `docs/QA_REPORT.md`: add a section **"Re-test <date>"** with a results table (one row per item above, PASS/FAIL/BLOCKED/NOT-RUN with evidence), re-grade the affected rows of the original matrix, list any **new** bugs (BUG-020…) in the same format, and finish with a plain-language recommendation using section 8 of `docs/PRODUCTION_TEST_PROMPT.md`:
- **GO** only if: no S1 open, no cross-company exposure, books balance at every check, no role/plan bypass found, the ten-at-once test never made a second receipt, and the smoke test passed twice in a row.
- **GO with conditions** if only S2/S3 remain: name each with an owner and a date.
- **NO-GO** otherwise.
State plainly which blockers were proven only on a test database (2, 3, 4) and which on live (1, 5). Do not fix anything, do not commit.
