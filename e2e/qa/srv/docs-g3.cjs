const fs = require("fs");
process.chdir("D:/BYTE_CRAFT/Property_Dealers_Project");
function edit(f, pairs) {
  let s = fs.readFileSync(f, "utf8");
  const crlf = s.includes("\r\n");
  s = s.replace(/\r\n/g, "\n");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) throw new Error(f + " missing: " + a.slice(0, 80));
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
}
edit("CLAUDE.md", [
  [
    "a repeated request id returns the first result instead of doing the work again).",
    "a repeated request id returns the first result instead of doing the work again), `0019` (QA group 3: a journal cannot debit and credit the same account/party/project/cost centre; one open late fee per installment; a cheque number is on the register once per bank and person; a bank statement can be imported once, `bank_statements.content_hash`).",
  ],
  ["| API tests (148, in-memory", "| API tests (169, in-memory"],
  [
    "- **Money-creating actions send a request id**",
    "- **API errors are plain and never technical** (`api/src/errors.ts` `toProblem`): Fastify's own 4xx (body too large → 413, unreadable JSON → 400) and Postgres codes (`22003` number too large, `23P01` overlap) get a clear sentence; table, column and constraint names are never sent to the client. New unique/check rules that people can hit get a sentence in `FRIENDLY_CONFLICTS` / `CHECK_MESSAGES`. Amounts are limited to 16 digits + 2 decimals in `api/src/http.ts`. Uploads are accepted only when the file's first bytes match the type (`sniffKind` in `api/src/routes/attachments.ts`).\n- **The website's TypeScript compiler also reads `api/src`** (through `netlify/functions-src/api.mts`, target ES2017): no `0n` BigInt literals there, use `BigInt(0)`.\n- **Money-creating actions send a request id**",
  ],
]);
edit("docs/GO_LIVE.md", [
  [
    "0016 (interface language), 0017 (QA group 1: voucher void guard, company-checked references) and 0018 (request ids) must be applied, in that order,",
    "0016 (interface language), 0017 (QA group 1: voucher void guard, company-checked references), 0018 (request ids) and 0019 (QA group 3: duplicate cheque / late fee / statement / same-account journal rules) must be applied, in that order,",
  ],
  [
    "## 4. Smoke test after each deploy",
    "**Browser hardening headers** (`netlify.toml`, `[[headers]]`): no framing of the site by other pages (`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`), `nosniff`, a referrer policy, and camera/microphone/location switched off. The CSP deliberately has no script/style rules yet: a full CSP needs Next.js nonces and a test of the font stylesheets, so do it as its own change. After a deploy check them with `curl -sI https://<site>/login`.\n\n## 4. Smoke test after each deploy",
  ],
]);

let r = fs.readFileSync("docs/QA_REPORT.md", "utf8");
const crlf = r.includes("\r\n");
r = r.replace(/\r\n/g, "\n");
function status(bug, text) {
  const i = r.indexOf("### " + bug + " ");
  if (i < 0) throw new Error(bug);
  const j = r.indexOf("\n### ", i + 5);
  const end = j < 0 ? r.indexOf("\n---", i) : j;
  r = r.slice(0, end).replace(/\s+$/, "") + "\n- **Status:** " + text + "\n" + r.slice(end);
}
status("BUG-007", "**Fixed (group 3).** `toProblem` maps Fastify's own 4xx (body over 1 MB → 413 `payload_too_large`, unreadable JSON → 400, wrong content type → 415) and Postgres `22003`/`22001`; amounts are limited to 16 digits + 2 decimals at validation (`api/src/http.ts`), so a 20-digit amount is a 400. Tests: `api/test/regression.test.ts` (BUG-007/009: 1.2 MB body, broken JSON, 20-digit and maximum-size amount, `toProblem` unit checks). Not the same as the Netlify 6 MB platform limit, which Netlify answers itself.");
status("BUG-008", "**Fixed (group 3).** The database already refused the overlap with its own sentence (error class `23P01`) which the API did not map; it now answers 409 `overlap` with \"<name> already has leave on some of these days\". Test: `regression.test.ts` (BUG-008).");
status("BUG-009", "**Fixed (group 3).** `details.constraint` is removed from every error (`23503`, `23505`, `23514`); known check rules get a sentence (`CHECK_MESSAGES`, e.g. a statement line with neither deposit nor withdrawal), the API itself now refuses that case first with the same sentence. Tests: `regression.test.ts` (BUG-007/009: no \"constraint\", `_fkey`, `_check` or table name in any error body).");
status("BUG-010", "**Fixed (group 3).** Migration `0019`, trigger `vouchers_sides_guard`: submitting a voucher that debits and credits the same account **with the same party, project and cost centre** is refused, naming the account. A different project/party/cost centre on one side is a real journal and is allowed (decision: refusing every same-account journal would block moving amounts between projects). Test: `regression.test.ts` (BUG-010).");
status("BUG-011", "**Fixed (group 3).** Migration `0019`, trigger `penalty_charges_duplicate_guard`: a second late fee is refused while one is open or part-paid (message names the open amount), and a fee that was paid today is not charged again today; after a waiver or later payment a new one is accepted. Tests: `regression.test.ts` (BUG-011, 2 tests including paying through a receipt).");
status("BUG-012", "**Fixed (group 3).** The API fingerprints each statement (account, period, balances, lines in date order) and migration `0019` makes it unique per bank account (`bank_statements.content_hash`): re-importing the same statement, even with lines in another order, answers 409 \"already imported\". Lines that do not lead from the opening to the closing balance are now refused with the figures (`statement_mismatch`) unless the person ticks \"Save it anyway\" (`allowMismatch`; new checkbox in the import dialog, `stmt.allowMismatch` in 8 languages), because a bank's own figures can legitimately differ. Lines with neither or both amounts are refused with a sentence. Tests: `regression.test.ts` (BUG-012, 3 tests).");
status("BUG-013", "**Fixed (group 3).** Two causes. (1) A hidden screen-reader label inside a scrolling table was positioned outside the clipped area and widened the whole page: scroll containers are now positioned (`app/globals.css`, `[class~=\"overflow-x-auto\"]`). (2) The booking and expense pages used a one-column grid that sized itself to its widest table: `grid-cols-1` (`booking-detail.tsx`, `expenses-live.tsx`); the Deals tab row now wraps. Test: `e2e/qa/g3-overflow.mjs` loads 32 pages at 320, 375, 768 and 1024 px and names any element that sticks out: **0 overflows of 128** after the fixes (before: 23).");
status("BUG-014", "**Fixed (group 3).** Cause: the print screens waited out three retries (about 7 s) before saying \"not found\". 4xx answers are no longer retried (group 2), and the print screens now tell \"not found / not yours / not a valid id\" (plain message at once) from \"the server could not be reached\" (message with Try again). No data was ever exposed. Verified in the browser (`e2e/qa/g3-ui.mjs`).");
status("BUG-015", "**Fixed (group 3).** The workspace error screen no longer shows the server's own words: it says (translated) either that the person has not been added to a company, or that the account could not be loaded and nothing is lost, with **Try again** (shows the opening screen while it retries) and Sign out. `useCompany().problem` is now a code (`noCompany` / `failed`), `retryAccount()` added. New keys `shell.splash.noCompany` / `shell.splash.failed` in 8 languages. Verified in the browser (`e2e/qa/g3-ui.mjs`).");
status("BUG-016", "**Fixed (group 3), to be confirmed after the deploy.** `netlify.toml` now sets, for every path, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that switches camera, microphone, location, payment and USB off. The CSP has no script/style rules on purpose (they could break Next.js, Supabase or the font stylesheets; a full CSP is a separate change). Netlify applies the file only on its own servers, so `api/test/security-headers.test.ts` checks the file and the QA team must re-check `curl -sI` on the live site after the deploy.");
status("BUG-017", "**Fixed (group 3).** Uploads are accepted only when the file's first bytes match the type it claims (`sniffKind`: PDF, JPEG, PNG, WebP, HEIC, zip packages for docx/xlsx, old Office files, plain text/CSV without control characters; a CSV announced as Excel is accepted). The check runs after the access checks, so a person without access learns nothing from it. Tests: `regression.test.ts` (BUG-017, 3 tests: every real type accepted; program-as-PDF, HTML-as-PDF, photo-as-PDF, PDF-as-PNG, binary-as-text, PDF-as-docx refused; nothing refused is stored); existing attachment tests now upload real PDF bytes and compare the download byte for byte.");
status("BUG-018", "**Fixed (group 3).** Migration `0019`: a unique index on company + direction + person + bank (case and spaces ignored) + cheque number, except cancelled cheques; the message says it is already on the register. The same number for another person or another bank is allowed (cheque numbers repeat across accounts). Test: `regression.test.ts` (BUG-018). If the live register already holds such a duplicate the migration will stop with an error and change nothing; there should be none (the QA cheques were created only in test databases).");
status("BUG-019", "**Investigated; not a defect in our code, one safeguard already existed, options below.** Measured locally (`e2e/qa/g3-upload.mjs`): a 3.9 MB file (5.2 MB as base64) uploads in **0.38 s** and downloads in 0.16 s; the 4.1 MB refusal takes 0.12 s. On the live site, an unauthenticated 0.5 MB request that is refused at the body limit took 9.5 s and a 5.2 MB one 22 s: the time is the upload path from this machine to Netlify (US East), before any of our code runs, so base64 and the database round trips are not the cause. The browser already refuses a file over 4 MB before sending it (`attachments.tsx`), so a person never waits for that refusal; the 18 s in the report came from the API test script. **Options and cost, for your decision:** (a) send the file as raw bytes instead of base64: about 25 % less to upload (a 3.9 MB file sends 3.9 MB instead of 5.2 MB), about half a day (new route + client change + tests); (b) shrink photos in the browser before upload: a 4 MB phone photo usually becomes under 1 MB, about half a day; (c) upload straight to Supabase Storage with a signed link, bypassing the Netlify function and its 6 MB limit, allows larger files, about two days and moves files out of the database (a data-protection and backup decision); (d) move the function closer to the users (a paid Netlify region or a US-East database, see GO_LIVE section 3). Recommended: (b) first, it helps every connection. Re-measure from a Pakistani office connection before spending on any of them.");
if (crlf) r = r.replace(/\n/g, "\r\n");
fs.writeFileSync("docs/QA_REPORT.md", r);
console.log("docs ok");
