# PropIQ — production readiness test brief

**How to use.** Open a new Claude Code chat in this repository and paste:

> Read `docs/PRODUCTION_TEST_PROMPT.md` completely, then `CLAUDE.md`, `docs/GO_LIVE.md` and `docs/STATE_MACHINES.md`. Act as the QA lead for PropIQ. Run the test plan in that file against the local sandbox first, then the live site, and write the results to `docs/QA_REPORT.md`. Do not fix anything unless I ask; report. Do not commit.
>
> For the live site, I authorise you to enter data in the seeded ByteCraft organisation. Sign in with email `umairruman33@gmail.com` and the password I am giving you now: `<type the password here, in the chat only>`. Keep the password in an environment variable for the session and never write it into any file, script, screenshot or the report.

(Type the real password into the chat message yourself; this file is committed to the repository, so it must never contain it.)

This system handles customers' money and identity numbers. It is about to go to production, so **the aim is to find what breaks, not to confirm that it works**. Be sceptical, try to misuse every screen, and do not mark a test PASS without evidence you saw.

---

## 1. What you are testing

PropIQ is a multi-company ERP/CRM for Pakistani housing-scheme developers. A website (Next.js) on Netlify talks to a thin API (a Netlify Function at `/api`) that talks to a Supabase Postgres database. All business rules (accounting, status changes, permissions, plan limits, company isolation) are enforced by the database. Read `CLAUDE.md` for the full picture and `docs/STATE_MACHINES.md` for the legal status changes.

Three subscription plans, enforced by the server: **Basic** (3 users), **Professional** (10), **Advanced** (20); extra seats can be added. Eight interface languages (English, Urdu, Pashto, Chinese, French, German, Japanese, Arabic); Urdu, Pashto and Arabic are right-to-left.

Two modes: **demo** (built-in sample data, no sign-in; only when the `NEXT_PUBLIC_*` variables are unset) and **live** (sign-in, real company). Test both, but live matters most.

## 2. Rules of engagement (read twice)

1. **Never put secrets in the report, in any file or in a screenshot**: no passwords, no keys, no connection strings. The owner gives you a sign-in (email and password) **in the chat**; use it only to type into the sign-in page. Never write it into a script file, a log, `docs/QA_REPORT.md` or a commit: read it from an environment variable you set for the session (for example `QA_EMAIL` / `QA_PASSWORD`), and make sure screenshots of the sign-in form do not show the password. `api/.env`, `.env.local` and `api/db/setup.bytecraft.json` are secret files; do not print them.
2. **Destructive and bulk tests happen only in the local sandbox** (section 3A). On the live site the owner has **explicitly authorised testing inside the seeded ByteCraft organisation** (section 3B) and entering real-looking data there. Stay inside ByteCraft; never touch any other company; and never delete, void or edit a record that was not created by your own test run.
3. **Do not run `npm run migrate`, `npm run setup`, or anything against the live database owner login**, and do not change Netlify or Supabase settings. If a test needs that, mark it BLOCKED and say why.
4. **Do not fix code** unless explicitly told to. Your deliverable is evidence and a clear report. (A separate chat fixes.)
5. **Do not commit or push.**
6. **Evidence for every FAIL**: exact steps, expected vs actual, a screenshot path, the browser console error (if any), and the failing network request with status code and response body (with any token removed).
7. **Be honest about coverage.** Tests you did not run are NOT-RUN, not PASS. A flaky result (fails sometimes) is a FAIL with the frequency noted.
8. Test as a real user would: through the browser. Reading the database is allowed only in the sandbox, to verify what the screen claims.

## 3. Environments

### 3A. Local sandbox (full, destructive testing)
- `cd api && npm run sandbox` starts an in-memory database, the API and a sign-in stand-in, seeded with a company called ByteCraft, and prints the environment variables for the website. Start the website (`npm run dev` with those variables) as it instructs.
- On this machine port 54321 may be blocked: set `SANDBOX_AUTH_PORT`, `SANDBOX_API_PORT` and `SANDBOX_WEB_ORIGIN` to free ports (see the notes in `CLAUDE.md` / `api/sandbox`). Stop servers by port in PowerShell; do not kill every `node` process.
- The sandbox is lost when stopped; a fresh sandbox is needed to repeat the existing e2e scripts.
- Existing automated browser tests live in `e2e/` (`run.mjs`, `finance.mjs`, `sales.mjs`, `modules.mjs`, `features.mjs`, `language.mjs`; puppeteer). **Run them first, in that order, on a fresh sandbox** as a baseline (`cd e2e && npm install && npm test`), record the counts (expected 26, 21, 12, 27, 15, 19), then read them to learn the working selectors and tricks (Radix tabs need a real mouse click; downloads are captured through `URL.createObjectURL`). Write your own scripts in a scratch folder (e.g. `e2e/qa/`), reusing their helpers.
- Also run: `npx tsc --noEmit`, `npx eslint app components lib`, `node scripts/check-i18n.mjs`, `cd api && npm run typecheck && npm test`, `npm i --no-save @electric-sql/pglite && node docs/schema/smoke-test.mjs`, `npx next build`. Record results.

### 3B. Live site (the seeded ByteCraft organisation, authorised by the owner)
- URL: `https://property-dealers-project.netlify.app`. Health: `/api/health` and `/api/health/db` must return `{"ok":true}`.
- **The owner has chosen to test directly in the seeded ByteCraft organisation** (Advanced plan, owner role) and to enter data there on purpose. The owner signs in as `umairruman33@gmail.com`; the password is given to you in the chat. Follow rule 1 above about handling it. Ask the owner for the colleague account (`sajidnazir29@gmail.com`) only if a two-user test (A7, F4, P3, B5) needs it; otherwise create a second user through an invite to a test email the owner provides.
- Prefix **every record you create with `QA-`** (names, project names, customer names, voucher narrations, notes) so it can be told apart from anything else. Keep a list of what you created (type, id or number, time) in the report.
- **Accounting records cannot be erased.** Posted receipts and vouchers are append-only: the only correction is a void or reversal, which stays visible in the books. So the ByteCraft trial balance and activity log will permanently contain your test entries. This is accepted by the owner. Do not try to "clean up" by editing the database; if a clean slate is wanted later the owner will rebuild the database.
- Live is a **Premium (Advanced)** company, so Basic/Professional gating can only be fully proven in the sandbox (create one organisation per plan there). Do not change the live company's plan or seat count.
- Do the destructive cases (void, cancel, refund, transfer, reject, suspend a user, remove a role) **only on `QA-` records you created**. Do not suspend or remove the owner's own account or the last Owner.
- Note the real latency: measure it (section 6, P-series).
- Avoid heavy bulk loads (thousands of records) on live: the database is on a free plan and Netlify credits are limited. Do the large-data tests (J4) in the sandbox.

## 4. Test data and accounts

Create these in the sandbox, and the same records (all prefixed `QA-`) in live ByteCraft except where noted:

| Need | Detail |
|---|---|
| Three organisations | Basic, Professional, Advanced (set `organizations.plan`; sandbox DB access allowed) |
| Second company in one organisation | for isolation and company-switch tests |
| Users per role | Owner, Administrator, Sales Agent, Accountant, Viewer, plus a custom role (Professional+), plus one suspended user |
| Customers | one Urdu name (`محمد علی خان`), one with an apostrophe (`O'Neil`), one with HTML (`<b>x</b>`), one with a 200-character name, valid and invalid CNICs (13 digits; `35202-1234567-1`), duplicate CNIC |
| Money | `0.01`, `0.99`, `1,234.50`, `99999999.99`, `100000000`, negative where possible, many decimals (`10.555`), pasted text with commas |
| Land sizes | 5 Marla, 1 Kanal, 10 Marla, fractional (`7.5`), zero, negative; the company's Marla→sq ft setting (272 default) |
| Dates | today, past, far future, 29 Feb, fiscal-year boundary (30 June / 1 July, since the fiscal year is July–June), month-end |
| Text | emoji, very long text, leading/trailing spaces, quotes, `'; drop table users; --`, `<script>alert(1)</script>`, Urdu/Arabic/Chinese/Japanese text |
| Files | PDF 100 KB, JPG, PNG, DOCX, XLSX, CSV, a 3.9 MB file, a 4.1 MB file, an `.exe` renamed `.pdf`, a file with a name containing `..\` and unicode, an empty file |

## 5. How to report

Create `docs/QA_REPORT.md` with:

1. **Summary and go/no-go** (see section 8) in plain language for a business owner.
2. **Environment** (commit hash if available, date, browsers, viewport sizes, sandbox vs live).
3. **Results matrix**: one row per test ID with `PASS | FAIL | BLOCKED | NOT-RUN`, and a short note or the bug ID.
4. **Bug list**, each with: ID (`BUG-001`), severity, area, title, steps to reproduce, expected, actual, evidence (screenshot path + console + network), frequency, suspected cause (code path if you can find it; do not edit).
5. **Observations that are not bugs** (usability issues, confusing text, slow screens).
6. **What was not tested and why.**

**Severity:**
- **S1 Blocker** — money or accounting wrong; data from one company visible to another; a person can do what their role/plan forbids; data loss; cannot sign in or open the workspace; security hole.
- **S2 Major** — a main flow fails or gives a wrong result with a workaround; permanent wrong display of a figure; crashes.
- **S3 Minor** — wrong text, layout break, poor error message, small inconsistencies.
- **S4 Cosmetic** — polish.

## 6. Test plan

Each ID is one test. Cover the listed variations. "Expected" is what must happen; if the observed behaviour differs, it is a FAIL even if it looks plausible. When a rule is not obvious, read `docs/STATE_MACHINES.md` or the API route in `api/src/routes/` to find the intended rule and quote it in the bug.

### A. Platform, sign-in and accounts
| ID | Test | Expected |
|---|---|---|
| A1 | `/api/health`, `/api/health/db` | both `{"ok":true}`; unknown API path returns a clean 404 JSON |
| A2 | Open `/login` signed out; sign up with a new email; sign in; sign out | sign-up works (confirmation per Supabase settings); signed-out visit to `/dashboard` redirects to login; after sign-out, the browser Back button does not show data |
| A3 | Wrong password, unknown email, empty fields, very long input | plain error message, no stack trace, no account hints that reveal whether an email exists beyond Supabase's behaviour |
| A4 | Forgot password → email link → `/reset-password` → new password → sign in | works; the link works once; expired link gives a clear message |
| A5 | Session persistence: reload, new tab, close and reopen browser; sign out in one tab while another is open | stays signed in; the second tab handles the sign-out without a crash |
| A6 | Sign in with a user who belongs to **no** company | clear message, can sign out; no crash |
| A7 | Invite flow: admin invites an email → invitee signs up → joins automatically on first sign-in with the chosen role | appears in Users; invite counted in seats until accepted; resend/cancel invite works |
| A8 | Seat limit: fill all seats (users + pending invites) on each plan; try one more | refused with a clear message; extra seats raise the limit (set `organizations.extra_seats` in the sandbox) |
| A9 | Suspended user signs in | refused for that company with a clear message (note: membership is cached up to ~20 s per server instance; state what you observe) |
| A10 | My account page: change display name; change password; wrong old password | saved and shown to colleagues on records; validation messages |
| A11 | Company switcher with two companies; switch while a form is open | no data from company 1 appears under company 2 (check lists, dashboard, search, dialogs); form is not submitted to the wrong company |
| A12 | Open every route URL directly (deep link), refresh on each | no blank screen or crash; the right page loads; unknown route shows the translated 404 |
| A13 | Intermittent sign-in service error (simulate by blocking the Supabase host in DevTools) | "Cannot reach the sign-in service" style message, retry works, no endless spinner |
| A14 | "We can't open your workspace" screen (simulate `/v1/me` returning 500) | offers Sign out and Retry; no loop |

### B. Plans and permissions
| ID | Test | Expected |
|---|---|---|
| B1 | For each plan, open every sidebar item and every route by URL | pages above the plan show a lock/upgrade card; the menu lists only allowed pages (Basic ≤ 10 items); nothing half-loads |
| B2 | Call API endpoints of a higher tier directly with a lower-plan token (leads, quotations, cheques, service invoices, contracts, contractors, bank reconciliation → Professional; budgets, staff, leave, payroll → Advanced; SV/CN/PIV/DN vouchers → Professional) | `403 plan_upgrade` every time, including by changing the company id header |
| B3 | Each role against each module (view, create, edit, approve, delete where it exists) | buttons the role may not use are hidden/disabled **and** the server refuses if called directly (`not_permitted`); Viewer cannot change anything |
| B4 | Custom role (Professional+): create, edit permissions, assign, remove permission while the user is signed in | takes effect (allow for the ~20 s cache); Basic cannot create custom roles |
| B5 | Maker-checker: voucher creator vs approver; the company "self-approval" setting on and off | with self-approval off, the creator cannot approve their own voucher; with it on, they can |
| B6 | Demo plan switcher (demo only) | not visible in live mode |

### C. Company isolation (highest risk)
| ID | Test | Expected |
|---|---|---|
| C1 | In company A copy the id of a booking/customer/property/voucher/receipt/attachment; open the same id URL while signed into company B | 404/forbidden, never the other company's data |
| C2 | API calls with company B's header but company A's record ids (GET, PATCH, DELETE) | refused or not found; nothing changes in A |
| C3 | Create a record in B that references an id from A (booking → customer of A, voucher line → account of A) | refused by the database |
| C4 | Search (⌘K), dropdown pickers, reports, dashboard, exports, print pages, attachments list in company B | only B's data |
| C5 | A user with membership in A only calls B's endpoints | 403 |
| C6 | Supabase Data API directly: call `https://<project>.supabase.co/rest/v1/<any table>` with the publishable key | no data returned (door is closed) |

### D. Projects, properties, inventory
| ID | Test | Expected |
|---|---|---|
| D1 | Create, edit, list, search, filter a project (with blocks/phases) | saved; validation on required fields; a duplicate name/code handled clearly |
| D2 | Create a property (plot/shop/apartment) with Marla and Kanal sizes | sq ft is computed with the company's Marla setting (272 by default) and shown; change the setting and check new properties; fractional and invalid sizes handled |
| D3 | Property codes (`PRP-…`) are unique per company and auto-numbered without gaps/duplicates when two users create at once | no duplicates |
| D4 | Property status: available → hold → booked → sold; try to block/rent/cancel a property with a live booking | the status follows holds and bookings; illegal changes refused with a plain message |
| D5 | Property detail page: legal/title, ownership chain, liens, valuations, price history, attachments | each section saves and reloads; history is ordered |
| D6 | Plot map (Advanced) | plots show correct status colours; click opens the right property; large maps still usable |
| D7 | Edit price after bookings exist | existing bookings keep their agreed price |

### E. Customers
| ID | Test | Expected |
|---|---|---|
| E1 | Create customer (individual/company), edit, search by name/phone/CNIC | saved; searching works with Urdu text |
| E2 | CNIC: valid, invalid length, letters, duplicate in same company, same CNIC in another company | invalid refused; duplicate detected within the company; allowed across companies; the CNIC is not exposed in logs/URLs |
| E3 | Customer statement (screen + print) | every booking, receipt and refund appears; running balance matches the ledger |
| E4 | Delete/deactivate a customer who has bookings | refused or safely handled; no orphan records |
| E5 | Phone/WhatsApp number formats (`0300-1234567`, `+92 300 1234567`) | accepted and normalised consistently for reminders |

### F. Sales flow (leads → quotation → booking)
| ID | Test | Expected |
|---|---|---|
| F1 | Leads board (Professional): create, drag between stages, edit, filter; drag with network off | order persists after reload; a failed move reverts with a message |
| F2 | Quotation: create, edit, print, accept → becomes a booking | the booking carries customer, property, price, payment plan; quotation can't be accepted twice |
| F3 | Create a booking by double-clicking Save / pressing Enter twice / retrying after a slow response | exactly one booking is created |
| F4 | Two users book the **same property** at the same moment | only one live booking exists; the other gets a clear message |
| F5 | Payment plan: booking amount, installments (monthly/quarterly), rounding (e.g. 1,000,000 over 7 installments) | schedule adds up exactly to the net price (remainder in the last installment); a schedule that doesn't add up cannot be confirmed |
| F6 | Booking status: pending → confirmed → completed; completed needs all installments paid or waived; cancel from each state | rules match `docs/STATE_MACHINES.md`; buttons shown only when allowed; each refusal has a plain message |
| F7 | Reschedule after confirmation; change price/discount after confirmation | allowed only if the schedule still adds up |
| F8 | Cancel a booking with payments → refund by payment voucher; property becomes available | ledger entries correct; customer's money not lost; refund cannot exceed what was paid |
| F9 | Transfer a booking to another customer | history kept; statements of both customers correct |
| F10 | Dealer commission on a booking: calculate, pay | amounts correct, posted once |
| F11 | Booking detail page, attachments, print (booking + payment plan) | all data correct and translated |

### G. Receipts and collections (money in)
| ID | Test | Expected |
|---|---|---|
| G1 | Record a receipt: cash, bank, cheque, split between methods | posts Dr cash/bank, Cr Customer Advances; receipt number sequential; prints |
| G2 | Allocation order | open late charges first, then installments oldest-first; check partial, exact and over-payment; every allocation visible |
| G3 | Receipt amounts: `0.01`, paisa, very large, zero, negative, text | invalid refused; paisa kept exactly; no floating-point drift (sum many receipts and compare to the ledger to the paisa) |
| G4 | Void a receipt | allocations and journal entry reversed together; installment statuses revert; void receipt cannot be edited; second void refused |
| G5 | Double-click / retry on Record receipt | one receipt only |
| G6 | Late-payment charges: set rate and grace days in Company Profile; installments overdue before/after grace | charge = rule × days overdue as defined; none within grace; re-running does not duplicate charges; waiving works with permission |
| G7 | Collections screen: overdue/upcoming lists, filters, totals | totals equal the sum of the rows and agree with the dashboard |
| G8 | WhatsApp reminder: open for a customer in each reminder language; language picker is independent of the interface language | opens `wa.me` with the right text, name, amount, due date; a log entry is recorded; phone formatting correct; Urdu text readable |
| G9 | Receipt for a cancelled/completed booking; for a customer with no schedule (cash booking) | handled per rules, with clear messages |

### H. Accounting (money must always balance)
| ID | Test | Expected |
|---|---|---|
| H1 | Create each voucher type: CPV, CRV, BPV, BRV, JV, CV; Professional: SV, CN, DN, PIV | numbers are per type and sequential; types above the plan refused |
| H2 | Voucher lifecycle draft → pending → approved (or rejected → draft); void | matches `docs/STATE_MACHINES.md`; only approved vouchers post; posted entries cannot be edited |
| H3 | Journal voucher with debits ≠ credits; one line only; zero amounts; negative | refused with a plain message; the books never go out of balance |
| H4 | Same account on both sides; inactive/archived account; account from another company | refused |
| H5 | Chart of accounts: add/edit/deactivate an account; try to delete one that has postings | allowed/refused correctly; the standard 85-account chart is present |
| H6 | Fiscal year July–June: post on 30 June and 1 July; closed or missing period | the right period is used; the fiscal-year label is right; reports by year are right |
| H7 | Trial balance and ledger: total debits = total credits **at every date filter**; drill into an account; party statements | always balanced; the ledger of an account equals the sum of its postings |
| H8 | Bank accounts and cash accounts; bank list | 43 banks listed; spot-check names against the State Bank of Pakistan list |
| H9 | Bank reconciliation (Professional): import a statement (use the format the import dialog describes; also a malformed file, a huge file, duplicates), match, unmatched, finish | matched items marked; differences listed; re-import does not duplicate; totals correct |
| H10 | Post-dated cheques: receive, deposit, clear, bounce, cancel | each state change is allowed only as designed; ledger effect correct; bounced cheque restores the customer's dues |
| H11 | Expenses: create against project/account, approve, attach a bill | posts once; appears in reports and budgets |
| H12 | Budgets (Advanced): project and yearly budgets; control mode none / warn / block; exceed a budget with a voucher; revision with approval | warn shows a warning, block refuses, none allows; actual comes from the ledger; approved lines change only through a revision |
| H13 | Service invoices and sales invoices with tax-free amounts; credit/debit notes | totals and ledger entries correct; printing correct |
| H14 | Contracts (Professional): create, status, attachments, print | saved; permission-checked |
| H15 | Contractors (Professional): agreement, bill, retention held, retention release | bill amounts, retention and payables correct; cannot bill beyond the agreement if that rule exists (read the API route) |
| H16 | **Ledger invariants** after the whole run (sandbox, with database access): the self-check view `v_reconciliation` returns no rows; trial balance equals; every receipt has one journal entry; sum of allocations ≤ receipt amounts; no installment with `paid > amount` | all clean |

### I. People
| ID | Test | Expected |
|---|---|---|
| I1 | Staff (Advanced): create, edit, deactivate, attachments | saved; salary hidden from roles without permission |
| I2 | Leave: request, approve, reject, balance | balances correct; overlapping requests handled |
| I3 | Payroll: run for a month, approve and post, pay, payslip print; run twice for the same month | posts once; totals = sum of payslips; ledger entries correct; duplicate run refused or clearly handled |

### J. Dashboard, reports, exports
| ID | Test | Expected |
|---|---|---|
| J1 | Dashboard figures vs source data: sales, collections, overdue, cash position, charts | **each figure reconciles** with the underlying lists/ledger (compute independently); no zero flash before data loads; empty company shows designed empty states |
| J2 | Reports (trial balance, ledger, statements, lists) with date, project and status filters | filters change results correctly; totals match |
| J3 | CSV export of every list that has the Export button | file opens in Excel with correct columns, UTF-8 (Urdu readable), commas/quotes/newlines escaped, dates and money in a consistent format, exports **only what the user may see** |
| J4 | Large data: seed ~2,000 properties, ~5,000 receipts, ~10,000 journal lines (sandbox) | lists paginate or stay fast; reports finish under the function limits (10 s); no browser freeze |

### K. Documents: printing and attachments
| ID | Test | Expected |
|---|---|---|
| K1 | Print pages for receipt, voucher, service invoice, booking, statement, quotation, contract, payslip (`/print/[kind]/[id]`) in English and Urdu | complete data, correct totals and amount in words, RTL layout in Urdu, company name/logo, Save as PDF output is correct (check page breaks) |
| K2 | Print page for another company's id, a non-existent id, signed-out | refused / 404; no data leak |
| K3 | Attachments: upload each allowed type; 3.9 MB passes; 4.1 MB refused with a clear message; disallowed type; renamed executable; unicode and path-like names; empty file | allowed ones open/download with the right name and type; refused ones leave no trace; image/PDF open inline; stored file equals the uploaded one (compare hash) |
| K4 | Delete an attachment; permission check for each role; attachment of a deleted/other-company record | works only with permission; no cross-company access |

### L. Administration and audit
| ID | Test | Expected |
|---|---|---|
| L1 | Users: list, role change, suspend/reactivate, remove, invite | takes effect; the last Owner cannot be removed or demoted; a user cannot change their own role to escape limits |
| L2 | Roles: standard roles are protected; custom roles editable (Professional+) | system roles cannot be deleted |
| L3 | Company Profile: name, Marla size, late-payment rate/grace, voucher self-approval, default language | each saved and applied (check effect in the relevant flow) |
| L4 | Activity log: create/change/void records, role changes, invites | each action appears once with who/what/when; no secrets/CNIC in the log text |

### M. Languages and right-to-left
| ID | Test | Expected |
|---|---|---|
| M1 | Switch through all 8 languages on every dashboard route (live and demo) | text is translated or knowingly English (list gaps); no raw keys such as `dashboard.title` visible |
| M2 | Urdu, Pashto, Arabic: sidebar on the right, icons mirrored, dialogs/menus/tooltips correct, money/codes/phone numbers/emails remain left-to-right, no scrambled punctuation | correct in light and dark mode |
| M3 | Persistence: choose Urdu → reload → sign in on another browser; set company default; user with no choice gets it; "use company default" option | follows the resolution order in `CLAUDE.md` |
| M4 | German and French (long words), Chinese and Japanese (font) | no overflow/truncation that hides meaning, correct fonts |
| M5 | Printed documents and amount in words in Urdu | correct lakh/crore wording; check several amounts (`100,000`, `1,250,000.50`, `12,00,00,000`) |
| M6 | Browser console | no hydration warnings or errors in any language |

### N. UX, responsiveness, accessibility
| ID | Test | Expected |
|---|---|---|
| N1 | Widths 320, 375, 768, 1024, 1440; light and dark themes | no horizontal page scroll, no clipped dialogs, tables usable, touch targets usable |
| N2 | Every form: required fields, max lengths, invalid formats, pasted text, Enter to submit, Escape to close | messages are plain and translated; no loss of typed data on a validation error |
| N3 | Loading/empty/error states: slow network (DevTools "Slow 3G"), API returning 500/403/404/timeouts | skeletons (not zeros), designed empty states, clear errors with retry; no infinite spinner; no white screen |
| N4 | Browser Back/Forward, refresh mid-flow, two tabs editing the same record | no duplicate submissions; a stale edit gives a clear conflict message (records have a version) |
| N5 | Keyboard only: tab order, focus ring, dialogs trap focus, ⌘/Ctrl+K palette, Escape | usable without a mouse |
| N6 | Toasts, confirm dialogs for destructive actions (void, delete, cancel) | there is always a confirmation and a reason where required |
| N7 | Page titles, favicon, 404 and error pages | translated and branded |

### O. Security
| ID | Test | Expected |
|---|---|---|
| O1 | API calls with no token, malformed token, expired token, token of a deleted user | 401, never data |
| O2 | Tamper with request bodies: extra fields (e.g. `company_id`, `status`, `paid`), wrong types, huge numbers, negative amounts, arrays instead of strings | rejected by validation; no mass-assignment |
| O3 | Injection strings (SQL, HTML, template, path traversal) in **every** text field, search box, filename, URL parameter | stored and shown as plain text, never executed; no SQL errors leak |
| O4 | Response headers and CORS (call the API from another origin) | only the site's origin; all methods the screens use (GET, POST, PUT, PATCH, DELETE, OPTIONS) work |
| O5 | Secrets in the browser bundle and network: search the built JS and responses for service keys, the owner DB URL, the secret Supabase key | only the publishable key is present |
| O6 | Error responses | plain messages, no stack traces, no table/column names, no SQL |
| O7 | Rate/size abuse: very large JSON body, 6 MB+ attachment, 100 rapid requests | refused or handled gracefully; the site stays up |
| O8 | CNIC handling | stored encrypted, shown masked where designed, not in URLs, logs or CSV unless intended and permitted |
| O9 | Open redirects and `?company=` parameter manipulation; clickjacking (frame the site) | no redirect to external sites; cannot enter a company you do not belong to |
| O10 | Password policy and email-enumeration behaviour | follows Supabase settings; documented |

### P. Performance and reliability
| ID | Test | Expected |
|---|---|---|
| P1 | Latency: time 20 common actions on the live site (open a page, save a customer, record a receipt) from the browser's Network panel; note cold start (first request after 15 minutes idle) | report median and worst; flag anything above ~1.5 s warm, ~4 s cold; compare local sandbox vs live |
| P2 | First load size and time (Lighthouse or Network panel), repeat visit | report; flag very large bundles |
| P3 | Concurrency: two browsers record receipts against the same installment at once; two users approve the same voucher; two edits to one record | no double allocation, no double posting, no lost update; a clear message to the loser |
| P4 | Interrupted requests: close the tab / drop the network right after pressing Save | the record exists once or not at all, never a half-saved state; retrying does not duplicate |
| P5 | Netlify function limits: a long report/export (10 s limit), a 6 MB response, cold start | fails gracefully with a message if limits are hit; report the largest dataset that still works |
| P6 | Repeat a full day of use (script ~200 actions) and watch for slowdown, memory growth, console errors | stable |

### Q. Release smoke test (run after every deploy)
Follow `docs/GO_LIVE.md` §4: sign in → dashboard loads → add a customer → book a property → set a payment plan → receive a payment → receipt shows on the customer statement and trial balance → void it → bank reconciliation opens. Plus: language switch persists, one print page renders, one attachment uploads and downloads.

## 7. Known limitations (do not report as bugs; mention only if they block a workflow)
Settings/Billing and Group Overview are not built (hidden from real companies; plans and seats are changed by PropIQ support). No automatic WhatsApp/SMS sending (reminders open WhatsApp). CSV only, no `.xlsx`. No tax screens, attendance or report builder. Receipts are held as Customer Advances; no revenue is booked automatically (accountant to decide). No offline mode. Attachments are limited to 4 MB. The seat/membership check is cached for about 20 seconds per server instance. All non-English translations are AI-written and unreviewed. Demo-mode data is fictional.

## 8. Go / no-go criteria

**NO-GO** if any of these is open: an S1 bug; any cross-company data exposure; any case where the trial balance does not balance or a receipt/voucher posts twice or wrongly; a role or plan restriction that can be bypassed; sign-in or workspace opening that fails more than rarely; data loss on save; secrets exposed in the browser.
**GO with conditions** when all S1 are closed, S2 have owners and dates, and the live smoke test (Q) passes twice in a row.
State your recommendation plainly at the top of `docs/QA_REPORT.md`, with the number of tests by result.

## 9. Practical tips
- Work in this order: baseline automated suites (3A) → sandbox exploratory runs by section → seed large data → live QA company → release smoke test.
- Commands: Windows; use Git Bash or PowerShell. Screenshots: headless Chrome or puppeteer; save under `e2e/shots/qa/`.
- Use a second browser profile for a second user so sessions do not mix.
- When a test needs a database change in the sandbox (plan, extra seats, suspended user), do it through the sandbox's own database connection and note it in the report.
- Re-run any FAIL once to measure frequency; attach the network log of the failing request.
