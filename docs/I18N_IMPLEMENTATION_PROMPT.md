# Multilingual PropIQ — implementation brief

**How to use this file.** Open a new Claude Code chat in this repository and paste:

> Read `docs/I18N_IMPLEMENTATION_PROMPT.md` completely, then `CLAUDE.md`, then implement the multilingual feature it describes, phase by phase. Start with Phase 1 and stop for review at the end of each phase.

Everything the new chat needs is below. It has no memory of earlier conversations.

---

## 1. Goal

Make PropIQ usable in **7 languages besides English**, and remember each person's choice.

| Language | Code | Script / direction | Notes |
|---|---|---|---|
| English | `en` | Latin, LTR | Default and source of truth |
| Urdu | `ur` | Arabic script (Nastaliq look), **RTL** | Main customer language. Pakistani business users say many English loanwords in daily speech; keep widely used ones in Urdu script (بکنگ، واؤچر، رسید، پلاٹ) |
| Pashto | `ps` | Arabic script, **RTL** | Pakistani (Khyber Pakhtunkhwa) Pashto |
| Chinese | `zh` | Simplified Chinese, LTR | Simplified (zh-CN). Traditional can be added later |
| French | `fr` | Latin, LTR | Formal "vous" |
| German | `de` | Latin, LTR | Formal "Sie" |
| Japanese | `ja` | Japanese, LTR | Polite です/ます style |
| Arabic | `ar` | Arabic script, **RTL** | Modern Standard Arabic |

**Decisions already made by the product owner (do not ask again):**
- A person's language is saved **per person** (follows them to any device), plus a **company default** language that applies to anyone who has not chosen one.
- The owner does not want a first pass limited to a few screens forced on them; the work is split into phases below, and each phase must be fully finished (all 8 languages) for the screens it covers.
- All translations are written by you (AI). They **must be reviewed by native speakers before customers see them**, so keep every string in dictionary files that a translator can edit, and produce the review list described in §10.

## 2. Project context you must know first

PropIQ is a multi-company ERP/CRM for Pakistani housing-scheme developers (PKR, CNIC, Marla/Kanal). Read `CLAUDE.md` first (stack, commands, rules). Key facts that matter for this task:

- **Next.js 16.3.5 (App Router, Turbopack), React 19.2, Tailwind v4 (no tailwind.config), TypeScript strict.** This Next.js differs from older versions: read the relevant guides in `node_modules/next/dist/docs/` (internationalization, `cookies()`/`headers()` usage, proxy/middleware conventions, fonts) *before* writing code. Middleware is named differently in this version.
- Almost every page is `"use client"`. `app/layout.tsx` is a server component that mounts, in order: `ThemeProvider` → `AuthProvider` → `CompanyProvider` → `QueryProvider` → `PlanProvider` → `TooltipProvider`. `<html lang="en">` is hard-coded today.
- Two modes: **demo** (mock data, built-in sample companies) and **live** (Supabase sign-in + the API). Language must work in **both**.
- **Backend:** Fastify API in `api/` (Netlify Function in production), Supabase Postgres. Business rules live in SQL. Schema changes are **numbered migration files** in `api/db/migrations/` (latest is `0015`; `docs/schema/core.sql` is frozen). The root `tsconfig.json` excludes `api/`; never import from `api/` in the Next.js app.
- Size of the job: about **201 `.tsx` files, 27,000 lines**, **~408 directional Tailwind classes** (`ml-`, `pr-`, `left-`, `text-left` …), **112 server error messages** (`AppError(status, code, message)` in `api/src`), nav labels in `lib/plan.ts` (`NAV_ITEMS`), permission module names in `lib/permissions.ts`.
- Existing English-only helpers: `lib/format.ts` (`formatPkr`, `formatMoney`, `formatDate`, `formatAxis`; they use `en-PK`), `lib/amount-words.ts` (amount in English words for printed documents), `lib/export.ts` (CSV; mentions Urdu already for reminders), collection reminders (English/Urdu WhatsApp text), printable pages under `app/print/[kind]/[id]` (`components/live/print-docs.tsx`).
- Rules from `CLAUDE.md` that bite here: **no hydration mismatches** (anything locale/time dependent must resolve the same on server and client; the compact money formatter is hand-rolled on purpose because `Intl` compact differs between Node and browser); `react-hooks/set-state-in-effect` lint is enforced; **no new dependencies without strong reason**; never import mock arrays directly in UI; money values are **strings** end to end in live mode; do not edit `AGENTS.md`; **commit only when the user asks**; keep user-facing language plain and non-technical.
- Existing tests: `cd api && npm test` (109), `node docs/schema/smoke-test.mjs` (496, needs `npm i --no-save @electric-sql/pglite`), browser tests in `e2e/` (they assert **English** text, so English must stay the default and keep working), `npx tsc --noEmit`, `npx eslint app components lib`, `npx next build`.

## 3. Design (follow unless you find a concrete problem; if so, say why)

### 3.1 Translation system: hand-rolled, no library
- New folder `lib/i18n/`: `config.ts` (language list: code, native name, English name, `dir`, locale tag, font), `provider.tsx` (`LanguageProvider`, `useLanguage()`, `useT()`), `format.ts` helpers, `messages/`.
- `t("area.key", { name })` with `{name}` interpolation and a small plural helper. Unknown key → English fallback, and a `console.warn` in development only. Never throw.
- **Dictionaries split by area** so people and sub-agents can work in parallel without conflicts: `lib/i18n/messages/<lang>/<area>.ts` (`common`, `nav`, `auth`, `dashboard`, `properties`, `sales`, `finance`, `vouchers`, `people`, `admin`, `print`, `errors`, …). `en` is the typed source of truth; every other language must satisfy the same type, so a missing key fails `tsc`.
- **Do not ship all 8 languages to every visitor.** Load a language's dictionaries with dynamic `import()` when it is selected (English is always bundled as fallback).
- Add `scripts/check-i18n.mjs` (run in CI/locally) that fails when any language lacks a key that `en` has, has an extra key, or has a placeholder (`{name}`) that differs from English.

### 3.2 Choosing the language (resolution order)
1. The signed-in person's saved preference (`users.preferred_language`).
2. Their company's default language (`settings.default_language`, see §4).
3. The cookie/localStorage value from the last visit on this browser (used before sign-in and in demo mode).
4. `en`.
Do **not** auto-switch from the browser's language.

### 3.3 No flash of the wrong language or direction
Store the choice in a cookie (`propiq-lang`) as well as localStorage. Read it **on the server** in `app/layout.tsx` (via `cookies()` — check the async API in this Next version) and render `<html lang={code} dir={dir}>` and the right font class immediately. The client provider starts from that same value, so server and client agree; it then reconciles with `GET /v1/me` after sign-in and updates the cookie if the saved preference differs.

### 3.4 Right-to-left (Urdu, Pashto, Arabic)
- `dir="rtl"` on `<html>`. Convert directional Tailwind classes to **logical** ones across `app/`, `components/` (`ml-/mr-` → `ms-/me-`, `pl-/pr-` → `ps-/pe-`, `left-/right-` → `start-/end-`, `text-left/right` → `text-start/end`, `border-l/r` → `border-s/e`, `rounded-l/r` → `rounded-s/e`, `space-x-*` and `divide-x-*` need `rtl:` handling or flex `gap`). Do it mechanically with a script, then review the diff and look at the pages.
- Direction-bearing icons (chevrons, arrows, "back", breadcrumbs, step indicators, pagination, kanban drag hints) must mirror: `rtl:-scale-x-100` or `rtl:rotate-180`.
- Sidebar moves to the right side; Radix/shadcn `Sheet`, `Popover`, `DropdownMenu`, `Tooltip` placement must follow `dir` (pass `dir` to Radix `DirectionProvider` from `radix-ui`).
- **framer-motion** slide animations that use fixed `x` offsets must flip sign in RTL.
- **Always keep these left-to-right inside RTL text** (wrap in `<bdi dir="ltr">` or a small `<Ltr>` component): money amounts, CNIC, phone numbers, emails, URLs, codes (`PRP-1042`, `CPV-…`), percentages, dates in numeric form, file names.
- **Charts (recharts):** keep the plot area LTR (time runs left→right) but translate titles, legends, tooltips and axis labels; make sure labels do not overlap with long Arabic-script text.
- Tables: header and cell alignment follow `dir`; numeric columns stay right-aligned in LTR and left-aligned in RTL (use `text-end`).
- Both light and dark themes must be checked in an RTL language. The existing design rules (tokens, motion) still apply.

### 3.5 Fonts
Use `next/font/google`, loaded **only for the active language** (CSS variable per language; do not preload all of them):
- Urdu: **Noto Nastaliq Urdu** for body is hard to read in dense tables, so use **Noto Naskh Arabic** for UI and tables, with Nastaliq optional for headings/printed documents (give it generous `line-height`, about 1.9–2.1, as Nastaliq is tall).
- Pashto and Arabic: **Noto Naskh Arabic** (or Noto Sans Arabic). Check Pashto-specific letters (ټ ډ ړ ږ ښ ڼ ې ۍ) render.
- Chinese: **Noto Sans SC**. Japanese: **Noto Sans JP**. French/German: the existing Latin fonts.
- Headings use `font-heading` (Fraunces, Latin only): provide a fallback so non-Latin headings use the language font instead of rendering in a mismatched system font.

### 3.6 Numbers, dates, money
- Update `lib/format.ts` so `formatDate`, `formatPkr`, `formatMoney`, `formatAxis` take the active locale. **Recommended defaults** (the product owner has not objected; if you disagree, say so in the phase report):
  - **Western digits 0–9 in every language** for money, CNIC, phone, dates and codes (accounting safety; matches printed vouchers). Use locale tags with `-u-nu-latn` (for example `ar-SA-u-nu-latn`, `ur-PK-u-nu-latn`, `ps-AF-u-nu-latn`).
  - **Gregorian calendar only** (`-u-ca-gregory`), including for Japanese and Arabic.
  - Keep the currency shown as **"Rs"/PKR** in all languages, to avoid confusion on financial records. For Urdu, compact amounts may use **لاکھ / کروڑ** (lakh/crore) instead of M/K, since that is how Pakistani users read big numbers; keep the formatter hand-rolled and hydration-safe.
- Server and browser must produce identical strings. Test with `next build` + a hard reload in each language and look for hydration warnings.
- `lib/amount-words.ts` (amount in words on printed receipts/vouchers) is English only. Phase 4: add Urdu (lakh/crore system); other languages may keep English words on printed documents until reviewed. Say clearly in the docs which is which.

### 3.7 What is translated, and what is not
**Translate:** every label, button, tab, tooltip, placeholder, empty state, toast, confirm dialog, table header, form validation message (react-hook-form + zod: pass messages through `t()`), page title and description, `document.title`, navigation items (turn `label` in `NAV_ITEMS` into a key), permission module names, status names (map stored codes such as booking/voucher/cheque statuses to labels with `t()`; **never change the stored code values**), printable documents' fixed text, CSV export headers, the command palette (⌘K), the login / sign-up / reset-password pages, the landing page (`app/page.tsx`) and the plan names/descriptions.

**Do not translate:** anything a user typed (names, project names, notes, addresses), chart-of-accounts account names and bank names (stored data), demo mock data, the brand name PropIQ, document and property codes, enum values stored in the database, API route names.

### 3.8 Server error messages
The API already returns `code` with each error (`AppError(status, code, message)`) and plain English messages. Do **not** translate in the API. Instead the front end maps `code` → localized text with the server's English message as fallback (look at `lib/api/client.ts` for how errors are thrown). Translate the most common codes first (`plan_upgrade`, `not_permitted`, `validation`, `not_found`, the booking/receipt/voucher rule violations), then extend. List the codes in `lib/i18n/messages/en/errors.ts`.

### 3.9 Messages sent to customers (reminders)
The collection-reminder WhatsApp text (in the collections screens, `components/live/collections-live.tsx`, currently English/Urdu) is read by the **customer**, not the staff member. Give the reminder dialog its **own language selector** (all 8 languages, default = customer's language if known, else Urdu) independent of the interface language. Same for any quotation/receipt message text.

## 4. Backend changes

1. **Migration `api/db/migrations/0016_language_preferences.sql`** (numbered, never edit `core.sql`):
   - `alter table users add column preferred_language text check (preferred_language in ('en','ur','ps','zh','fr','de','ja','ar'));` (nullable = "not chosen").
   - Company default language lives in `companies.settings` (jsonb) as `default_language` (the same place as `marla_sqft` / `penalty_rate_pct_month`); add a check in the API (zod enum), not a column.
   - If you create a view, end the migration with `select app.secure_views();`. Keep `propiq_app` grants working (`users` is already writable by the API role; verify).
2. **API (`api/src/routes/system.ts`, `admin.ts`):**
   - `GET /v1/me` returns `user.language` (`preferred_language` or `null`) and each company's `defaultLanguage`.
   - `PATCH /v1/me` accepts `{ language: 'en'|'ur'|… | null }` (null clears the choice) alongside `fullName`; both optional but at least one required.
   - `GET /v1/company` and `PATCH /v1/company` include `defaultLanguage` (same single-`settings` merge pattern as the penalty settings — a single UPDATE cannot assign `settings` twice).
   - Language list in one shared constant in the API; the front end has its own copy in `lib/i18n/config.ts`; add an API test that fails if the two lists drift (same idea as `api/test/plans.test.ts`).
3. **Tests:** API tests for the new fields (valid, invalid code → 400, cleared with null, one user cannot change another's, company default saved/read); extend the smoke test (`docs/schema/smoke-test.mjs`) so the migration is covered; keep all existing tests green (109 API, 496 smoke).
4. **Docs to update:** `CLAUDE.md` (a short "Languages" section: where dictionaries live, how to add a string/a language, RTL rules), `docs/BACKEND_DESIGN.md` (users column + company setting), `docs/GO_LIVE.md`.
5. **Deployment note for the owner (put it in the final report):** the database is on Supabase (US East, Ohio) and the website and API deploy on Netlify. Migration `0016` must be applied to the live database **before** the new code is deployed: in `api/.env` the owner login is `MIGRATION_DATABASE_URL`; run `cd api && npm run migrate`. Then push; Netlify rebuilds. Never put `MIGRATION_DATABASE_URL` on Netlify.

## 5. Front-end behaviour to build

- **Language picker** (globe icon + native language name, for example "اردو", "پښتو", "中文", "Français", "Deutsch", "日本語", "العربية") in the top bar (`components/layout/app-topbar.tsx`), on the login page, and under **My account** (`app/dashboard/account/page.tsx`) with a short explanation. Each language is shown in its own script.
- Choosing a language: update the UI immediately, write the cookie/localStorage, and — if signed in to a live company — `PATCH /v1/me` (optimistic; if the save fails show a plain toast and keep the choice for this browser).
- **Administration → Company Profile** (`components/live/admin-live.tsx`, `app/dashboard/administration/company-profile`): a "Default language for new users" field (admin-only, same permission as the other profile fields). In demo mode, keep it local.
- Switching company must not reset the person's own language.
- Print pages (`/print/[kind]/[id]`) open in a new tab: they must read the same cookie, set `lang`/`dir`, and use a font that supports the script. Provide an on-page language toggle for the printout (a Pakistani developer often prints a receipt in Urdu for a customer even though they work in English). Verify Save as PDF output keeps RTL layout and glyphs.
- Accessibility: `lang` attribute on `<html>`; if a fragment is in another language (for example the language picker names) set `lang` on it; keep keyboard focus order correct in RTL.

## 6. How to extract strings at this scale

1. Start with `lib/plan.ts`, `components/layout/*`, `components/ui/*` text, `app/login`, `app/dashboard/layout.tsx`, and a `common` dictionary (Save, Cancel, Delete, Search, Add, Edit, Close, Loading…, status words, "No records yet"). Reuse `common.*` keys instead of repeating words.
2. Go **screen by screen**, one area per dictionary file. For each file: replace hard-coded text with `t()`; add the English string; then add the 7 translations. Do not leave a screen half converted.
3. Keep keys stable and descriptive (`properties.new.title`, not `string_482`). Put interpolation in the string (`"{count} installments overdue"`), never concatenate translated fragments (word order differs across languages). Use plural helpers for counts (Arabic and Urdu/Pashto/Chinese/Japanese plural rules differ).
4. If you can run sub-agents in this environment, give each a disjoint area (own dictionary files, own page files) after you have built the core system and the `common`/`nav` dictionaries, then merge and run the checks.
5. Domain glossary (use the same translation everywhere): Property, Plot, Project, Block, Booking, Installment, Receipt, Voucher, Journal, Ledger, Trial balance, Chart of accounts, Customer, Lead, Quotation, Contract, Contractor, Retention, Payroll, Leave, Budget, Marla, Kanal, Possession, Token money, Down payment, Late-payment charge, Refund, Transfer, Commission, Cheque (post-dated), Bank reconciliation. Record the chosen term per language in `docs/I18N_GLOSSARY.md` so reviewers can correct once and have it applied everywhere.

## 7. Phases (finish each one completely, then stop for review)

**Phase 1 — Foundation and shell.** Migration 0016 + API + tests; `lib/i18n` system; cookie/SSR direction; fonts; language picker (top bar, login, account, company default); `lib/format.ts` locale support; logical-property conversion across the whole app; RTL layout fixes of shared components (sidebar, top bar, dialogs, sheets, tables, toasts, command palette); translate `common`, `nav`, `auth` (login/sign-up/reset-password), account page, top bar, sidebar, dashboard — in all 8 languages. Include the check script and docs.
**Phase 2 — Core modules.** Properties (+ detail), Projects, Customers, Deals & Bookings (+ detail, payment plans, receipts, refunds, transfers, commissions), Collections.
**Phase 3 — The rest.** Leads, quotations, invoices, cheques, contracts, contractors, vouchers, accounts, bank reconciliation, expenses, budgets, reports, staff, leave, payroll, administration, activity log, plot map, landing page, billing text.
**Phase 4 — Output and edges.** Printable documents, CSV headers, amount in words (Urdu at least), reminder language selector and templates, error-code translations, `document.title`/metadata, empty/edge states, glossary and review list.

## 8. Verification (per phase, report results honestly)

- `npx tsc --noEmit`, `npx eslint app components lib` (clean), `npx next build`, `cd api && npm run typecheck && npm test`, `node docs/schema/smoke-test.mjs`, `node scripts/check-i18n.mjs`.
- Existing browser tests in `e2e/` still pass in English (run them in the documented order against a fresh sandbox). Add a new e2e script `e2e/language.mjs`: switch to Urdu → `html[dir=rtl][lang=ur]`, sidebar on the right, saved to the account (reload and sign in again on a fresh browser profile: still Urdu), company default applies to a user with no preference, switching back to English restores LTR.
- **Look at it.** Take screenshots (headless Chrome, see `CLAUDE.md`) of Dashboard, a table page, a dialog, and a printed receipt in `ur`, `ar`, `zh` and `de` (long German words overflow; Arabic-script and CJK text have different heights). Check light and dark mode, and a narrow mobile width. Fix overflow, clipping, mirrored icons, misplaced tooltips.
- No hydration warnings in the browser console in any language.
- Do not claim a phase is done until the above ran. If something cannot be run, say so.

## 9. Out of scope (do not build)
Translating user-entered data; machine-translating records on the fly; per-field multilingual names for chart-of-accounts/banks (can be a later feature using `name_ur` style columns); auto-detecting language from the browser; Traditional Chinese; localized digits (٠١٢٣) — keep as an option in the formatter but off.

## 10. Hand-off deliverables
1. Working code per phase, uncommitted unless the owner says "commit".
2. `docs/I18N_GLOSSARY.md` (term table, 8 languages) and `docs/I18N_REVIEW.md`: the list of every dictionary file by language with a note that all translations are AI-written and need native review, plus the **specific risks** you noticed (for example formal vs informal register, Pashto spellings, accounting terms with no standard translation, text that was too long to fit).
3. A short report to the owner in plain language: what now works, what is still English (by screen), how to add a new string or language, the deployment steps from §4.5, and open questions.

## 11. Open questions for the owner (default in brackets; proceed with the default and flag it)
1. Western digits everywhere, or Arabic-Indic digits for Urdu/Pashto/Arabic? [Western]
2. Keep "Rs" on money in every language? [Yes]
3. CSV export headers in the interface language, or always English for Excel/accountant consistency? [Interface language; stored codes untouched]
4. Simplified vs Traditional Chinese? [Simplified]

---

## Progress log

**Phase 1 — done (awaiting owner review).** Migration `0016`, API (`/v1/me`, `/v1/company`), `lib/i18n` (provider, runtime, loaders, plural-aware messages), cookie + server-rendered `lang`/`dir`, fonts, language picker (top bar, sign-in, reset-password, My account, Company Profile default), logical-property conversion of the whole app (98 files, ~570 class changes), mirrored icons/sheets/menus, money kept left-to-right, and all 8 languages for `common`, `nav`, `shell`, `auth`, `account`, `dashboard`, `admin` (500 keys). Checks run: `tsc`, `eslint`, `next build`, `node scripts/check-i18n.mjs`, API typecheck + 114 tests, smoke test 500, browser e2e 101 (English, unchanged) + `e2e/language.mjs` 19. Screenshots: `node e2e/i18n-shots.mjs` (demo, ur/ar/zh/de, light/dark/phone) and `e2e/i18n-live-shots.mjs` (signed in).
Deviation from the brief: Chinese and Japanese fonts load from a Google Fonts stylesheet only when that language is active (`next/font` bundles about a hundred pieces per CJK font and timed out the build); system fonts are the fallback.
**Phase 2 — done (awaiting owner review).** Projects (list, page, New Project), Properties (list, Add Property, property page with legal/ownership/liens/valuations/price), Customers & Suppliers (address book, Add forms, pickers), Deals & Bookings (list, booking page, payment plan, receipts, late charges, refunds, transfers, dealer commission, Collections and Commissions tabs, booking and receipt forms), plus the shared pieces they use (form dialogs, search pickers, attachments, export/print buttons, page header) in all 8 languages: 5 new areas, 611 new keys (1,111 in total). CSV headers on these screens now follow the interface language. Checks run: `tsc`, `eslint`, `next build`, `node scripts/check-i18n.mjs`, API typecheck + 114 tests, smoke 500, browser e2e 101 (English) + `language.mjs` 19, and screenshots with `e2e/i18n-p2-shots.mjs` (ur/ar/de, light and dark).
**Phase 3 — done (awaiting owner review).** Live screens for leads, quotations, service invoices, post-dated cheques, contracts, contractors, vouchers (list, page, form, 10 voucher types), accounts, bank accounts, bank reconciliation and statement import, expenses, budgets, reports, staff, leave, payroll, administration (users, roles and permissions, company profile, plan summary, activity log), plot map, settings, billing, and the landing page with pricing text, in all 8 languages: 6 new areas (`sales`, `vouchers`, `finance`, `people`, `administration`, `site`), 1,338 new keys (2,449 in total). The landing page now has a language picker. Not done: the demo-mode (sample data) versions of these screens, printed documents (Phase 4), role and leave-type names that come from the database.
**Phase 4 — done (awaiting owner review).** Printed documents (receipt, voucher, service invoice, payment plan, statement, quotation, agreement, payslip) in the interface language; amount in words in Urdu (other languages keep English words); a language picker on collection reminders (all 8, default Urdu) with templates `reminder.due`/`reminder.late`; error-code translations (`err.*`, applied by `ApiError`); translated tab titles and page metadata; translated 404 and error pages. 1 new area (`output`), 164 new keys (2,613 in total). CSV headers were done in Phases 2 and 3. Checks: `tsc`, `eslint`, `next build`, i18n checker, English e2e 101 + `language.mjs` 19, and `e2e/i18n-p4.mjs` (7). Left open: the demo-mode screens listed under Phase 3, role/leave-type names from the database, quotation/receipt message texts (none exist yet).

**Phase 5 — done (awaiting owner review).** The demo-mode (sample data) versions of CRM, quotations, sales/service invoices, cheques, contracts, vouchers, accounts, expenses, budgets, reports, staff, payroll, leave, contractors, group overview and administration, with their dialogs, in all 8 languages (area `demo`, ~490 keys; `tx()` in `lib/i18n/runtime.ts` translates stored English labels through `dm.x.*`). Screenshots: `e2e/i18n-demo-shots.mjs` (build the website without the `NEXT_PUBLIC_*` variables to get demo mode).
