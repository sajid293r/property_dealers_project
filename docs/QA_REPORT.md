# PropIQ — QA report (production readiness)

Written by the QA lead run on **2026-11-03**, commit `21851f6` (working tree had only untracked QA files added). Nothing was fixed, committed or pushed. No password, key or connection string is written in this report, in any script or in any screenshot.

---

## 1. Summary and recommendation

### **Recommendation: NO-GO for production as it stands.**

> **Update after the fixes (2026-11-04):** all 19 bugs below now carry a `Status` line (18 fixed with regression tests, BUG-019 investigated with options for your decision). The fixes are in the working tree, **not yet deployed**; the NO-GO stands until they are deployed and the QA team has re-run the blocker scenarios and the live smoke test twice (see the hand-off in the chat). The results matrix further down is the original run and has not been re-graded.

In plain words: the everyday sales flow works well and the books balanced at every check (trial balance equal on the live site and in the sandbox, to the paisa, after hundreds of receipts and vouchers). Sign-in, company separation for reading and for almost all writing, plan limits, receipts, voids, refunds, payment plans, all 8 languages and right-to-left layout held up. But the plan's own go/no-go rules are triggered by **one blocker and four serious findings**:

| # | What a business owner should know | Rule triggered |
|---|---|---|
| **BUG-001** (S1) | An Owner/Administrator can press *Delete* on an **approved** voucher. It disappears as "void" but **its entry stays in the books and can never be reversed** (the proper Void button then refuses). The trial balance keeps the amount; the built-in self-check does not notice. | money/accounting wrong |
| **BUG-002** (S2) | A budget of one company can be attached to a **project of another company**. Nothing was visible across companies in what I looked at, but the database accepted a cross-company link. | cross-company reference not refused |
| **BUG-003** (S2) | A **Sales Agent** (who must see only their own bookings) can **record a payment on someone else's booking** they cannot even open. | role restriction bypass |
| **BUG-005** (S2) | `/v1/leads-summary` is not covered by plan gating: a **Basic** company can call it (it only returns lead counts). | plan restriction bypass |
| **BUG-004** (S2) | When the server fails, **every list screen shows "0" and an empty list instead of an error** (and shows 0 while loading). A customer would believe their data is gone. | "no false zeros", clear errors |

Also worth knowing before launch: a second receipt can be created by a very fast double-click (BUG-006); the live site has no clickjacking protection (BUG-016); uploads of near-4 MB files took ~20 s from this network (BUG-019).

**Counts by result** (matrix in section 3, one row per test ID, 119 rows; where a test had several parts, the row is graded by what I actually ran and the note says which parts were not):

| PASS | FAIL | NOT-RUN | BLOCKED |
|---:|---:|---:|---:|
| 70 | 18 | 31 | 0 |

Baseline automated suites (sandbox): static checks and the production build clean; API tests 115/115; SQL smoke test 500/500; browser end-to-end scripts 26 + 21 + 12 + 27 + 15 + 19 = **120/120**.

**Conditions for GO** (from section 8 of the brief): close BUG-001, 002, 003, 005; give owners and dates to the other S2s; then repeat the live smoke test (Q) twice in a row. I ran Q once (partly through the API) so the "twice" condition is **not met**.

---

## 2. Environment

| | |
|---|---|
| Commit | `21851f6` ("Shimmer effect and new reports has been added") + untracked `api/qa/`, `e2e/qa/`, `e2e/shots/qa/`, `docs/PRODUCTION_TEST_PROMPT.md` |
| Date | 2026-11-03 (Windows 11, Node 22.21) |
| Sandbox | `api npm run sandbox` on ports API 4100 / sign-in 54339, website = **production build** (`next build` + `next start`) on 3111, seeded ByteCraft (Advanced). Ports changed because 3000 was held by another process and 54321 is blocked. `next dev` crashed with *Fatal process out of memory: Zone* on first load, so the production build was used. |
| Extra sandbox | A separate in-memory Postgres with the real API (the API test harness) was used for everything that needs several organisations/plans/users (plan gating, isolation, roles, seats, concurrency, scale). Database access was used only in that harness, as the brief allows. |
| Live | `https://property-dealers-project.netlify.app`, seeded ByteCraft (Advanced, owner role), signed in as the owner account the brief names; credentials passed only as process environment variables for each run. |
| Browser | Google Chrome (stable, headless) driven with puppeteer-core. Viewports: sandbox 1440, 1024, 768, 375, 320; live 1440 and 375. Light theme (dark mode not exercised). |
| Evidence | Screenshots `e2e/shots/qa/*.png`; raw run logs `e2e/shots/qa/logs/*.log`; scripts `api/qa/*.ts`, `e2e/qa/*.mjs` (scratch, uncommitted). |

**Housekeeping for the owner:** (1) a sandbox I started earlier is still running (ports 4000/54329) and the new one (3111/4100/54339); I was not allowed to stop processes by port, so please close them. (2) `.next/` now holds a build with the **sandbox** URLs baked in; delete `.next` (or rebuild) before any local run meant for the real site (Netlify builds its own). (3) Do not touch the process on port 3000; it was not mine.

---

## 3. Results matrix

`PASS` = every part I ran behaved; `FAIL` = bug id given; `NOT-RUN` = not done (see section 6). "S" = sandbox/harness, "L" = live.

### A. Platform, sign-in, accounts
| ID | Result | Note |
|---|---|---|
| A1 | PASS | `/api/health` and `/api/health/db` `{"ok":true}` (L, 1.2–2.8 s); unknown path clean 404 JSON; no token → 401. |
| A2 | PASS | L: signed-out `/dashboard/customers` → `/login`; sign out → `/login`; Back button after sign-out shows no data. Sign-up with a new email **NOT-RUN** (would create a real Supabase account). |
| A3 | PASS | L: wrong password, unknown email and 500-char/5000-char inputs all give the same plain "That email or password isn't right."; no stack trace. Empty submit shows no message (stays on page; see obs. 9). |
| A4 | NOT-RUN | Needs the mailbox; `/reset-password` flow not exercised. |
| A5 | PASS | L: reload keeps session; second tab signed in; after sign-out in tab 1, tab 2 sent to `/login` on next navigation, no crash. |
| A6 | PASS | API level: user with no company → `/v1/me` 200 with `companies: []`; business endpoints 403. The on-screen wording was not viewed. |
| A7 | PASS | S: invite of known member refused (409), bad email 400, unknown role 404, role of another organisation 404, revoke works. Invitee sign-up path NOT-RUN. |
| A8 | PASS | S: Basic = 3 seats counting pending invites (3rd invite → 403 `plan_limit`), extra seats +3 raise the limit, revoking frees a seat, duplicate pending invite 409. |
| A9 | NOT-RUN | Suspended-user sign-in not tried. |
| A10 | NOT-RUN | Account page not exercised in the browser (API suite covers display name). |
| A11 | NOT-RUN | Only one company per sign-in in both environments; isolation was tested at API level (section C). |
| A12 | PASS | 36 routes at 5 widths (S) and 2 widths (L): none blank or crashed; unknown routes show the translated "Page not found". |
| A13 | PASS | S: sign-in host blocked → "Cannot reach the sign-in service."; form usable again. |
| A14 | FAIL | BUG-015: `/v1/me` 500 → screen offers **Sign out only, no Retry**; shows raw server text. |

### B. Plans and permissions
| ID | Result | Note |
|---|---|---|
| B1 | NOT-RUN | API refusals proven (B2); menu counts and lock cards per plan in the browser need a Basic/Professional user in the UI. |
| B2 | FAIL | BUG-005 (`/v1/leads-summary`). All other Professional/Advanced paths, bank reconciliation paths and SV/CN/PIV/DN vouchers → 403 `plan_upgrade` on Basic; Professional refused for Advanced paths; swapping the company-id header does not help. |
| B3 | FAIL | BUG-003. Viewer is refused everywhere (9 write calls → 403); Accountant cannot approve, book or receive; Agent cannot cancel/approve and sees only own bookings — **except** recording a receipt. |
| B4 | PASS | S (Professional): custom role created, assigned, grant added → works at once, permission removed → refused at once; role in use cannot be deleted; Basic cannot create roles. |
| B5 | PASS | S: self-approval off → "The person who prepared a voucher cannot approve it"; other approver works; on → works. |
| B6 | NOT-RUN | Demo mode needs a build without the `NEXT_PUBLIC_*` variables. |

### C. Company isolation
| ID | Result | Note |
|---|---|---|
| C1 | PASS | Customer, property, project, detail and statement of company A by id from company B → 404. |
| C2 | PASS | PATCH/POST/DELETE of A's ids with B's header → 404/400/204-noop; A unchanged. (DELETE of an unknown voucher id returns 204; harmless, obs. 12.) |
| C3 | FAIL | BUG-002 (budget → other company's project accepted). 33 other cross-company references on create endpoints (bookings, vouchers, cheques, quotations, invoices, receipts, allocations, reminders, leave, refunds, transfers, attachments, bank statements, properties…) were all refused. |
| C4 | PASS | Lists, search, reports, dashboard, audit, attachments in B contain nothing of A. Exports and print pages not re-tested here (K2). |
| C5 | PASS | User of A on B's endpoints → 403; user with no company → 403. |
| C6 | PASS | L: with the publishable key, `users`, `parties`, `companies`, `journal_entries` and an RPC all return **503 `PGRST002`**, no data. See obs. 14 (door is closed but the Data API answers rather than being disabled). |

### D. Projects, properties, inventory
| ID | Result | Note |
|---|---|---|
| D1 | PASS | L: project created; short name 400; HTML/SQL text stored as plain text. A duplicate name is accepted (new code) — obs. 1. |
| D2 | PASS | L: 5 Marla → 1,361.25 sq ft (272.25/marla), 1 Kanal → 5,445.00, 7.5 Marla → 2,041.88; 0 and negative refused (400). Effect of changing the Marla setting NOT-RUN. |
| D3 | PASS | L: 8 parallel creates → 8 distinct codes, no duplicates (gaps in the order only). |
| D4 | PASS | Status follows holds/bookings (available → reserved on booking, back to available on cancel); `reserved/sold` cannot be typed in. Blocking/renting has no screen or API route, so those illegal moves could not be tried. |
| D5 | NOT-RUN | Property detail sections not exercised (page loads). |
| D6 | NOT-RUN | Plot-map page loads; colours/click-through not checked. |
| D7 | PASS | S: price changed with a reason → property 250,000, existing booking keeps 100,000; price history recorded. |

### E. Customers
| ID | Result | Note |
|---|---|---|
| E1 | PASS | L: Urdu name, apostrophe, `<b>x</b>`, emoji, leading/trailing spaces all round-trip as plain text; Urdu search finds them; created through the UI in ~1 s. Name limit is 160 characters (200 → 400 with a generic message). Searching by CNIC finds nothing (obs. 7). |
| E2 | PASS | L+S: valid CNIC accepted; short, letters, too long, wrong grouping refused; duplicate in the company → 409 (also when typed without dashes); same CNIC in another company allowed; API returns only last 4 digits; audit shows last 4 only. |
| E3 | PASS | L: statement lists receipts and the reversal with running balance; booking price is not posted (design, obs. 8). |
| E4 | NOT-RUN | There is no delete/deactivate route for customers (obs. 6). |
| E5 | PASS | `+92 300 xxxxxxx` and `0300-xxxxxxx` normalise to `+92300xxxxxxx`; the same number typed the other way is caught as a duplicate (obs. 5). |

### F. Sales flow
| ID | Result | Note |
|---|---|---|
| F1 | NOT-RUN | Drag-and-drop board not driven; API stage move 200. |
| F2 | PASS | L: lead → quotation → accept creates the booking; accepting twice returns the same booking (no duplicate). Print loads. |
| F3 | PASS | API: same Idempotency-Key sent twice in parallel → one booking. Booking double-click in the UI NOT-RUN. |
| F4 | PASS | S: 20 simultaneous bookings of one property → exactly 1 (others 409); L: 10 → 1. |
| F5 | PASS | L+S: 1,000,000 with 100,000 down and 7 installments → 100,000.00 + 6 × 128,571.42 + 128,571.48 = exactly 1,000,000.00. |
| F6 | PASS | pending→completed refused; confirm without schedule refused; completing with unpaid installments refused; cancel needs a reason; cancelled→confirmed refused; property becomes available again. |
| F7 | NOT-RUN | Reschedule after confirmation not tried. |
| F8 | PASS | L: refund before cancel 409; refund above received refused with exact figure; valid refund (30,000.50 + 4,000 deduction) accepted; second refund capped at what remains. TB balanced. |
| F9 | PASS | L: transfer to another customer works; to same customer / unknown customer refused. Statements of both customers not compared. |
| F10 | NOT-RUN | Dealer commission not run. |
| F11 | PASS | Booking detail and payment-plan print load with correct data. Layout problem at phone width is BUG-013. |

### G. Receipts and collections
| ID | Result | Note |
|---|---|---|
| G1 | PASS | Cash receipts post and number sequentially (RCT-00001…); cheque clearing creates a receipt. Bank/split tenders not run. |
| G2 | PASS | Partial 50,000.50 → installment partial; +49,999.50 → paid, next one untouched; late charge paid before installments (G6). Overpayment is accepted (obs. 10). |
| G3 | PASS | S: 100 receipts of 0.01 in parallel = exactly 1.00 in receipts, allocations and ledger, 100 distinct numbers. `0.00`, `-5`, `abc`, `1,000`, `10.555` refused. |
| G4 | PASS | Void reverses allocations and entry, installment goes back to partial/0.01 (L) ; second void 409; void without reason 400. |
| G5 | FAIL | BUG-006. |
| G6 | FAIL | BUG-011 (manual duplicate). Rule check passed: 5 %/month, 5 days grace → Rs 4,833.33 for a 50,000 installment 58 days past grace, 2,333.33 for 28 days; the receipt paid the late charge first; waiving works. |
| G7 | NOT-RUN | Totals vs dashboard not reconciled (buckets respond 200). |
| G8 | NOT-RUN | Reminder log entry saved (L 201); WhatsApp text per language not opened. |
| G9 | PASS | Receipt on a cancelled booking → 409 "This booking is cancelled; money cannot be received against it"; cash booking accepts a receipt. |

### H. Accounting
| ID | Result | Note |
|---|---|---|
| H1 | PASS | Numbers per type and sequential (CPV-00001, CPV-00002, JV-…); Basic refuses SV/CN/PIV/DN. Approving SV/CN/DN/PIV not run. |
| H2 | FAIL | BUG-001. Other lifecycle rules held: draft cannot be approved directly, pending/approved cannot be edited, no double approve/void. |
| H3 | PASS | Unbalanced, one-line, zero, both-sides-on-one-line, negative, group account → refused or cannot be submitted. |
| H4 | FAIL | BUG-010 (same account debit and credit accepted and approved). Account of another company refused. Inactive account NOT-RUN. |
| H5 | PASS | Live chart has 90 accounts (85 standard + 5 added by later migrations), 52 postable. Add/edit/deactivate and delete-with-postings NOT-RUN. |
| H6 | PASS | S: vouchers dated 30 June 2027, 1 July 2027 and 29 Feb 2028 approved into three different periods; 30 Feb and 29 Feb 2026 refused. Dates `0001-01-01`/`9999-12-31` accepted (obs. 11). Fiscal-year labels in reports NOT-RUN. |
| H7 | PASS | Debits = credits at 6 date filters in the sandbox and 4 on live, and after every run (live final 721,501.74 = 721,501.74). |
| H8 | PASS | L: 43 banks. Names not compared with the State Bank list. |
| H9 | FAIL | BUG-012. Valid import, 2000-line limit, malformed body behave; identical re-import creates a second statement. |
| H10 | FAIL | BUG-018. Create, deposit, clear (receipt created, installment paid), clear twice refused, clear before deposit refused, bounce after clearing refused (409), deposit then bounce works. |
| H11 | NOT-RUN | Expenses create/approve/attach not run (page loads; expense lists derive from vouchers). |
| H12 | PASS | S: block budget refuses the voucher ("over its approved budget by 4,000"); after changing to none the same voucher is approved; approved budget lines cannot be edited directly (409). `warn` and revisions NOT-RUN. |
| H13 | PASS | L: service invoice 5,000.50, payment 2,000.25 accepted, overpay refused (only 3,000.25 unpaid), void after payment refused with a plain message; prints correctly. Sales invoices/CN/DN NOT-RUN. |
| H14 | NOT-RUN | Contracts not exercised beyond the page and print. |
| H15 | NOT-RUN | Contractors not exercised. |
| H16 | PASS | S (harness after each run): `v_reconciliation` empty, journal debit = credit, no installment overpaid, every posted receipt has a journal entry, 82 informational tenant-FK gaps (see BUG-002). **But** `v_reconciliation` does not detect BUG-001. |

### I. People
| ID | Result | Note |
|---|---|---|
| I1 | NOT-RUN | Employee created in S; salary visibility per role not tested. |
| I2 | FAIL | BUG-008 (overlapping leave → 500). Approve works, reversing a decision refused, `to < from` refused, 400 days refused. |
| I3 | PASS | S: second run for the same month 409; approve and pay each only once; paid run posted 45,000.45 = sum of the lines. Header total shows 0.00 while the run is a draft (obs. 13). Payslip print NOT-RUN. |

### J. Dashboard, reports, exports
| ID | Result | Note |
|---|---|---|
| J1 | NOT-RUN | Dashboard figures not independently recomputed. |
| J2 | NOT-RUN | All 7 report endpoints return 200 on live and trial balance is right; filter-by-filter checks not done. |
| J3 | NOT-RUN | CSV exports not opened. |
| J4 | PASS | S (scaled: 2,000 properties, 600 posted vouchers + earlier data): property list 20 ms, search 12 ms, dashboard 21–60 ms, trial balance 7–10 ms, an account ledger of 600 lines 75 ms / 169 KB (no paging). The full 5,000-receipt/10,000-line load was **not** done. |

### K. Documents
| ID | Result | Note |
|---|---|---|
| K1 | PASS | Receipt, voucher, service invoice, booking plan, statement, quotation, contract print pages open (L and S). Urdu: RTL, "روپے بارہ لاکھ پچاس ہزار اور پچاس پیسے صرف" etc. Payslip and Save-as-PDF page breaks NOT-RUN. |
| K2 | FAIL | BUG-014 (no data leak, but an unknown/other-company id shows "Preparing the document…" forever). |
| K3 | FAIL | BUG-017 (renamed executable accepted). PNG round trip is byte-identical (SHA-256); 3.9 MB accepted; 4.1 MB → 413 clear message; `.exe`/`text/html` types refused 415; empty file 400; path-like name stored as `.._.._QA-évil_.._name ملف.pdf`. Slow: BUG-019. |
| K4 | NOT-RUN | Deleting attachments and per-role checks not run. |

### L. Administration and audit
| ID | Result | Note |
|---|---|---|
| L1 | PASS | Self role/status change 409; viewer cannot change an owner 403; an Administrator cannot suspend or demote the **last Owner** (409 `last_owner`). |
| L2 | PASS | System roles cannot be deleted or edited (409 `system_role`); a role of another organisation → 404. |
| L3 | PASS | Self-approval switch (B5) and late-fee rate/grace (G6) take effect; read-back OK. Marla setting/name/default language not re-tested (language suite passes). |
| L4 | PASS | Activity log lists changes with who/what, last-4 only for CNIC. Role changes/invites in the log not looked at. |

### M. Languages and right-to-left
| ID | Result | Note |
|---|---|---|
| M1 | PASS | S: all 8 languages × 35 routes (saved per-person language): no raw keys, no blank page, no crash. Live and gaps of untranslated English text not catalogued. |
| M2 | PASS | Urdu, Pashto, Arabic report `dir=rtl`, sidebar on the right, money kept left-to-right (screenshot `lur-1440-_dashboard.png`). Dialog/tooltips/dark mode NOT-RUN. |
| M3 | PASS | `language.mjs` 19/19; saved choice applied on every reload in the sweeps. Second-browser check NOT-RUN. |
| M4 | NOT-RUN | German/French/Chinese/Japanese looked for overflow at 1440 only (none); phone widths and font look not reviewed. |
| M5 | PASS | Urdu words correct for 100,000, 1,250,000.50, 120,000,000 and 7.05 (sandbox receipts printed in Urdu). |
| M6 | PASS | No console errors or hydration warnings in 8 languages × 35 routes (sandbox) and 36 routes live in English. |

### N. UX, responsiveness, accessibility
| ID | Result | Note |
|---|---|---|
| N1 | FAIL | BUG-013 (horizontal overflow). |
| N2 | NOT-RUN | Form-by-form checks not done. Enter in the receipt amount box does not submit (obs. 9). |
| N3 | FAIL | BUG-004. |
| N4 | NOT-RUN | Two-tab conflict not tried. |
| N5 | PASS | Ctrl+K opens the palette, Escape closes it. Tab order/focus trapping NOT-RUN. |
| N6 | NOT-RUN | Reason dialogs exist (API refuses void/cancel without a reason) but each confirm dialog was not walked through. |
| N7 | PASS | Page titles per language ("Projekte · PropIQ", "پروجیکٹس · PropIQ"); 404 translated. Favicon not checked. |

### O. Security
| ID | Result | Note |
|---|---|---|
| O1 | PASS | No token, garbage, empty bearer, Basic scheme, wrong signature, expired, wrong audience, `alg: none` → 401; valid token of a user not in the database → no company access. |
| O2 | PASS | Extra fields (`company_id`, `id`, `status`, `paid`, `created_by`, `version`) ignored; wrong types, negative, `1e9`, 3 decimals, object amounts refused. |
| O3 | PASS | 10 injection/Unicode strings in name/notes/city round-trip as text; search with SQL fragments and ids with SQL → 200/400/404, never 500; tables intact. |
| O4 | PASS | L: no `Access-Control-Allow-Origin` for a foreign origin; site and API share one origin so no CORS needed. |
| O5 | PASS | L: 17 JS chunks scanned: no secret key, database URL, service role, CNIC keys, private keys. |
| O6 | FAIL | BUG-009, BUG-007. |
| O7 | FAIL | BUG-007 (1–6 MB JSON → 500). 100 rapid requests: all 200, site stayed up. 6 MB attachment limit applies correctly (413). |
| O8 | PASS | API/audit expose only `cnicLast4`; full number never returned. Encryption at rest not inspected in the database. |
| O9 | FAIL | BUG-016 (no frame protection). `?company=`/header with unknown or malformed id → 403/400; cannot enter a company you do not belong to. |
| O10 | NOT-RUN | Password policy/email enumeration (needs sign-up). |

### P. Performance and reliability
| ID | Result | Note |
|---|---|---|
| P1 | PASS | Measured (section 5). Flags over ~1.5 s: create property 2.0 s, create booking 1.3–2.0 s, transfer 2.1 s, `/v1/me` ~1 s; attachment upload (BUG-019). |
| P2 | NOT-RUN | No Lighthouse/bundle size run. |
| P3 | PASS | S: 10 parallel receipts on one 5,000 installment → paid exactly 5,000 and no over-allocation (allocations = receipts 10,000, rest held as advance); 5 parallel approvals → ledger moved once (333.00); 3 parallel voids → exactly one succeeds. |
| P4 | NOT-RUN | Interrupted requests not tried. |
| P5 | NOT-RUN | Function limits not probed. |
| P6 | NOT-RUN | Long soak not run. |

### Q. Release smoke test
| ID | Result | Note |
|---|---|---|
| Q | PASS (once) | L: sign in → dashboard → add customer (UI) → book → plan → receipt → statement and trial balance → void → reconciliation page opens (sweep) → one print page. Language switch persistence and attachment upload/download verified (S and L). Mostly driven through the API after sign-in, so a full manual UI pass is still advised. Not run twice in a row. |

---

## 4. Bug list

Severity per the brief. All reproduce 100 % of the time unless a frequency is given.

### BUG-001 — S1 — Accounting — Deleting an approved voucher marks it void but leaves its ledger entry
- **Steps (S):** Owner creates a JV (777.00 Dr/Cr), submits, approves. `DELETE /v1/vouchers/{id}` → 204. Then `POST /v1/vouchers/{id}/void` with a reason.
- **Expected:** a posted voucher can only leave through *Void*, which reverses its entry (docs/STATE_MACHINES.md: `approved → void: accounts.approve (reverses its entry)`).
- **Actual:** delete returns 204; voucher shows `void`; trial balance debit is still 777 (before delete 777, after 777); no reversal entry exists; the proper void now fails 409 "Only an approved voucher can be voided (this one is void)"; `v_reconciliation` returns no rows, so the self-check does not catch it. The amount can never be cancelled.
- **Who:** a role with both `accounts.edit` and `accounts.approve` (Owner, Administrator). An Accountant is refused (403).
- **Evidence:** `e2e/shots/qa/logs/qa2.log` (H5), `qa6` output quoted in this report; not run on live to avoid a permanent wrong posting (same code).
- **Suspected cause:** `api/src/routes/vouchers.ts:243-249` — the "throw away a draft" route runs `update vouchers set status = 'void'` for any status; the database permits `approved → void` for `accounts.approve` without going through `app.void_voucher` (`api/db/migrations/0004*.sql:209`), which is what reverses the entry.
- **Status:** **Fixed (group 1).** Migration `0017`: trigger `vouchers_void_guard` refuses `approved → void` unless the entry is already reversed, `vouchers_delete_guard` refuses deleting anything but a draft/rejected voucher; `DELETE /v1/vouchers/:id` now answers 409 for anything else (404 for an unknown id); `v_reconciliation` gained `void_voucher_not_reversed` and `approved_voucher_without_entry`. Tests: `api/test/regression.test.ts` (BUG-001, 5 tests incl. the old scenario and the self-check) and 3 checks in `docs/schema/smoke-test.mjs`; QA script `api/qa/qa2.ts` H5 now passes.

### BUG-002 — S2 — Isolation — A budget can point at another company's project
- **Steps (S):** Alice (company A) `POST /v1/budgets {kind:"project", projectId:<company B's project>}` → 201.
- **Expected:** refused by the database (C3).
- **Actual:** created; database row shows budget company ≠ project company. The other company's name is not shown (`projectName: null`) and company B cannot see the budget, so I observed no data leak, but the integrity rule is broken.
- **Suspected cause:** `budgets.project_id → projects` is one of 82 single-column references listed by `v_tenant_fk_gaps` that still lack the company-checked twin; most are phase-2 tables, but `budgets`/`budget_lines` are live. 33 other create endpoints were safe. Recommend a sweep of the gaps list for every table that has an API route.
- **Status:** **Fixed (group 1).** Migration `0017` loops over `v_tenant_fk_gaps` and adds the company-checked twin for **all 82** (keeping each old key's delete rule); the view is now empty and the smoke test asserts that. None had to be left: the phase-2 tables (tax, listings, specs, consolidation…) have no API yet but get the protection now so they cannot be forgotten later. API-reachable links tested: budget → project, budget line → account, property ownership/encumbrance → party, account heading → parent, booking → other company's customer/property. Tests: `regression.test.ts` (BUG-002, 5 tests).

### BUG-003 — S2 — Permissions — Sales Agent can record a payment on a booking owned by someone else
- **Steps (S):** Dave (Sales Agent, scope *own*) `POST /v1/receipts {bookingId:<Alice's booking>, amount:"1", method:"cash"}` → **201**.
- **Expected:** refused: he cannot see that booking (GET → 404), cannot schedule, confirm, transfer, remind or penalise it (all refused).
- **Actual:** the receipt is posted to the books against a booking he cannot open.
- **Suspected cause:** `api/src/routes/receipts.ts` POST `/v1/receipts` does not check `app.user_in_scope('deals', …)` (other routes such as penalties do). Applies to the standard *Sales Agent* role (deals create, scope own).
- **Status:** **Fixed (group 1).** New `api/src/scope.ts` with one rule (`app.user_in_scope('deals', …)`) now applied to receipts (list, detail, create, void, installment allocations, and "by customer" when the customer has a colleague's open dues), payment schedule, refund void, commission list/void, late-fee waive, reminders (list), cheques (list, create, actions), attachments on bookings/cheques/quotations/leads (list, upload, download, delete) and releasing holds; status, transfer, refund, commission, penalty and reminder-create already had it. Zero amounts are now refused before any lookup ("Enter an amount greater than zero"). Tests: `regression.test.ts` (BUG-003, 7 tests: an agent with every permission but scope *own*, against a colleague's booking, plus positive controls and the owner).

### BUG-004 — S2 — UX — List screens hide server errors as "0" and empty lists; zeros shown while loading
- **Steps (S):** Return 500 (or 403) for the list call behind a page (Properties, Projects, Customers, Deals, Vouchers, Accounts, Expenses, Users, Dashboard) and open the page; wait 25 s.
- **Expected:** a clear error with retry; skeletons, not zeros, while loading ("No false zeros").
- **Actual:** KPI tiles show 0 / Rs 0 and a normal empty state ("No properties match…"); no message, no retry, no toast. Dashboard shows nothing at all. At 3 s (still loading) the tiles already read 0. Screenshots `n3-500-25s.png`, `n3-properties-500.png`. React Query retries twice (~12 s) then gives up silently.
- **Impact:** during any outage or role problem a customer would believe records vanished.
- **Status:** **Fixed (group 2).** One shared `LivePageGuard` (`components/live/page-guard.tsx`, mounted in the dashboard layout for real companies) replaces the per-screen behaviour for all live screens: skeleton while the first load runs (the tiles can no longer read 0), a clear error with **Try again** (plus the server's plain sentence and a short reference) when a request fails, a slim notice when a later request fails; 404s stay with the screen. The query client no longer retries 4xx answers and attempts requests even when the network is down (so offline fails with a message instead of waiting). New i18n keys `common.loadFailed.*` in all 8 languages. Test: `e2e/qa/g2-states.mjs` fails each screen's main request (500), expects the panel, restores the API, presses Try again, then delays it and expects the skeleton with no zeros: **25/25 screens** (dashboard, projects, properties, plot map, customers, deals, leads, quotations, service invoices, cheques, contracts, contractors, accounts, vouchers, expenses, budgets, reports, staff, payroll, leave, users, roles, company profile, activity log, bank reconciliation); a 403 shows "Your role does not allow this (inventory.view)."

### BUG-005 — S2 — Plans — `/v1/leads-summary` is not plan-gated
- **Steps:** Basic company, `GET /v1/leads-summary` → 200 `{"byStage":[],"followupsDue":0}` while `GET /v1/leads` → 403.
- **Cause:** `api/src/plans.ts` `FEATURES[0].paths = /^\/v1\/leads(\/|$)/` does not match `leads-summary`. Parity test checks only the list, not the routes.
- **Status:** **Fixed (group 1).** `plans.ts`: leads pattern now covers `/v1/leads-summary`; budgets pattern covers `/v1/budget-check` and `/v1/budget-revisions` (revision approval was also open to Basic/Professional; budget-check is not used by any screen). New `api/test/plans-routes.test.ts` registers every route (`app.routeTable`), requires any route that *looks like* a gated module to be gated with the right tier, requires every other route to belong to a known Basic family (so a new route forces a decision), and calls every gated route as a Basic and a Professional company expecting 403 `plan_upgrade` (verified to fail against the old pattern).

### BUG-006 — S2 — Receipts — No server-side duplicate protection; a fast double-click created two receipts
- **Steps (S, browser):** open a booking, Receive payment, amount 1000, dispatch two click events on *Save receipt* in the same tick → **2 receipts**. A real mouse triple-click gave 1; pressing Enter twice gave 0 (Enter does not submit). Over the API, 5 identical requests with the same `Idempotency-Key` created 5 receipts.
- **Frequency:** 1 of 3 click patterns; ordinary human double-click is probably protected by the disabled button.
- **Cause:** only `POST /v1/bookings` honours `Idempotency-Key`; `lib/api/sales.ts:107` sends none for receipts. Each can be voided, so this is recoverable but audit-visible.
- **Status:** **Fixed (group 2).** Migration `0018` (`idempotency_keys`, `app.claim_idempotency`, `app.finish_idempotency`): the first request with an `Idempotency-Key` does the work and records which record it made in the same transaction; a repeat returns that record (header `idempotent-replayed: true`); the same id with different details, or for another kind of request, is refused; a failed request leaves nothing behind; ids older than 14 days are swept. Applied to receipts, vouchers, refunds, payroll runs, late-fee assessments, cheques and service-invoice payments (bookings keep their own existing key). Front end: `useRequestId()` sends one id per form and renews it after a save; `FormDialog` and the voucher form ignore a second click made before React re-renders. Tests: `api/test/regression.test.ts` (BUG-006, 11 tests: 20 simultaneous receipts with one id make one receipt and one ledger entry, replay, no-id behaviour unchanged, different details refused, failed attempt frees the id, bad id length, vouchers, refunds, late fees, cheques, payroll, invoice payments), 8 checks in `docs/schema/smoke-test.mjs`, and `e2e/qa/g2-dbl.mjs` through the real UI (same-instant double click: **1 receipt, was 2**, three runs). Note: the in-memory test database serves one connection at a time, so the "simultaneous" API tests are serialised; the protection itself is a Postgres unique-key insert that waits for the first transaction, which is standard behaviour but was not exercised under true parallel load.

### BUG-007 — S3 — API — Oversized or malformed input gives 500 "Something went wrong"
- JSON body above 1 MB (L and S) → 500 instead of 413; malformed JSON with a JSON content type (S) → 500; an amount of 20 digits (L and S) → 500 (numeric overflow).
- **Cause:** `api/src/errors.ts` `toProblem` has no mapping for Fastify's body-too-large/parse errors or Postgres `22003`.
- **Status:** **Fixed (group 3).** `toProblem` maps Fastify's own 4xx (body over 1 MB → 413 `payload_too_large`, unreadable JSON → 400, wrong content type → 415) and Postgres `22003`/`22001`; amounts are limited to 16 digits + 2 decimals at validation (`api/src/http.ts`), so a 20-digit amount is a 400. Tests: `api/test/regression.test.ts` (BUG-007/009: 1.2 MB body, broken JSON, 20-digit and maximum-size amount, `toProblem` unit checks). Not the same as the Netlify 6 MB platform limit, which Netlify answers itself.

### BUG-008 — S3 — Leave — Overlapping leave request returns 500
- Employee with leave 10–12 Nov, second request 11–13 Nov → 500 "Something went wrong on our side." (the overlap is stopped by the database but the error is not translated; probably exclusion violation `23P01`). Expected a plain "dates overlap" message.
- **Status:** **Fixed (group 3).** The database already refused the overlap with its own sentence (error class `23P01`) which the API did not map; it now answers 409 `overlap` with "<name> already has leave on some of these days". Test: `regression.test.ts` (BUG-008).

### BUG-009 — S3 — API — Internal constraint names in error details; raw message for a zero-amount bank line
- Examples: `"details":{"constraint":"voucher_lines_account_id_fkey"}`, `"constraint":"bank_statement_lines_check"` with the generic "That value is not allowed." for a statement line with neither deposit nor withdrawal. Leaks schema names (O6) and gives users no help.
- **Cause:** `toProblem` returns `details.constraint` for `23503/23505/23514`.
- **Status:** **Fixed (group 3).** `details.constraint` is removed from every error (`23503`, `23505`, `23514`); known check rules get a sentence (`CHECK_MESSAGES`, e.g. a statement line with neither deposit nor withdrawal), the API itself now refuses that case first with the same sentence. Tests: `regression.test.ts` (BUG-007/009: no "constraint", `_fkey`, `_check` or table name in any error body).

### BUG-010 — S3 — Vouchers — Same account debited and credited in one journal is accepted and approved
- JV with account X Dr 10 and X Cr 10 → created, submitted, approved (no effect on balances, but H4 expects refusal).
- **Status:** **Fixed (group 3).** Migration `0019`, trigger `vouchers_sides_guard`: submitting a voucher that debits and credits the same account **with the same party, project and cost centre** is refused, naming the account. A different project/party/cost centre on one side is a real journal and is allowed (decision: refusing every same-account journal would block moving amounts between projects). Test: `regression.test.ts` (BUG-010).

### BUG-011 — S3 — Late fees — Assessing a late fee twice for the same installment creates two charges
- `POST /v1/installments/{id}/penalty` twice → two open penalties of 500.00 (brief G6: re-running must not duplicate).
- **Status:** **Fixed (group 3).** Migration `0019`, trigger `penalty_charges_duplicate_guard`: a second late fee is refused while one is open or part-paid (message names the open amount), and a fee that was paid today is not charged again today; after a waiver or later payment a new one is accepted. Tests: `regression.test.ts` (BUG-011, 2 tests including paying through a receipt).

### BUG-012 — S3 — Bank reconciliation — Identical statement imported twice creates two statements; wrong closing balance accepted
- Same period/lines posted twice → both 201 (H9: "re-import does not duplicate"). A statement whose lines do not add up to the closing balance is accepted (`linesAddUp:false` is only returned).
- **Status:** **Fixed (group 3).** The API fingerprints each statement (account, period, balances, lines in date order) and migration `0019` makes it unique per bank account (`bank_statements.content_hash`): re-importing the same statement, even with lines in another order, answers 409 "already imported". Lines that do not lead from the opening to the closing balance are now refused with the figures (`statement_mismatch`) unless the person ticks "Save it anyway" (`allowMismatch`; new checkbox in the import dialog, `stmt.allowMismatch` in 8 languages), because a bank's own figures can legitimately differ. Lines with neither or both amounts are refused with a sentence. Tests: `regression.test.ts` (BUG-012, 3 tests).

### BUG-013 — S3 — Layout — Horizontal page overflow and clipped tables on narrow screens
- Sandbox: **Vouchers** overflows by 86 px at 1024, 334 at 768, 463 at 375, 518 at 320; **Sales Invoices** 100 / 348 / 477 / 532 px; **Booking detail** 112 / 241 / 296 px at 768 / 375 / 320; **Deals** 49 px and **Accounts** 2 px at 320. Live: Vouchers and Sales Invoices at 375 (461 and 477 px). At 1024 the Vouchers table is cut inside its card so the Amount and Status columns are unreachable (`sbx-1024-_dashboard_vouchers.png`, `sbx-375-_dashboard_deals_…png`).
- **Status:** **Fixed (group 3).** Two causes. (1) A hidden screen-reader label inside a scrolling table was positioned outside the clipped area and widened the whole page: scroll containers are now positioned (`app/globals.css`, `[class~="overflow-x-auto"]`). (2) The booking and expense pages used a one-column grid that sized itself to its widest table: `grid-cols-1` (`booking-detail.tsx`, `expenses-live.tsx`); the Deals tab row now wraps. Test: `e2e/qa/g3-overflow.mjs` loads 32 pages at 320, 375, 768 and 1024 px and names any element that sticks out: **0 overflows of 128** after the fixes (before: 23).

### BUG-014 — S3 — Print pages — Unknown or other-company id never shows "not found"
- `/print/receipt/<unknown uuid or garbage>` stays on "Preparing the document…" indefinitely (no leak, but no answer). Unknown kind correctly shows "Unknown document".
- **Status:** **Fixed (group 3).** Cause: the print screens waited out three retries (about 7 s) before saying "not found". 4xx answers are no longer retried (group 2), and the print screens now tell "not found / not yours / not a valid id" (plain message at once) from "the server could not be reached" (message with Try again). No data was ever exposed. Verified in the browser (`e2e/qa/g3-ui.mjs`).

### BUG-015 — S3 — Workspace error screen — no Retry, raw server message
- `/v1/me` → 500 shows "We can't open your workspace" + the server's text + **Sign out** only (`a14-workspace-error.png`). Brief expects Sign out **and** Retry; after the API recovers the user must reload by hand.
- **Status:** **Fixed (group 3).** The workspace error screen no longer shows the server's own words: it says (translated) either that the person has not been added to a company, or that the account could not be loaded and nothing is lost, with **Try again** (shows the opening screen while it retries) and Sign out. `useCompany().problem` is now a code (`noCompany` / `failed`), `retryAccount()` added. New keys `shell.splash.noCompany` / `shell.splash.failed` in 8 languages. Verified in the browser (`e2e/qa/g3-ui.mjs`).

### BUG-016 — S3 — Live site — no clickjacking or browser hardening headers
- `GET /login` and `/api/*` on live: no `X-Frame-Options`, no `Content-Security-Policy` (so no `frame-ancestors`), no `Referrer-Policy`, no `Permissions-Policy`. HSTS and `nosniff` are present. The site can be framed by any page.
- **Status:** **Fixed (group 3), to be confirmed after the deploy.** `netlify.toml` now sets, for every path, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that switches camera, microphone, location, payment and USB off. The CSP has no script/style rules on purpose (they could break Next.js, Supabase or the font stylesheets; a full CSP is a separate change). Netlify applies the file only on its own servers, so `api/test/security-headers.test.ts` checks the file and the QA team must re-check `curl -sI` on the live site after the deploy.

### BUG-017 — S3 — Attachments — file type is trusted from the browser
- A file starting `MZ…` (executable bytes) uploaded as `QA-virus.pdf` with `application/pdf` → 201, later served as `application/pdf`. Files declared as `.exe`/`text/html` are refused, so only a renamed file passes.
- **Cause:** `api/src/routes/attachments.ts` checks the client-supplied `mime` only.
- **Status:** **Fixed (group 3).** Uploads are accepted only when the file's first bytes match the type it claims (`sniffKind`: PDF, JPEG, PNG, WebP, HEIC, zip packages for docx/xlsx, old Office files, plain text/CSV without control characters; a CSV announced as Excel is accepted). The check runs after the access checks, so a person without access learns nothing from it. Tests: `regression.test.ts` (BUG-017, 3 tests: every real type accepted; program-as-PDF, HTML-as-PDF, photo-as-PDF, PDF-as-PNG, binary-as-text, PDF-as-docx refused; nothing refused is stored); existing attachment tests now upload real PDF bytes and compare the download byte for byte.

### BUG-018 — S3 — Cheques — Duplicate cheque number accepted
- Cheque `QA-001` (HBL) created twice (same bank) → both 201.
- **Status:** **Fixed (group 3).** Migration `0019`: a unique index on company + direction + person + bank (case and spaces ignored) + cheque number, except cancelled cheques; the message says it is already on the register. The same number for another person or another bank is allowed (cheque numbers repeat across accounts). Test: `regression.test.ts` (BUG-018). If the live register already holds such a duplicate the migration will stop with an error and change nothing; there should be none (the QA cheques were created only in test databases).

### BUG-019 — S3 — Performance — Large attachment upload very slow on live
- 3.9 MB PDF: 20.0 s; 4.1 MB PDF: **18.5 s before** the 413 refusal; 1 KB PNG: 1.0 s. From this network only; re-measure from Pakistan. The size check happens after the whole body is received (and a base64 body is a third bigger), so a user who picks a too-big file waits ~18 s for an error. Consider a client-side size check.

---

## 5. Observations that are not bugs

1. A project with the same name is accepted (gets a new code).
2. Customer name limit is 160 characters; the error for 161+ is the generic "Some of the information sent is missing or not valid".
3. Money: amounts above 99,999,999.99 are accepted by vouchers up to NUMERIC(18,2) limits; `100000000` works.
4. Marla default on the live company is 272.25 sq ft (the brief says 272).
5. Two customers cannot share a phone number (409 "already has this phone number"); families/offices often share one — consider a warning instead.
6. There is no way to delete or deactivate a customer, and no route to block/rent a property (E4, D4 could not be exercised).
7. Search by CNIC returns nothing (only name/phone/code).
8. The customer statement shows receipts and reversals but not the booking price (nothing is posted until revenue recognition is decided); the closing balance is therefore a credit equal to money held.
9. Empty sign-in submit shows no message; Enter in the receipt amount field does not submit the dialog.
10. A receipt of Rs 99,999,999.99 on a Rs 1,000,000 booking is accepted without a warning (held as advance).
11. Voucher dates `0001-01-01` and `9999-12-31` are accepted.
12. `DELETE /v1/vouchers/{unknown id}` returns 204.
13. A draft payroll run's header total shows 0.00 until approved (lines show amounts).
14. Supabase REST answers `503 PGRST002` for every table instead of being disabled (GO_LIVE says turn the Data API off). No data returned either way.
15. Cash and bank balances can go negative without warning (sandbox dashboard showed cash −77,000 and bank −1.25 M after a payment voucher with no opening balance).
16. The live account ledger endpoint is not paged (169 KB for 600 lines).
17. Netlify "Powered by Netlify" badge visible bottom right on live.
18. Documentation: `CLAUDE.md` says 114 API tests; there are 115.
19. Urdu printed receipts keep "Cash in Hand" (account name) in English — known and documented.
20. `next dev` crashed with *Fatal process out of memory: Zone* on this machine at first request.

**Latency (live, measured from this machine through Netlify, 123 + 109 + 50 API calls):** median 384–402 ms, 90th percentile 901–937 ms, slowest 4.75 s (first customer create after idle, a cold start) and 20 s (attachment upload, BUG-019). Slowest regular calls: create property 2.0 s, create booking 1.3–2.0 s, transfer 2.1 s, `GET /v1/me` ~1 s, list banks 0.95 s. Full page navigation (document load to network idle) on live at 1440 px: 3–7.5 s per route; sign-in to rendered dashboard 3–5 s; first load of `/login` 6.8 s (cold). Sandbox for comparison: routes ~2 s, API calls 7–75 ms.

---

## 6. What was not tested, and why

- **Needs a mailbox or a new Supabase account:** A4 (password reset), sign-up and invitee acceptance (A2, A7), password policy (O10). Creating accounts on the production auth service was not part of the authorisation.
- **Needs other users on live:** A9, A10, A11 two-company switching, two-browser concurrency on live (done in the sandbox instead). Live has one company and one owner account.
- **Needs plan switching in the browser:** B1 (menus and lock cards for Basic/Professional) and B6 (demo plan switcher). Server enforcement was tested fully.
- **Not run for lack of time:** F1 drag-and-drop, F7, F10, G7, G8 (WhatsApp text), H11, H14, H15, I1, J1–J3 (reconciling dashboard figures, filters, CSV), K4, M4, N2, N4, N6, P2, P4–P6, dark mode, keyboard focus order, payslip print, Save-as-PDF page breaks, the full 5,000-receipt / 10,000-line load (J4 was scaled down), `warn` budget mode and revisions, SV/CN/DN/PIV approval, sales invoices.
- **Deliberately not done on live:** the delete-approved-voucher scenario (BUG-001) because it would leave a permanent wrong posting; bulk loads; anything outside ByteCraft; changing plan or seats; `migrate`/`setup`; Supabase/Netlify settings.
- **Not possible:** blocking/renting properties and deleting customers have no screen or API route.
- **Status:** **Investigated; not a defect in our code, one safeguard already existed, options below.** Measured locally (`e2e/qa/g3-upload.mjs`): a 3.9 MB file (5.2 MB as base64) uploads in **0.38 s** and downloads in 0.16 s; the 4.1 MB refusal takes 0.12 s. On the live site, an unauthenticated 0.5 MB request that is refused at the body limit took 9.5 s and a 5.2 MB one 22 s: the time is the upload path from this machine to Netlify (US East), before any of our code runs, so base64 and the database round trips are not the cause. The browser already refuses a file over 4 MB before sending it (`attachments.tsx`), so a person never waits for that refusal; the 18 s in the report came from the API test script. **Options and cost, for your decision:** (a) send the file as raw bytes instead of base64: about 25 % less to upload (a 3.9 MB file sends 3.9 MB instead of 5.2 MB), about half a day (new route + client change + tests); (b) shrink photos in the browser before upload: a 4 MB phone photo usually becomes under 1 MB, about half a day; (c) upload straight to Supabase Storage with a signed link, bypassing the Netlify function and its 6 MB limit, allows larger files, about two days and moves files out of the database (a data-protection and backup decision); (d) move the function closer to the users (a paid Netlify region or a US-East database, see GO_LIVE section 3). Recommended: (b) first, it helps every connection. Re-measure from a Pakistani office connection before spending on any of them.

### Records I created on live ByteCraft (all prefixed `QA-`)
Created between about 01:25 and 02:30 UTC on 2026-11-03 through the API and one UI customer form; accounting entries cannot be removed, only voided.
- Projects: PRJ-00003 `QA-Project Alpha`, PRJ-00004 (duplicate name), PRJ-00005 (name with script/SQL text).
- Properties: about 22 (`PRP-00003` … `PRP-00024`, titles starting `QA-`, incl. `QA-Parallel 0-7`, `QA-Plan plot`, `QA-Race plot`, `QA-Idem plot`, `QA-Refund plot`, `QA-Transfer plot`, `QA-Quote plot`).
- Customers: about 20 (Urdu name, `QA-O'Neil`, `QA-<b>x</b>`, emoji, spaces, `QA-CNIC valid`, `QA-Buyer One`, two `QA-Buyer Two`, `QA-Mass`, `QA-Dup…`, `QA-UI Customer` created in the browser two times).
- Bookings `BOOKING-00003` … `BOOKING-00010` (one cancelled with a refund, one transferred, one from a quotation, one with a voided receipt), receipts `RCT-00002` … `RCT-00006`, one refund (BOOKING-00009), quotation `QUO-00001`, one lead, service invoice `SINV-00001` (partly paid), reminder log entry.
- Vouchers: `JV` drafts and one approved-then-voided JV (narrations start `QA-`); a draft with the same account both sides; an unbalanced draft.
- Budget (draft) `QA-Budget`; five attachments on `QA-Buyer One` (PNG, 3.9 MB PDF, renamed-executable "PDF", path-named PDF, DOCX).
- Final live trial balance after the run: debit 721,501.74 = credit 721,501.74.

---

## Re-test 2026-11-05 (run between 18:40 and 20:00 UTC on 2026-11-04, local date 2026-11-05)

Commit under test: `39ba5af` "Send security headers from Next.js and the API" (migrations 0016-0019 applied on live). Run by the QA lead against `https://property-dealers-project.netlify.app` (seeded ByteCraft, Advanced, owner role) and on the local test databases. Nothing was fixed, nothing was committed. The sign-in password was used only as a process environment variable; it is not in any file, script, log, screenshot or this report. Everything created on live starts with `QA-`.

*History: the first attempt (earlier on 2026-11-04) stopped at step 0 because the live site did not send the security headers (an old deploy). That is resolved; this is the full re-test.*

### Recommendation: **GO with conditions**

In plain words: every fix that could be proven now holds. The books balanced at every check (live trial balance 864,509.74 = 864,509.74 at the end). An approved voucher can no longer be deleted; ten receipts sent at the same instant with one request id made exactly one receipt, four runs out of four; the browser double-click made one receipt every time; the smoke test passed twice in a row; the security headers are live and the site refuses to be framed; no page scrolls sideways at any phone width. **One of the five blockers did not fully pass:** the "failing request shows a clear error, never zeros" fix (BUG-004) works in about 14 of 15 cases but **intermittently (about 1 in 15 failing loads) still shows zero tiles with no error panel**. That is a new, narrower bug (BUG-020, S2). It only appears while the server is failing and no data is lost or wrong, so under section 8 of the brief it is a condition, not a block. If you consider "a customer might see 0 during an outage" unacceptable for the first customer, treat condition 1 as a blocker and hold the launch until it is fixed.

Rule check (section 8): no S1 open **yes**; no cross-company exposure **none seen** (but see "proven only on a test database"); books balance at every check **yes**; no role/plan bypass found **none** (on test databases); ten-at-once never made a second receipt **yes (4/4)**; smoke test passed twice in a row **yes (runs F and G, 25/25 each)**.

**Conditions** (owner and date are proposed; the owner must confirm them):
1. **BUG-020** (S2), intermittent missing error panel / zeros during a failing load. Owner: PropIQ developer. Date: before the first customer is onboarded. Re-test: `e2e/qa/flaky-states.mjs` must show 40/40 and `e2e/qa/states-live.mjs` 25/25 on two runs in a row.
2. **Prove blockers 2, 3 and 4 on live** where they were only proven on a test database: once a second company, a Sales Agent test account and a Basic/Professional organisation exist, repeat them. Owner: the owner (provides the accounts) and QA. Date: before a second customer organisation is created.
3. **Smoke-run B oddity**: in one of 7 smoke attempts, "Save receipt" produced no receipt (0 receipts, no screenshot, cause unknown; my script clicked right after the plan dialog closed, so a timing fault in my script is likely but not proven). Owner: QA with the developer. Date: re-run Q five more times after condition 1 is fixed; any repeat becomes an S2 on its own.
4. **S3/S4 leftovers** (BUG-019 re-measure from Pakistan, API lacks `Permissions-Policy`, voucher tabs wrap at 375 px): owner: developer; date: next release.

### Results table (live unless stated; "TDB" = test database, in-memory Postgres with the real API; scratch scripts are `e2e/qa/*-live.mjs`, screenshots `e2e/shots/qa/`)

| # | Item | Result | Evidence |
|---|---|---|---|
| 0.1 | `/api/health`, `/api/health/db` | PASS | both `{"ok":true}` |
| 0.2 | Headers on `/login` and `/api/health` (raw `curl -sI` below) | PASS (page) / PARTIAL (API) | page has all five; the API has `X-Frame-Options: DENY`, `CSP frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, HSTS but **no `Permissions-Policy`** (S4, see observations) |
| 0.3 | Baseline on this machine | PASS | `api npm test` **170/170** (expected 169, one test added), smoke test **512/512**, `tsc --noEmit` clean, `eslint app components lib` clean, `check-i18n` OK (3178 keys, 8 languages), API `typecheck` clean |
| B1 | **Blocker 1** BUG-001 approved voucher cannot be deleted | **PASS (live)** | `retest-live` B1: `DELETE` of an approved JV -> **409** "Only a draft or rejected voucher can be discarded. To cancel an approved voucher, void it with a reason."; status afterwards `approved`; B1b proper void **200**; B1c unknown id -> **404**; two clean runs (run 1 hit a script defect: its helper sent a JSON content type with no body, so submit/approve got 400; fixed in a scratch copy). In the browser (`voucher-ui-live.mjs`): the approved voucher page offers only **Void** (no Delete/Discard); Void from the screen -> status `void`; trial balance 864,509.74 = 864,509.74. |
| B2 | **Blocker 2** BUG-002 cross-company budget link | **PASS (TDB only)** | `vitest -t "BUG-002"` 5/5; the smoke test's `v_tenant_fk_gaps` check passes (512/512). **Not proven on live** (live has one company). |
| B3 | **Blocker 3** BUG-003 Sales Agent vs a colleague's booking | **PASS (TDB only)** | `vitest -t "BUG-003"` 7/7. **Not proven on live** (no agent account). |
| B4 | **Blocker 4** BUG-005 plan gating of routes (incl. `leads-summary`, `budget-check`, `budget-revisions`) | **PASS (TDB only)** | `vitest test/plans-routes.test.ts` 5/5 (every route called as Basic and Professional). **Not proven on live** (live is Advanced and must not change). |
| B5 | **Blocker 5** BUG-004 clear error + Try again, never zeros; skeleton while slow | **FAIL (intermittent)** | `states-live.mjs` (copy of `g3-states.mjs` that signs in with the env vars; blocks each screen's main request in the browser, no server change). Run 1: **22/25** (no panel on Projects, Reports, Bank Reconciliation). Run 2: **23/25** (Contracts, Leave). Different screens each time. Targeted loop `flaky-states.mjs` (5 screens x 8 repeats): **39/40** (Contracts #1: no panel after 45 s, the page showed "0 Contracts 0 Active 0"). So about **6 misses in 90 failing loads (about 7 %)**. When the panel appears it appears in 3.9-5.4 s (once 8.3 s) and Try again recovers every screen; the slow-load skeleton with no zeros **25/25 in both full runs**; a 403 shows the plain "Your role does not allow this (inventory.view)." sentence. New bug: **BUG-020**. |
| R1 | Ten-at-once, one request id | **PASS 4/4** | `retest-live`, 4 runs: 10 x `201`, **1 distinct receipt id**, **1 receipt on the booking**, 9 replays flagged (`idempotent-replayed`), 1.9-2.4 s each. **No run made a second receipt.** |
| R2 | 3 at once, no request id | PASS 4/4 | 3 receipts each time (old clients unchanged) |
| R3 | Same id, different amount | PASS 4/4 | `409 This request was already sent with different details.` |
| R4 | Browser double-click on Record receipt (`dbl-live.mjs`: same-instant `click(); click()` x3 + mouse triple-click) | **PASS 4/4** | exactly **1** receipt each; no page errors |
| Q | Release smoke test in the browser, **twice in a row** (`smoke-live.mjs`, runs F then G, no retry) | **PASS x2** | each **25/25**: sign in (7.6-8.0 s to dashboard) -> add customer through the screen -> book (screen) -> payment plan (screen) -> receive payment (screen) -> receipt on customer statement and trial balance -> print page renders -> attachment uploaded and downloaded (sha-256 equal) -> void from the screen -> bank reconciliation opens -> Urdu kept after reload (rtl) -> English restored -> no page errors. Earlier attempts A-E were script debugging (where Void and Documents live in the screens); step 5 failed once in them (run B), see condition 3. |
| Q+ | New checks, in each of runs F and G | **PASS** | text file `MZ...` named `.pdf` -> **415** "This file is not what its name says it is."; PDF renamed `.png` -> same 415; print of `/print/receipt/00000000-0000-0000-0000-0000000000ff` -> "This document could not be found, or you do not have access to it." in **1.4-2.1 s**; statement imported twice -> **201 then 409** "already been imported"; closing balance 9999 -> **422** with the figures ("lines lead from 1000.00 to 1700.00 ... or save it anyway"); `allowMismatch` -> **201**; same cheque number twice for the same person and bank -> **201 then 409**; second late fee while one is open -> **201 then 409** "A late fee of Rs 100.00 is already open". |
| H | Header check (raw headers below; iframe test; nothing broke) | **PASS** | A local HTML page with `<iframe src=".../login">`: the frame shows "refused to connect" and Chrome logs "violates ... frame-ancestors 'none'" (`retest-iframe.png`). Sign-in, sign-out (back to `/login`) and signed-out `/dashboard/customers` -> `/login` work; no CSP violation, no console error; English, Urdu, Chinese, Japanese, Arabic render (screenshots `retest-<lang>.png`, fonts load, no overflow). |
| P | Phone-width sweep `g3-overflow.mjs`, live, 320/375/768/1024 | **PASS** | **0 overflows in 128 page/width combinations**. Looked at 375 px Vouchers, Deals, booking detail, Accounts (`retest-375-*.png`): tables scroll inside their cards, nothing cut off with no way to reach it. Cosmetic only: the voucher type tabs wrap ("PIV", "DN", "JV" under the row) and the Netlify badge overlaps the last row. |
| S6 | BUG-007 body over 1 MB | PASS | 413 "That is more information than can be sent at once." |
| S6 | BUG-007 broken JSON / 20-digit amount | PASS | 400 / 400 (never 500) |
| S6 | BUG-008 overlapping leave | PASS | 201 then **409** "QA-Leave Tester ... already has leave on some of these days" |
| S6 | BUG-009 five bad requests (unknown account, unknown property/customer, duplicate CNIC, statement line without amount, cheque for unknown person) | PASS | all 4xx with plain sentences; no `constraint`, `_fkey`, `_check`, table or column names in any body |
| S6 | BUG-010 same account both sides | PASS | created (201) but **submit refused 422**: "The account 01.01.01.0001 Owner's Capital is on both the debit and the credit side ..." |
| S6 | BUG-014 print unknown id | PASS | see Q+ |
| S6 | BUG-015 `/v1/me` blocked | PASS | "We can't open your workspace. We couldn't load your account just now. This is usually temporary and nothing has been lost." + **Try again** + **Sign out**, no raw server text (the blocked answer carried a marker string, it was not shown); after unblocking, Try again returns to the dashboard |

### Status of the 19 original bugs after the re-test
BUG-001 verified fixed (live). BUG-002 verified fixed (TDB). BUG-003 verified fixed (TDB). **BUG-004 NOT fully fixed: see BUG-020.** BUG-005 verified fixed (TDB). BUG-006 verified fixed (live: 4/4 ten-at-once, 4/4 browser double-click, never more than one receipt in the smoke attempts). BUG-007, 008, 009, 010 verified (live). BUG-011 verified (live: second late fee refused). BUG-012 verified (live: import twice, wrong closing balance, override). BUG-013 verified (live: 0/128). BUG-014, 015 verified (live). BUG-016 verified for pages (live); the API still lacks `Permissions-Policy` (S4, below). BUG-017 verified (live: renamed files refused; a real PDF round-trips byte for byte). BUG-018 verified (live). BUG-019 not re-measured (needs a Pakistani connection; the 3.9/4.1 MB uploads were not repeated).

### Re-graded rows of the original matrix
A14, B2, B3 (TDB), C3 (TDB), G5, G6, H2, H4, H9, H10, I2, K2, K3, N1, O6, O7, O9: **FAIL -> PASS** (live except B2, B3, C3, which are TDB only; K3 re-tested for the renamed-file cases only, not the 3.9/4.1 MB sizes; O7 re-tested for the 1 MB body only, not 6 MB). **N3 stays FAIL** (BUG-020). New counts for the 119 rows: **PASS 87, FAIL 1, NOT-RUN 31, BLOCKED 0** (was 70 / 18 / 31 / 0). The 31 NOT-RUN rows from the first run were not re-attempted.

### New bugs

#### BUG-020 — S2 — UX — The "couldn't load this page" panel is missing in about 1 of 15 failing loads; zero tiles stay visible
- **Steps:** signed in on live, block the main request of a screen with browser request interception (`e2e/qa/states-live.mjs`, `flaky-states.mjs`) so it answers 500, open the screen. Repeat. Screens seen failing: Projects, Reports, Bank Reconciliation (run 1), Contracts, Leave (run 2), Contracts (targeted loop).
- **Expected:** the panel "We couldn't load this page" with Try again within about 5 s, never zero tiles (the fix for BUG-004).
- **Actual:** in about 7 % of attempts (6 of 90) the screen shows its normal layout with zero tiles ("0 Contracts 0 Active 0") and the panel never appears, even after 45 s with all 3 attempts used. No console error. The same screen shows the panel on the next try.
- **Frequency:** 3/25 and 2/25 in the two full runs, 1/40 in the targeted loop. Not tied to one screen.
- **Impact:** during a real outage a customer could believe records vanished (the original BUG-004 risk), in a minority of cases. No wrong data is saved.
- **Suspected cause (not verified):** `components/live/page-guard.tsx`: `outcome` is latched to "ok" the first moment no request is fetching (after an 80 ms grace). If a screen registers its data request a little later (slow device, hydration), the guard has already latched "ok", so a later failure only produces the slim notice while the zero tiles remain visible. Worth reproducing with a CPU-throttled browser.
- **Evidence:** the run counts above; no screenshot of the failing case was captured (the scripts record text only). `e2e/qa/flaky-states.mjs` reproduces it in a few minutes.
- **Status:** **Fixed, to be re-tested on live.** Cause found and reproduced (sandbox, `e2e/qa/flaky-states.mjs` with `HIDDEN_MS=2500`): TanStack Query *pauses* a failed request's retry while the browser tab is in the background (`fetchStatus: "paused"`). The guard only counted `"fetching"`, so a paused request looked like "nothing running", the guard latched "ok" and the zero tiles showed (before the fix: **0 of 20** failing loads showed the panel, zeros every time). `components/live/page-guard.tsx` now (1) counts a paused request as still unsettled, (2) never latches "ok" until a watched request has been answered (data or a 404) or has failed, with a timer fallback only for a page that registered no request (400 ms) or whose requests never started (1.5 s), and (3) still lets a failure with nothing to show produce the full panel. After the fix: hidden-tab run **20/20**, normal run **40/40**, `g2-states.mjs` **25/25** (skeleton, panel, Try again, no zeros, 403 sentence), the six browser scripts **120/120**. CPU throttling (x6) and 400 ms network latency alone did not reproduce it. The same change adds `Permissions-Policy` to every API answer (`api/src/app.ts`) with a test that calls the API and compares the value with the pages' (`api/test/security-headers.test.ts`).

### Observations that are not bugs (new)
1. **API answers have no `Permissions-Policy`** (pages do). The retest script's header check for `/api/health` therefore fails 4 of 4; everything else it checks is present. S4: it matters little for JSON.
2. The API answers **400** to a request that carries `content-type: application/json` with an empty body (the website never does that; the old QA helper did). Harmless for the website; a third-party client would need to omit the header.
3. Voucher type tabs wrap at 375 px; the "Powered by Netlify" badge covers the last visible row on phones (obs. 17 of the first run).
4. Voiding a receipt is on the Deals page, Receipts tab; the booking page lists receipts without an action. Fine, but the owner may expect it on the booking.
5. API tests are now 170 (CLAUDE.md says 169); smoke test 512 (as expected).
6. A late fee needs an overdue installment: a first installment inside the grace period correctly answers "This installment is not late yet".

### Raw headers (live, `curl -sI`, 2026-11-04 19:47 UTC)
```
GET /login
  Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY

GET /api/health
  Content-Security-Policy: frame-ancestors 'none'
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  (no Permissions-Policy)
```

### What was proven where
- **Proven on live:** blockers 1 and 5 (5 failed intermittently), the ten-at-once test, the browser double-click, the smoke test twice, the header check, the sweep, all spot checks.
- **Proven only on a test database (not on live):** blockers **2** (cross-company budget link), **3** (Sales Agent) and **4** (plan gating). Live has one company, no Sales Agent and is Advanced.
- **Not run:** everything the first report listed as NOT-RUN; the 3.9 MB / 4.1 MB / 6 MB uploads; BUG-019 timing from Pakistan; dark mode; the screen-level lock cards for Basic/Professional.

### Test data on live ByteCraft to clean up (all prefixed `QA-`; counts are the totals now on the site, which include the first run's records; accounting entries cannot be erased, only voided)
- **Customers:** 26 (`QA-Retest <n>`, `QA-Double Click <n>`, `QA-Smoke<A..G> Buyer <n>`, `QA-DupCNIC <n>` and `QA-DupCNIC <n>b`, plus the first run's). **Properties:** 44 (`QA-Retest plot`, `QA-dbl ...`, `QA-Smoke<run> plot`, `QA-Smoke<run> late plot`, ...). **Projects:** 3 (first run).
- **Bookings:** 31 with QA customers (28 pending, 1 confirmed, 2 cancelled). **Receipts on them: 24 still live (not voided) and 3 voided.** This session's: the four ten-at-once bookings hold 1 x 1,000 + 3 x 10 each; the double-click bookings 1 x 1,000 each; smoke runs A-E (not voided) 15,000 each; runs F and G were voided by the test. To neutralise the money, void the remaining QA receipts on the Deals page (Receipts tab) with a reason.
- **Open late fees:** Rs 100.00 on each `QA-Smoke<run> late plot` booking (one per smoke attempt that reached step 13, so up to 7); waive them in the booking or leave them.
- **Vouchers:** 5 void, 2 draft (`JV-00003`, `JV-00004`, safe to delete in the screen). This session's approved-then-voided JVs: `QA-Retest delete test` (2) and `QA-UI void` (1); the same-account draft from the spot check was deleted by the test.
- **Cheques:** 8 (`QA-CHQ-<n>`, amount 5,000, status received). Cancel them in the register if wanted.
- **Bank statements:** 16 (`QA-stmt <n>` and `QA-stmt bad <n>`, including the mismatch ones saved on purpose). Not reconciled; leave or ignore.
- **Staff:** 1 employee `QA-Leave Tester <n>` with one cancelled leave request.
- **Attachments:** `QA-real.pdf` (a tiny PDF) on each smoke booking, plus the first run's attachments.
- **Your account:** the interface language was switched to Urdu/Chinese/Japanese/Arabic and back; confirmed English again (`/v1/me` shows `en`).
- **On this machine (uncommitted, no secrets):** scratch scripts `e2e/qa/{retest-live-run,states-live,flaky-states,diag-states,diag-booking,diag-void,dbl-live,smoke-live,spot-live,headers-live,voucher-ui-live,inventory-live}.mjs` and screenshots in `e2e/shots/qa/`.
- **Final live trial balance:** debit 864,509.74 = credit 864,509.74 (BALANCED).
