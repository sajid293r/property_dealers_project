# PropIQ — Production Backend Design

> Status: design proposal, prepared after auditing every screen, type and mock-data module of the prototype.
> **Visual ERDs:** open [`erd/viewer.html`](erd/viewer.html) (interactive) or [`erd/ERD.md`](erd/ERD.md) — 227 tables across 15 feature areas, generated from [`erd/schema.mjs`](erd/schema.mjs). Import [`erd/erd.dbml`](erd/erd.dbml) into dbdiagram.io to edit visually.
> Companion files: [`schema/core.sql`](schema/core.sql) (executable foundation schema) and [`schema/smoke-test.mjs`](schema/smoke-test.mjs) (99 checks that run the schema in a real Postgres engine; about 90 of the tables are executable SQL — the foundation, the property model, tax, combined transactions, budgeting and inter-company/consolidation).
> Items marked **(assumption)** or **(verify)** are things to confirm with the client / an accountant / the vendor's current pricing page before committing.

---

## 0. The decisions in one page

| Question | Decision | Why |
|---|---|---|
| Database | **PostgreSQL 16** (single primary, relational) | You are right that SQL is the correct core: ERP data is relational and the money side needs ACID transactions. Postgres specifically beats MySQL here for row-level security (tenant isolation enforced *by the database*), deferred constraint triggers (balanced ledger), partial unique indexes ("one live booking per plot"), `NUMERIC`, JSONB for custom fields, partitioning, PostGIS for the plot map, `pgvector` for AI search. |
| Tenancy | **Shared schema, `company_id` on every row, enforced with Row-Level Security.** Organization → Company hierarchy. | Cheapest to run, simplest to migrate, and the multi-company feature we just built in the UI maps 1:1. Large clients can later be moved to a dedicated database without code changes (§10). |
| Source of financial truth | **One double-entry journal.** Vouchers, receipts, invoices, payroll and bills are *documents* that post to it. Balances are derived, never typed. | The prototype has two disconnected money models (see §1). Production must have exactly one. |
| Backend shape | **Modular monolith** (TypeScript, NestJS) + background worker, REST/OpenAPI. Frontend stays Next.js. | A team of 2–6 cannot operate microservices. Module boundaries are drawn now so a module can be extracted later. |
| Scale strategy | Index-by-tenant, partition the three big tables, cache/queue off the request path, read replica for reports, shard by company only when needed. | Detailed triggers in §10 — we scale when a metric says so, not in advance. |
| Starting cost | **$0 for development/pilot** on free tiers (§11), **≈ $30–70/month** once a real client's money data is in it (free tiers pause and have no real backups — do not put client money data on them). | Honest cost path. |

---

## 1. What the audit found in the prototype

Every page, type and mock module was read. The prototype is a good *product spec* but several things are shaped for demo convenience and **must not be copied into the database**:

| # | Finding (where) | Production fix |
|---|---|---|
| 1 | **A separate cash-book.** The prototype's `Account`/`Transaction` pair (Accounts page, `accounts.ts`) stores money on its own, unrelated to the Chart of Accounts and Vouchers (`vouchers.ts`, `chart-of-accounts.ts`), and the COA view derives balances from units, customers, staff and expenses on the fly. **The COA and vouchers themselves are kept** (§5.1) — they are the structure and the documents of one ledger. | Remove only the stand-alone cash-book: "Cash & Bank" tiles = balances of the cash/bank accounts of the COA; the transactions list = journal lines on those accounts. |
| 2 | **Stored totals that can drift:** `Deal.paidAmount`, `Customer.balance/totalPaid`, `StaffMember.balance`, `Account.balance`, `ConstructionContract.paidAmount`. | Derive from receipts/allocations/ledger. Where a cached total is needed for speed (installment `paid_amount`, `account_balances`) the database maintains it transactionally (done in `core.sql`). |
| 3 | **Name-based foreign keys:** `Unit.project`, `Expense.project`, voucher `project`, `Lead.assignedTo`, `Quotation.salesPerson` are free-text names. | Real UUID foreign keys. Renaming a project must not orphan data. |
| 4 | **Installments embedded in `Deal`** with no schedule rules, no penalty, no allocation of payments to installments. | `installments` table + `receipt_allocations` (a receipt can pay several installments; one installment can be paid by several receipts). |
| 5 | **No ownership history.** A property goes available→reserved→sold and that is all. No transfer, resale, cancellation/refund, possession. | `bookings` + `property_transfers` + `booking_cancellations` + `possessions` (§6.4). |
| 6 | **`Expense` and `Voucher` overlap**; `Expense` has no vendor, tax, attachment or payment link. | An expense is a *bill* (payable) from a vendor that later gets a payment voucher; both post to the journal. |
| 7 | **Customer is a thin record** (name, CNIC, phone, city). No joint owners, nominee, KYC documents, addresses, contact persons. | `parties` (one address book) + `party_roles` + `party_contacts` + `party_documents`. A person can be customer *and* dealer *and* employee without duplicates. |
| 8 | **Three people models:** `Customer`, `StaffMember` (HR), `SystemUser` (login). Staff `role` enum duplicates the RBAC role system. | `users` (login) ↔ `employees` (HR) linked 1:0..1; employees are also `parties`; authorization comes only from RBAC roles. |
| 9 | **Permissions cover 13 modules**, but the nav has 20+ screens (projects, contractors, vouchers, cheques, quotations, invoices, leave, group overview are not in the matrix). | Permission module list is generated from one registry shared by API and UI (§3.3). |
| 10 | **Cheques** (`PostDatedCheque`) have no deposit/clear/bounce dates, no bounce charges, no link to the receipt that results. | Cheque lifecycle table + auto-posting on clear/bounce (§6.5). |
| 11 | **Quotation** is one price. No versions, line items, validity extension, or conversion trace to a booking. | `quotations` + `quotation_lines` + `converted_booking_id`. |
| 12 | **Service invoices** use a free-text `period`; no recurring billing run, no tax. | `billing_schedules` + a monthly billing job; invoice lines with tax. |
| 13 | **Payroll** is only "adjustments". No attendance, payroll run, payslips, statutory deductions or bank file. Leave has no balances/accrual. | Full HR/payroll model (§6.8). |
| 14 | **Dashboards use hard-coded series** (`trends.ts`) and a static notifications list. | Read models / materialized views and a real notification service (§8, §7). |
| 15 | **Plot map has no geometry**, just a grid of buttons. | PostGIS polygons per plot, imported from CAD/KML/GeoJSON (§6.3). |
| 16 | **Marla→sqft is hard-coded to 272** in mock data. | Per-company conversion setting; keep original unit entered **and** normalized sqft. |
| 17 | **No audit trail, attachments, comments, approvals engine, or notifications** anywhere, yet every screen implies them (maker-checker on vouchers/leave/payroll; "Message on WhatsApp"; PDF export). | Cross-cutting platform services (§7) built once, used by every module. |

---

## 2. Architecture

```
                         ┌───────────────────────────────────────────────┐
  Browser / PWA ───────▶ │ Next.js (UI, SSR)  — no business logic        │
  Mobile (later) ──────▶ └───────────────┬───────────────────────────────┘
                                         │ REST + OpenAPI (generated typed client)
                              ┌──────────▼───────────┐        ┌───────────────────┐
                              │  API (NestJS)         │        │ Worker (same code) │
                              │  modular monolith     │◀──────▶│ pg-boss queues     │
                              │  authN/authZ, RLS ctx │ outbox │ PDF, notifications │
                              └───┬───────────┬──────┘        │ imports, billing   │
                                  │           │               └─────────┬─────────┘
                       ┌──────────▼──┐   ┌────▼──────────┐              │
                       │ PostgreSQL   │   │ Object store  │◀─────────────┘
                       │ (+RLS, PostGIS│   │ S3-compatible │   documents, photos,
                       │  pgvector)   │   └───────────────┘   generated PDFs
                       └──────┬───────┘
                       read replica (reports) — added when needed
```

**Backend modules (bounded contexts)** — each owns its tables and exposes a service interface; no module reads another module's tables directly (use its service or a published read view). This is what keeps extraction to a service possible later.

`platform` (tenancy, auth, RBAC, audit, files, notifications, workflow, numbering, settings) · `accounting` · `parties` · `projects` · `properties` · `crm` · `sales` (quotation, booking, installments, receipts, cheques, invoices, commissions, transfers) · `procurement` (vendors, POs, bills) · `construction` (contractors, contracts, IPCs) · `hr` (employees, attendance, leave) · `payroll` · `reporting` · `billing` (our own SaaS subscription) · `integrations` (WhatsApp, SMS, email, payment gateways, webhooks).

**Technology choices**

| Concern | Choice | Notes / alternative |
|---|---|---|
| Language/runtime | TypeScript on Node 22 | Shares zod schemas/types with the Next.js app via a `packages/contracts` workspace. |
| API framework | NestJS (modules, DI, guards, interceptors) | Fastify+Hono is fine if the team prefers lighter; the module rules matter more than the framework. |
| ORM / migrations | **Drizzle** + hand-written SQL migrations for RLS, triggers, partitions | SQL-first, keeps joins explicit. Prisma is acceptable but fights RLS/partitions/triggers. |
| Validation | zod at the edge; DB constraints as the last line of defence | The `core.sql` triggers exist so a bug in the API can never unbalance the books. |
| Background jobs | **pg-boss** (queue inside Postgres) | No Redis needed at the start; move to BullMQ/Redis when throughput demands. |
| Auth | Better-Auth / Auth.js, or Supabase Auth if hosting on Supabase. Short-lived JWT access token + rotating refresh token, MFA (TOTP) for owners/accountants. | Do not hand-roll password storage; argon2id. |
| Files | S3-compatible bucket (Cloudflare R2 / S3 / MinIO), presigned upload URLs; metadata in `documents` | Never store blobs in Postgres. |
| PDF | HTML templates → headless Chromium (Gotenberg or Playwright) | `react-pdf` struggles with Urdu (Nastaliq) shaping/RTL; Chromium renders it correctly. 82 reference PDF templates become ~15 parameterized templates. |
| Search | Postgres `pg_trgm` + full-text now; Typesense/Meilisearch only if needed | Good enough for 100k+ records per company. |
| Cache | None initially; Redis (Upstash) for sessions/permissions/rate limits later | |
| Observability | Sentry (errors), OpenTelemetry traces → Grafana/Honeycomb, structured JSON logs with `request_id`, `company_id`, `user_id` | |
| CI/CD | GitHub Actions: lint, typecheck, unit tests, **migration test on a throwaway Postgres**, e2e, deploy | `docs/schema/smoke-test.mjs` is the seed of the DB test suite. |

**API conventions.** `/api/v1/...`; resources are nouns; every request carries `X-Company-Id` and the server *verifies the caller's membership* (never trusts the header alone); cursor pagination (`?cursor=&limit=`), filter/sort whitelists, `ETag`/`If-Match` using the row `version` for optimistic locking, `Idempotency-Key` header on every POST that moves money (receipts, vouchers, payroll disbursement), RFC 7807 problem+json errors, consistent `?include=` expansion, bulk endpoints for imports. Long jobs (PDF batch, imports, payroll run) return `202` + a job resource.

**Frontend integration (small change).** `lib/services/index.ts` is already the seam: each `xService.list(companyId)` becomes an HTTP call; `useCompanyQuery` already passes the active company; the per-company QueryClient already prevents cross-company cache leaks. Mutations currently written as `queryClient.setQueryData` become `useMutation` + invalidation.

---

## 3. Multi-company & security model

### 3.1 Hierarchy
```
Organization (the paying customer / group owner, owns the subscription)
 └─ Company (legal entity: own NTN, books, fiscal calendar, numbering, branding)
     └─ every business record (projects, properties, parties, ledger, staff, …)
```
A user belongs to an organization and is granted a **role per company** (`company_members`). The owner of a group can be Accountant in Company A and read-only in Company B. This is exactly what the company switcher and Group Overview page need.

### 3.2 Isolation — enforced by the database
Every request runs in one transaction that begins with
`SELECT set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`.
Every table with a `company_id` has an RLS policy `company_id = app.current_company()` with `FORCE ROW LEVEL SECURITY`; the API connects as a non-owner role without `BYPASSRLS`. **A forgotten `WHERE company_id = …` therefore returns nothing instead of leaking another client's data** — verified in `smoke-test.mjs` (fail-closed with no context, no cross-company read, no cross-company insert).

*Group (cross-company) views* — the Group Overview page — must not loosen RLS. They read `company_kpi_snapshots` (a small per-company summary table refreshed by the worker) through a function that first checks the user's org membership.

*Connection pooling:* use the pooler's **transaction mode** (PgBouncer/Supavisor); `SET LOCAL`/`set_config(...,true)` is transaction-scoped so it is safe there. Never use session-level `SET`.

### 3.3 Authorization (RBAC + data scope + field rules)
- Permission = `module × action` (`view, create, edit, delete, approve`) per role — what the matrix editor already edits — **plus `data_scope`**: `own` (records I created/am assigned), `team`, `project` (projects I'm on), `company`. An agent sees only their leads and bookings; a project manager sees only their projects' costs.
- **Field-level rules** for sensitive columns (salary, CNIC, cost price, commission rates): a `sensitive_fields` map per module checked in the serializer.
- The module registry (`key`, label, actions, minimum plan) lives in **one place** consumed by API guards, the matrix UI, and plan gating — closing audit finding #9.
- **Approvals are a platform workflow** (§7), not hard-coded per screen: any document type can require N approvers above a threshold, with maker≠checker enforced.

### 3.4 Other security controls
- **PII:** CNIC, NTN, bank account numbers encrypted at the application layer (envelope encryption, per-organization data key, KMS-held master key); only a hash (for de-dup lookups) and last-4 are queryable. Mask by default in the UI; "reveal" is permission-gated **and audit-logged**.
- Argon2id passwords, MFA for owners/finance roles, device/session list with revoke, brute-force throttling, optional IP allow-list.
- TLS everywhere; secrets in the platform secret store; least-privilege DB roles (`app_user` for requests, `migrator` for DDL, `readonly_reports` for the replica).
- `audit_log` is append-only, records create/update/delete/approve/login/**export/reveal**, with before/after JSON, IP and request id.
- Backups: PITR (WAL) + nightly logical dump to a *different* provider; **quarterly restore drill** (a backup that was never restored is a hope, not a backup).
- Rate limiting per user and per company; webhook signature verification; upload type/size limits + malware scan.
- Compliance: Pakistan's personal-data-protection rules are still evolving **(verify with counsel)**; design for consent records, data export and erasure-by-anonymization (financial rows are retained, personal fields scrubbed).

---

## 4. Data conventions (apply to every table)

| Rule | Detail |
|---|---|
| IDs | `uuid`, generated by the app as **UUIDv7** (time-ordered → good index locality). Human-readable numbers (`BK-00123`, `CPV-00087`) are separate columns from `app.next_doc_no()` — atomic, per company, optionally restarting each fiscal year. |
| Money | `NUMERIC(18,2)` + `currency` where mixed currency is possible. **Never** float. Rounding rules defined once (banker's vs half-up) in the accounting module. |
| Land area | Store what the user typed (`size_value`, `size_unit` = marla/kanal/sqft/sqyd) **and** normalized `size_sqft`. Conversion factors are company settings (audit #16). |
| Dates/time | Business dates are `date`; event times are `timestamptz` (UTC). Company timezone `Asia/Karachi`. Fiscal year defaults to **July–June**. |
| Status columns | `text + CHECK`, with allowed transitions enforced in the service (state machines in §6). Every transition writes a `status_history` row (who, when, why). |
| Soft delete | `deleted_at` for master data. **Financial documents are never deleted** — they are voided/reversed. |
| Concurrency | `version int` on mutable rows; `UPDATE … WHERE id=$1 AND version=$2` → 409 on conflict (two cashiers editing the same booking). |
| Custom fields | `custom jsonb` on main entities (client-specific attributes) + a `custom_field_definitions` table for labels/types/validation; indexed with GIN only when queried. |
| Attachments/comments/tags | Polymorphic (`entity_type`, `entity_id`) tables shared by all modules (§7). |
| Bilingual | `name_ur` style companion columns for names printed on legal documents; UI strings via i18n. |

---

## 5. Accounting core — the heart of the system

**Model.** `gl_accounts` (the 2-2-2-4 levelled chart already in `lib/chart-of-accounts.ts`), `fiscal_years`, `accounting_periods` (open/locked), `journal_entries` + `journal_lines` (append-only), `account_balances` (period roll-ups for fast reports), `cost_centers`, and *sub-ledger dimensions* on each line: `party_id` (who), `project_id` (which project), `cost_center_id`.

**Invariants — enforced by the database, not just code** (all exercised in `smoke-test.mjs`):
1. Every entry balances (deferred constraint trigger).
2. A line is debit **xor** credit.
3. Posted entries/lines are append-only; correcting = a *reversing entry* linked by `reversal_of`.
4. No posting to a group/header account or into a locked period.
5. `account_balances` updated in the same transaction → trial balance is a read of a small table, not a scan of millions of lines.
6. Document numbers are gapless per company/type/period.

### 5.1 Chart of Accounts **and** Vouchers — both are kept (and they are one system)

They are two halves of the same ledger, not two systems:

| | **Chart of Accounts (COA)** | **Voucher** |
|---|---|---|
| What it is | The *structure*: the organized list of buckets money can be recorded in (assets, liabilities, equity, income, expenses) | The *document*: the dated, numbered, approved paperwork that records one transaction |
| Changes | Rarely — the admin adds/edits accounts | Every day — each payment, receipt or adjustment |
| Tables | `gl_accounts` (+ `cost_centers`, `fiscal_years`, `accounting_periods`) | `vouchers`, `voucher_lines` (types CPV, CRV, BPV, BRV, JV) |
| Link | `voucher_lines.account_id → gl_accounts.id` | A voucher, once **approved**, posts one balanced `journal_entry`; `vouchers.journal_entry_id` points to it |

So: the COA says *where* money may go; the voucher says *what happened*; the **journal** is the permanent record that both feed. Receipts, invoices, bills and payroll runs are further document types that post to the same journal through the same COA. What the design retires is only the prototype's separate **Account/Transaction cash-book** (finding #1), because a second place that stores money would drift from the books. The "Cash & Bank" screen stays — it is simply a view of the cash/bank accounts of the COA.

**Documents → journal (posting rules).** Each business event has a *posting rule* table row (event → debit account, credit account, dimension mapping) so accountants can adjust mappings without a deploy.

| Event | Debit | Credit |
|---|---|---|
| Customer receipt (booking/installment) | Cash/Bank | Customer receivable *or* Customer advances (until recognized) |
| Revenue recognition (policy per company: on booking / on full payment / on possession / % of completion **(verify with accountant)**) | Customer advances | Property sales income |
| PDC received | *(memorandum register, no entry)* | |
| PDC cleared | Bank | Customer receivable/advances |
| PDC bounced | Customer receivable + Bank charges | Bank (reversal) |
| Booking cancelled / refund | Customer advances | Refund payable + Forfeiture income |
| Dealer commission accrued | Commission expense | Dealer payable |
| Supplier/vendor bill | Expense or Project cost (WIP) + Input tax | Vendor payable |
| Contractor running bill (IPC) | Project cost (WIP) | Contractor payable + Retention payable − Advance recovered |
| Payroll run | Salary & allowance expense | Net salary payable + Tax payable + EOBI/social security payable + Loan recoveries |
| Salary disbursement | Salary payable | Bank |
| Service/maintenance invoice | Receivable | Service income + Tax payable |
| Stock-in-hand (unsold properties) valuation | Inventory (properties) | Cost of land/development (capitalized) |

### 5.2 Tax management — set by the admin, not by a developer

Requirement: *the admin must be able to define taxes for revenue (and anything else) from a settings screen.* Nothing about tax is hard-coded; rates change with every budget and differ by transaction type and by whether the party is a tax **filer**. The module (11 tables, ERD area "Tax Management"; the core of it is executable in `core.sql`):

| Admin sets up… | Table | Example |
|---|---|---|
| **Authority** | `tax_authorities` | FBR, a provincial revenue authority |
| **Tax code** | `tax_codes` | "Sales tax on services": kind *sales_tax*, direction **output** (we collect), applies on *revenue*, price inclusive or exclusive, rounding, and the GL accounts it posts to (payable / receivable / expense) |
| **Rate** (effective-dated) | `tax_rates` | 16 % until 30 Jun 2026, then 18 % from 1 Jul 2026 — **history is preserved**; overlapping periods are rejected by the database. A rate can be a **percent, a flat amount, or progressive slabs**, and can differ for *filer* vs *non-filer* |
| **Bundle** | `tax_groups`, `tax_group_items` | "Plot sale taxes" = withholding + sales tax, in order, optionally *compound* (tax on top of tax) |
| **Assignment rule** | `tax_assignments` | "When a **booking** is for a *residential plot* and the buyer is a *non-filer*, apply bundle X" — by document type, property type, project, party status, amount range, priority and validity dates |
| **Exemption** | `party_tax_exemptions` | Party exempt from a tax, with certificate and validity |

**How a tax is applied.** When a booking, receipt, invoice, bill, transfer, commission or payroll is saved, the service finds the highest-priority matching `tax_assignment`, calls `app.apply_tax_group(group, base, date, filer_status)` (implemented in SQL and tested: ordering, compounding, inclusive prices, flat amounts, slabs, rounding), and stores one **`document_taxes`** row per tax (base, rate used, amount, direction, optional *override reason* if a user changes it, and the journal entry once posted). Tax directions cover every real case: **output** (collected from the customer), **input** (paid to a supplier, claimable), **withheld by us** (deducted from a payee and owed to the authority), **withheld from us** (deducted by a customer — a tax credit for us).

**Filing.** `tax_returns` (period, totals, status draft → filed → paid, reference, attachment) collects `document_taxes` through `tax_return_lines`; `tax_payments` records the challan and links the payment **voucher**. This also produces the tax payable/receivable reports.

**Why this design.** The accountant can add a new tax or change a rate on the day the budget is announced, transactions created before that date keep their old rate, and an auditor can see exactly which rate was applied to which document. **Tax rates, bases and filing duties must still be confirmed by the client's accountant** — the system enforces whatever they configure; it does not decide it.

### 5.3 Combined transactions

*Interpretation (confirm with the client): a "combined transaction" is one business event that settles or touches several documents at once, with all-or-nothing posting.* The design supports it at two levels:

1. **Within a company — `combined_transactions` + `combined_transaction_items`.** Examples: a customer pays one amount that settles installments of two bookings plus a maintenance invoice; a **contra/settlement** nets a party's receivable against its payable; a multi-party voucher. A deferred database rule guarantees the items add up to the total (or, for contra/settlement, that *in = out*); posting and reversal happen **as a unit** (`reversal_of`). Supporting pieces: **`receipt_tenders`** (one receipt paid by cash + cheque + online, tenders must equal the receipt) and **generalized `receipt_allocations`** (one receipt can settle installments, penalties, sales invoices and service invoices — exactly one target per allocation row).
2. **Across companies — see §5.4.** Inter-company transactions and consolidated statements for the group.

### 5.4 Inter-company transactions & consolidation (multi-company groups)

For an owner with several companies (the company switcher in the prototype):

- **`intercompany_transactions`** — a loan, repayment, fund transfer, expense recharge, sale or commission *between two companies of the same organization*. It is visible to **both** companies and nobody else (RLS). One call, `app.post_intercompany(...)`, posts **both sides atomically**: the sender books *Dr Due-from-counterparty / Cr Bank*, the receiver books *Dr Bank / Cr Due-to-counterparty*, each in its own ledger and period; the transaction links both journal entries. Which accounts to use per pair of companies lives in `intercompany_accounts`.
- **Consolidated statements.** Each company keeps its own chart of accounts, so a **group chart** (`group_accounts`) is defined and each company account is mapped to it (`group_account_map`). `app.run_consolidation(group, from, to)` sums every member's ledger through the map and writes **elimination entries** for inter-company balances so the group is not double-counted — verified: money moved between members nets to zero and inter-company receivable/payable eliminate to zero. Tables: `consolidation_groups`, `consolidation_members` (ownership %, method), `consolidation_runs`, `consolidated_balances`, `elimination_entries/lines`.
- **Still separate by default.** Companies stay fully isolated; only these explicit, audited objects cross the boundary. Ownership-percentage (proportional/equity) accounting and currency translation are modelled (`ownership_pct`, `method`) but not yet computed — Phase 4.

### 5.5 Budgeting & budget control

A budget is a planned limit on spend, set **before** the money moves. The prototype now has a Budgets screen; this is the production design behind it (13 tables, ERD area "Budgeting & Control", all rules below are in `core.sql` and tested).

**Kinds.** *Project* budgets cap a scheme's lifetime cost (one live budget per project — enforced by the database); *operating* budgets plan a fiscal year of running costs month by month; *capex* budgets cover one-off capital items. Revenue/sales targets are modelled the same way later (`kind`).

**Structure.** `budgets` (header: kind, project, cost centre, fiscal year, period, status, **control mode**, version) → `budget_lines` (category, cost code, **the ledger account it watches**, amount) → `budget_line_periods` (monthly phasing; the months must add up to the line). `budget_templates` give new budgets a standard category split (the prototype's 9-category split: land development, civil & structural, roads, electrical, water & sewerage, landscaping, approvals & legal, marketing, contingency).

**Actual and committed are never typed in.**

| Number | Where it comes from |
|---|---|
| **Budget** | the approved lines (changed only by revisions) |
| **Committed** | open `budget_commitments`: purchase orders, construction contracts, running bills (IPCs), vendor bills, payroll — money spoken for but not yet paid. Becomes *actual* when invoiced/paid |
| **Actual** | read live from the ledger: `journal_lines` on the line's account, narrowed by the budget's project, the line's cost centre and the budget period. Vouchers, bills, payroll and IPCs all post there, so nothing is double-entered |
| **Available** | budget − committed − actual |
| **Utilization** | (committed + actual) ÷ budget |
| **Forecast** | `budget_forecasts` — run-rate, percent-complete, or manual estimate-to-complete |

A SQL view `v_budget_line_status` computes this per line (with the caller's tenant isolation applied), so the Budgets screen, dashboards and alerts all read one definition.

**Lifecycle (maker-checker).** `draft → submitted → approved → locked → closed`; the database refuses skipped steps. The creator cannot approve their own budget; approval stores a **v1 snapshot** (`budget_snapshots`). After approval, **lines cannot be edited directly** — a change is a `budget_revisions` request: *supplementary* (adds money), *reallocation* (moves money between lines, must net to zero) or *reforecast*. A different user approves it; the lines update, monthly phasing is rescaled to match, the version number goes up and a new snapshot is stored — so any past version can be reproduced for an auditor. The revision also flows through the platform approval engine (§7).

**Control — stopping overruns, not just reporting them.** Each budget has a control mode:

| Mode | When a voucher / PO / bill would exceed a line |
|---|---|
| **None** | tracked only |
| **Warn** | user sees the over-by amount and can continue |
| **Block** | stopped; the user raises a `budget_exceptions` request (you cannot approve your own exception) or asks for a revision |

The services call `app.check_budget(account, project, cost centre, date, amount)` before accepting a document; it returns `allow / warn / block` and the available amount from the most specific approved budget (no row = no budget covers it, nothing to enforce). **Alerts:** `budget_alert_rules` (e.g. 85 % and 100 %, per channel) and `app.evaluate_budget_alerts()` fire each threshold once per line into `budget_alerts` (acknowledgeable); a nightly job and each posting can call it safely.

**Reports.** Budget vs actual vs committed by project/category/period; variance and run-rate forecast; revision history; project cost-to-complete; operating plan-to-date vs actual by month; exceptions and overrides log. Group-level roll-up across companies uses the consolidation module (§5.4).

**Honest limits.** The "guard" that locks approved lines is a safety net against application bugs, not a defence against someone with direct database credentials. Revenue-side budgets, multi-currency budgets and automatic carry-forward of unspent balances are Phase 4.

**Reports are queries over this model:** trial balance, P&L, balance sheet, cash-flow, general ledger, party ledger (customer/vendor/dealer/staff statements), project profitability, receivable ageing, installment due/overdue, commission statement, budget-vs-actual.

---

## 6. Module-by-module design

For each module: **what the prototype has → what production must record (new data) → business rules/state machine → key tables.** `*` = new capability the prototype doesn't show but the business needs.

### 6.1 Platform (tenancy, users, roles, settings)
- **Has:** company switcher, users, roles/permission matrix, company profile, plan tiers.
- **Record:** organizations, companies (legal name, NTN, **STRN**, address, logo, letterhead, bank accounts), users (MFA, last login, device sessions), invitations (token, expiry), `company_members(role)`, roles + `role_permissions(…, data_scope)`, `api_keys*`, `feature_flags`, per-company `settings` (numbering formats, marla→sqft, rounding, revenue-recognition policy, late-fee policy, default accounts for posting rules, working week/holidays, language, timezone).
- **Rules:** one owner minimum; cannot delete the last admin; role changes are audited; invitations expire; plan limits (seats, companies, projects, storage) checked on create.
- **Tables:** `organizations, companies, users, org_members, roles, role_permissions, company_members, invitations, sessions, api_keys, settings, feature_flags, posting_rules, numbering_formats`.

### 6.2 Parties (customers, dealers, vendors, contractors, owners)
- **Has:** Customers (name, CNIC, phone, city), Contractors, Leads.
- **Record\*:** one `parties` book with roles; multiple phones/WhatsApp flag; addresses (current/permanent); **joint owners** and **nominee/next-of-kin** per booking; KYC documents (CNIC front/back, NTN certificate, photo, proof of address) with expiry; source/referrer; communication preferences & consent; bank details (for refunds/commission payout); tax status (filer/non-filer *affects withholding* **(verify)**); risk flag/blacklist reason; overseas Pakistani flag; relationship manager; notes & timeline.
- **Rules:** de-duplicate on normalized CNIC and phone (`phone_e164`); merging two parties re-points all references and is audited; a party with ledger activity cannot be deleted.
- **Tables:** `parties, party_roles, party_contacts, party_addresses, party_documents, party_bank_accounts, party_relationships, blacklist_entries`.

### 6.3 Projects & properties — a property model richer than a portal listing
- **Has (prototype):** Projects (budget, dates, manager), Units (code, size, price, status, block, image), plot-map grid.
- **Goal:** record *more* about a property than Zameen.com does, so the dealer's own database becomes the single source of truth — not just what is shown on a portal. A portal listing is one *output* of this data (`property_listings`).
- **Design:** a narrow hub (`properties`) and focused detail tables, so each kind of property stores only the fields that apply to it (a plot has no bedrooms; a shop has frontage and footfall) and each group can be secured, indexed and reported on separately. Admin-extendable lists (`property_types`, `amenity_catalog`) mean **new attributes need no migration**; `attributes jsonb` holds client-specific one-offs.

| Group | Tables | What is recorded |
|---|---|---|
| **Core** | `property_types`, `properties` | type (plot, house, flat, upper/lower portion, penthouse, farmhouse, shop, office, warehouse, agricultural land …), code, **listing ref**, title (EN/UR), description, **purpose** (sale / rent / both), list price, **price per marla**, negotiable?, **installments available?**, **possession status** (ready / under construction / off-plan) and date, **ownership source** (own inventory / consignment / dealer stock / client listing) and owner, featured flag, internal notes, status |
| **Location** | `property_locations`, `property_geometries` | plot no., street, sector, phase, society, area, city, province, postal code, landmark, **GPS latitude/longitude**, road name & **road width**, distance to main road, **facing**; plot polygon (PostGIS) for the interactive map |
| **Size** | `property_dimensions` | size as entered (marla / kanal / sq ft / sq yd / acre) **and** normalized sq ft, covered area, frontage, depth, length, width, shape, **corner**, plot cut |
| **Plot specifics** | `property_plot_specs` | land use, developed / semi / undeveloped, **balloted**, **disputed**, park-facing, boulevard-facing, boundary wall, possession available, file type (open file / allocation letter / registered), zoning, topography, soil |
| **Building specifics** | `property_building_specs` | bedrooms, bathrooms, kitchens, drawing / dining / TV-lounge / servant quarters / store / laundry / study / prayer rooms, balconies, terraces, parking spaces, floors, floor no., unit no., tower, **year built**, age, construction status (grey structure / finished), **condition**, **furnishing**, flooring, kitchen type, view |
| **Commercial specifics** | `property_commercial_specs` | shop / office / showroom / warehouse / factory, frontage, mezzanine, floor height, footfall, suitable for, expected rent, **expected ROI**, loading bay, power load |
| **Features & amenities** | `amenity_catalog`, `property_amenities` | **data-driven**: lift, backup generator, solar, CCTV, fire safety, central AC/heating, double glazing, lawn, swimming pool, gym, sauna, jacuzzi, community centre, mosque, kids' area, security & maintenance staff, waste disposal, broadband, cable TV, intercom, etc. — each yes/no, a number, or text. The admin adds new ones |
| **Utilities** | `property_utilities` | electricity, gas, water, sewerage, internet, telephone, solar, generator — status (available / nearby / applied / none), provider, connection and **meter number**, connection date, est. monthly bill |
| **Nearby** | `property_nearby_places` | schools, hospitals, mosques, markets, parks, airport, motorway, public transport — name, distance, travel time, coordinates |
| **Media** | `property_media` | photos, video, 360° tours, floor plans, site plans, drone shots, brochures — caption, order, cover image, public vs internal |
| **Legal & title** | `property_legal`, `property_documents` | ownership type (freehold / leasehold / allotment / POA / file), title status, **registry no., fard no., khasra no., allotment no. & date**, mutation, NOC, transfer status, lease dates, ground rent, verification; scanned documents with reference, issue/expiry and verified-by |
| **Ownership & encumbrances** | `property_ownership_history`, `property_encumbrances` | the **full chain of owners** (acquisition type, price, deed ref, linked booking) — exactly one current owner; mortgages, liens, court stays, litigation and tenancy rights with holder and release |
| **Valuation & inspection** | `property_valuations`, `property_inspections` | market / bank / internal valuations with valuer and report; inspection date, inspector, 1–5 rating, checklist, findings, report |
| **Rent roll** | `property_tenancies` | tenant, monthly rent, security deposit, dates, status, agreement — one active tenancy per property |
| **Publishing** | `property_listings` | the same property on website / Zameen / OLX / Facebook / walk-in: external reference, title, price, status, published/expiry, **views and inquiries**, last sync |
| **Pricing & charges** | `price_lists`, `price_list_items`, `pricing_rules`, `property_price_history`, `property_charges`, `property_status_history`, `property_holds` | versioned price lists, premium rules (corner +x %), full price & status history, development / transfer / possession / maintenance charges (optionally **taxed**, §5.2), reservation holds with auto-expiry |

*How this compares to Zameen.com.* A portal captures what a buyer needs to browse: purpose, type, location, area, price, installment/possession flags, bedrooms/bathrooms, feature checklists (main features, plot features, community, healthcare/recreation, nearby, business & communication), photos/video/floor plans. All of those have a home above. What the portal **does not** record, and a dealer must — title and registry numbers, the ownership chain, encumbrances, valuations, inspections, utility meters, rent roll, internal cost/charges and taxes, price history, holds, consignment ownership, map geometry — is exactly what the remaining groups add. *(The portal's field list here is from general knowledge of the site, not a scrape; compare against the live site when building the Zameen import/sync.)*

- **Rules enforced in the database (`core.sql`, tested):** one live booking per property; one current owner per property; one cover photo; one active tenancy; one open listing per channel; amenity unique per property and must carry a value; latitude/longitude and room counts range-checked; one row per property in each 1:1 detail table.
- **Other rules:** status machine `available → reserved → sold`, `available ↔ blocked`, `rented`; reservation expiry job releases holds; price change above X % needs `approve`; bulk price update = one audited batch with preview and undo window; marla→sq-ft factor is a company setting.
- **Project level (unchanged):** `projects, project_phases, project_blocks, project_approvals, land_parcels, land_acquisitions, project_documents` — NOCs and approvals tracker, land purchase records (khasra / registry / mutation) feeding project cost.
- **Plot map:** PostGIS `geometry(Polygon, 4326)` per property + project boundary; import GeoJSON/KML/CAD layouts; status-colored tiles.

### 6.4 Sales: quotations → bookings → installments → receipts
- **Has:** Quotations, Deals/Bookings with installment list, Sales Invoices, Service Invoices, Post-dated cheques, Contracts.
- **Record\*:**
  - **Quotation:** versions, line items (price, discount, development charges, premium), validity, conversion link, sent/viewed tracking.
  - **Booking (sale agreement):** list price, discounts (reason, approver), development/utility/possession charges, **down payment**, payment plan template used, dealer & commission terms, sales agent, joint owners, nominee, token/advance reference, **file number**, booking form PDF, status history.
  - **Payment plans\***: reusable *plan templates* (down payment %, N monthly, balloon every 6 months, possession payment) that generate the installment schedule; edits create a *rescheduling* record (old vs new schedule, approver).
  - **Installments:** kind, due date, amount, paid, status; **late-payment surcharge** rules (grace days, % or flat, cap) producing `penalty_charges`; waivers with approver.
  - **Receipts:** amount, customer, booking, print/WhatsApp copy, void with reason (reverses the journal). **Split tenders** — one receipt can be paid by several instruments (`receipt_tenders`: cash + cheque + online; they must add up to the receipt). **Allocation** — one receipt settles any mix of installments, penalties, sales invoices and service invoices (`receipt_allocations`, exactly one target per row), or is held as advance. Several receipts/vouchers can also be grouped as a **combined transaction** (§5.3).
  - **Cheques (PDC):** register by bank/branch/cheque no/date, linked to installment(s); lifecycle `in_hand → deposited → cleared | bounced`, deposit/clear/bounce dates, bounce reason & charges, replacement cheque link; reminders before cheque date; auto-posting on clear.
  - **Transfer of ownership\*:** seller→buyer, transfer fee, applicable taxes, NOC/transfer letter, approvals, new ledger; keeps the full ownership chain.
  - **Cancellation/refund\*:** policy (deduction %, forfeiture), refund schedule, approver, journal entries; property returns to `available`.
  - **Possession\*:** handover date, checklist, documents, dues cleared flag.
  - **Commissions\*:** commission rules (% / flat / slabs per dealer or project), accrual trigger (on booking / on X% received), commission statements, payout vouchers, clawback on cancellation.
  - **Sales/service invoices:** lines + tax, recurring billing schedules (maintenance per month/quarter), credit notes, aging.
  - **Contracts:** template library (sale/lease/dealer agreements) with merge fields → generated PDF; parties; start/end/renewal; **expiry alerts**; signed copy upload; e-sign integration later.
- **State machines:** Booking `pending → confirmed → completed | cancelled`; Quotation `draft → sent → accepted → converted | expired`; Cheque as above; Receipt `posted → void`.
- **Key invariants (in `core.sql`):** one live booking per property; allocations never exceed the receipt; tenders add up to the receipt; installment/penalty/invoice `paid ≤ amount` and status derived from allocations. **Tax** on bookings, invoices and transfers is applied from the admin-defined rules (§5.2).
- **Tables:** `quotations, quotation_lines, bookings, booking_parties(joint owners), booking_nominees, payment_plan_templates, payment_plan_template_items, installments, installment_reschedules, penalty_rules, penalty_charges, waivers, receipts, receipt_tenders, receipt_allocations, cheques, cheque_events, property_transfers, booking_cancellations, possessions, commission_rules, commissions, sales_invoices, sales_invoice_lines, service_invoices, billing_schedules, credit_notes, contract_templates, contracts, contract_parties`.

### 6.5 CRM (leads & follow-ups)
- **Has:** Kanban pipeline, sources, assigned agent, follow-up date, WhatsApp action.
- **Record\*:** lead (budget range, interest type/project/size, timeline, source + **campaign** + referrer, city, lost reason), **activities** (call, WhatsApp, meeting, **site visit** with outcome and who accompanied), tasks/reminders with due date and assignee, stage history (time-in-stage analytics), lead score (rule-based now, ML later), duplicate detection (same phone/CNIC → merge or flag), assignment rules (round-robin by source/project/city), **conversion** to customer + booking with attribution, marketing campaigns (spend → cost per lead/booking), WhatsApp conversation log (via Cloud API webhooks), consent/opt-out.
- **Rules:** stage moves are logged; "Won" requires a booking link; "Lost" requires a reason; agents see only own/team leads (data scope).
- **Tables:** `leads, lead_stage_history, lead_activities, tasks, campaigns, campaign_spend, lead_assignment_rules, site_visits, conversations, messages`.

### 6.6 Procurement, expenses & payables\*
- **Has:** Expenses (title, type, amount, paidVia, paid/unpaid, project).
- **Record\*:** vendors (a party role) with payment terms; **purchase requests → purchase orders → goods receipt → vendor bill → payment**; bill lines with expense account/project/cost center/tax; attachments (invoice photo); recurring expenses; petty-cash float & replenishment; expense categories mapped to GL accounts; budget control at PO/bill entry (§5.5); approval thresholds.
- **Rules:** three-way match optional (PO/GRN/bill); bill cannot exceed approved PO without re-approval; unpaid bills drive the "follow-up" flag; payment = voucher allocation against bills (partial payments allowed).
- **Tables:** `vendors(party_role), purchase_requests, purchase_orders, po_lines, goods_receipts, vendor_bills, bill_lines, bill_payments, expense_categories, petty_cash_floats, recurring_templates`. **Budgets live in their own module (§5.5):** an approved purchase order becomes a *budget commitment*, a paid bill becomes *actual*, and `app.check_budget()` runs before a PO or bill is accepted.

### 6.7 Construction & project costing
- **Has:** Contractors, construction contracts (value, paid ratio, retention, progress), assign contractor to project.
- **Record\*:** **BOQ / work packages** (cost code, quantity, rate, amount), contract line items, **interim payment certificates (IPC / running bills)** with measured progress, advance payment & recovery, **retention** held/released, deductions (penalty, material issued), **variation orders**, milestone schedule & actual progress %, site-visit/progress reports **with photos**, contractor performance rating & history, insurance/guarantee/bank-guarantee expiry, material issue (from stock) to contract, final account/closure, project-level S-curve (planned vs actual spend), **cost to complete**.
- **Rules:** cumulative IPC ≤ contract value + approved variations; retention % applied per bill; IPC approval chain; completed contract locks.
- **Tables:** `contractors(party_role), construction_contracts, contract_items, ipcs, ipc_lines, retention_ledger, variation_orders, milestones, progress_reports, progress_photos, contractor_ratings, guarantees, material_issues`.
- **Inventory of materials\* (Phase 3):** `stock_items, warehouses, stock_movements, stock_valuation` (moving-average cost) so cement/steel purchases flow to project cost.

### 6.8 HR, attendance, leave & payroll
- **Has:** Staff list, salary, adjustments (increment/deduction/allowance/loan) with approval, leave requests.
- **Record\*:**
  - **Employee file:** employee no., CNIC, DOB, designation, department, branch, manager, join/probation/confirmation/exit dates, employment type, bank/IBAN, emergency contact, documents (contract, CNIC, degrees), assets issued.
  - **Salary structure:** components (basic, house rent, conveyance, medical, fuel, commission) effective-dated; increments history (already modeled as adjustments — keep as a *history*, not just a flag).
  - **Attendance:** daily check-in/out (web/mobile with optional geo-fence for field agents, biometric CSV import), shifts, late/early rules, overtime, monthly summary.
  - **Leave:** policy per type, annual entitlement, **accrual & carry-forward**, balances, holiday calendar, half-day, approval chain.
  - **Payroll run\*:** monthly run (draft → reviewed → approved → disbursed → locked), per-employee payslip lines (earnings, deductions, tax, EOBI/social security **(verify rates)**, loan installments recovered, commission/bonus), **bank payment file** (CSV/IBFT), payslip PDF (WhatsApp/email), journal posting.
  - **Loans/advances:** principal, installments, recovery from payroll, outstanding.
  - **Sales targets & incentives:** per agent per month; achievement; incentive calculation feeding payroll.
- **Rules:** a locked payroll month is immutable (corrections go to next month); salary data field-restricted; leave overlap checks; approved increments apply from `effective_date`.
- **Tables:** `employees, departments, designations, salary_components, employee_salary_components, salary_history, shifts, attendance_logs, attendance_daily, holidays, leave_types, leave_policies, leave_balances, leave_requests, payroll_runs, payslips, payslip_lines, staff_loans, loan_installments, sales_targets, incentive_rules`.

### 6.9 Dashboard, reports & analytics
- **Has:** KPI tiles, collections chart, status donut, funnel; Reports (balance sheet, P&L, trial balance, ledger, sales, stock, expenses).
- **Record/serve\*:** `company_kpi_snapshots` (daily), materialized views for dashboard tiles (refreshed by worker), saved report definitions & filters, **scheduled reports** (email PDF/Excel), export jobs with audit, targets vs actuals, forecast tables (expected collections by month from the installment schedule — pure SQL, no AI needed).
- **Reports to build:** receivable ageing; **installment due/overdue (the daily collection sheet)**; collection efficiency; sales by project/agent/dealer/source; inventory valuation & unsold stock; project P&L and budget-vs-actual; cash-flow & cash forecast; commission statement; payroll register; contractor payable & retention; party statements; audit/exports log.

### 6.10 Billing (our own SaaS revenue)
- `plans, plan_limits, subscriptions, subscription_items(seats, companies, storage add-ons), usage_meters, saas_invoices, saas_payments, dunning_events, coupons`. Payment via local gateways (JazzCash/EasyPaisa/bank transfer/cards through a Pakistan-supported PSP **(verify availability)**). Limits enforced centrally by a `PlanGuard`; `lib/plan.ts` becomes a *projection* of this data.

---

## 7. Cross-cutting platform services (build once, reuse everywhere)

| Service | Data | Used by |
|---|---|---|
| **Audit log** | `audit_log` (append-only, monthly partitions) | every mutation, exports, PII reveals |
| **Documents/attachments** | `documents(id, storage_key, mime, size, sha256, uploaded_by, version)` + `document_links(entity_type, entity_id)` | KYC, contracts, bills, site photos, generated PDFs |
| **Comments/timeline** | `comments`, `activity_feed` (derived from audit) | any record page |
| **Approval workflow** | `approval_policies(doc_type, condition, steps)`, `approval_requests`, `approval_steps` | vouchers, leave, payroll, price changes, discounts, refunds, POs |
| **Notifications** | `notification_templates` (EN/UR), `notifications` (in-app), `outbound_messages` (channel, status, provider id, cost), user preferences, quiet hours | installment reminders, cheque due, approvals, contract expiry |
| **Tasks/reminders** | `tasks` | CRM follow-ups, collections, approvals |
| **Numbering** | `document_sequences` + `app.next_doc_no()` (in `core.sql`) | all documents |
| **Import/export** | `import_jobs` (file, mapping, row errors, dry-run) / `export_jobs` | migrating from registers/Excel; CSV/Excel downloads |
| **Templates & PDF** | `document_templates` (HTML, per company branding), `generated_documents` | receipts, vouchers, agreements, payslips, statements |
| **Outbox & webhooks** | `outbox_events`, `webhook_endpoints`, `webhook_deliveries` | reliable events (post-commit), customer integrations |
| **Custom fields / saved views / tags** | `custom_field_definitions`, `saved_views`, `tags`, `tag_links` | list pages |
| **Idempotency** | `idempotency_keys(key, request_hash, response)` | all money-moving POSTs |
| **Jobs** | pg-boss tables | reservation expiry, late-fee accrual, reminders, billing runs, snapshots |

**Messaging (Pakistan reality).** WhatsApp is the primary channel: use the **WhatsApp Business Cloud API** — outbound business-initiated messages must use pre-approved templates (installment due, receipt, cheque reminder) and are charged per conversation/message **(verify current Meta pricing)**; inbound/user-initiated replies within the 24h window are flexible. SMS via a local aggregator; email via Resend/Postmark. All three sit behind one `NotificationService` with provider adapters, retry with backoff, delivery receipts, per-company cost accounting.

---

## 8. Reporting & read performance

- Operational screens query normalized tables by `(company_id, …)` indexes.
- Heavy aggregates use: `account_balances` (ledger), **materialized views** (dashboard tiles, ageing), and `company_kpi_snapshots`; refreshed incrementally by the worker.
- Ad-hoc/BI: point **Metabase** (open source) or Superset at a **read replica** with the `readonly_reports` role (RLS still applies per company).
- Rule: no report may run against the primary for more than ~1 s; anything slower moves to the replica or a pre-aggregate.

---

## 9. Data quality & integrity checklist (what keeps an ERP trustworthy)

- DB constraints for every invariant that must never be false (done for ledger, bookings, receipts).
- Immutability of posted financial data; reversal-only corrections; period locking and fiscal-year close (closing entry to retained earnings, opening balances carried).
- **Reconciliation jobs** that run nightly and alert: Σ debits = Σ credits per company; Σ installment `paid_amount` = Σ allocations; customer receivable sub-ledger = GL control account; cash/bank GL = last bank-statement balance (bank reconciliation module records statement lines and matches them).
- Every import is a dry-run first with row-level errors; imported rows carry `import_job_id` for rollback.
- Seeded test data and a **demo-company generator** (the current mock data becomes the generator) for demos and e2e tests.

---

## 10. Scalability plan (scale when a metric says so)

**Sizing assumptions (assumption):** a mid-size dealer — 5k properties, 3k customers, ~40k installments, ~150k ledger lines/year, ~2M audit rows/year. 500 such companies ≈ 75M ledger lines, ~1B audit rows/10 years. That is comfortably single-primary Postgres territory with the steps below.

| Stage | Trigger | Actions |
|---|---|---|
| **0 — Day one** | always | Composite indexes **leading with `company_id`**; keyset pagination (no `OFFSET`); connection pooler; `EXPLAIN` review in CI for list endpoints; statement timeout; N+1 guard in the ORM layer. |
| **1 — Product-market fit** | p95 API > 300 ms or DB CPU > 60 % | Managed Postgres with PITR; **read replica** for reports/BI; Redis for permission/session cache and rate limits; move heavy jobs to a dedicated worker pool; CDN for static + signed file URLs. |
| **2 — Big tables** | `journal_lines`, `audit_log`, `outbound_messages` > ~100M rows | **Partition** `audit_log`/`outbound_messages` by month (already designed for `audit_log`), `journal_lines` by fiscal year (hash sub-partition by company if needed); archive partitions older than N years to cold storage (Parquet in object store); `account_balances` keeps reports instant regardless. |
| **3 — Many tenants / large tenants** | one tenant > ~20 % of load or contract requires isolation | Move that company's data to **its own database** (same schema, a `tenant_routing` table maps company → DSN; the API resolves the connection per request). Or adopt Citus (distribute by `company_id`). This works *because* every row already carries `company_id` and nothing joins across companies. |
| **4 — Analytics & services** | analytics queries hurt OLTP, or a module needs independent scaling | Stream changes (logical replication/CDC) to ClickHouse/BigQuery for analytics; extract `notifications` and `documents` first (clearest boundaries, outbox already in place). |

Reliability targets (assumption — agree with the client): RPO ≤ 5 min (WAL archiving), RTO ≤ 1 h, 99.5 % → 99.9 % availability as plans move up, zero-downtime migrations (expand → migrate → contract), blue/green deploys.

---

## 11. Free / low-cost starting stack

> Free-tier limits change often and I am recalling them from memory — **verify each on the provider's pricing page when signing up.** Rule of thumb that saves money *and* trouble: **free tiers are for development, demos and pilots with dummy or non-critical data. A paying client's financial records need real backups and no auto-pause.**

### 11.1 Recommended path
| Stage | Stack | Approx. cost |
|---|---|---|
| **A. Build & demo (now)** | **Supabase free** (Postgres + Auth + Storage, RLS-friendly, PostGIS) *or* **Neon free** (serverless Postgres, branching — great for per-PR databases) · API on **Render/Koyeb free** web service (sleeps when idle) or inside Next.js route handlers while tiny · UI on **Netlify/Cloudflare Pages** (project already has `netlify.toml`) · **Cloudflare R2** (10 GB free, no egress fees) · **Resend** free email · **Sentry** free · **GitHub Actions** CI · **UptimeRobot/Better Stack** free monitoring | **$0** |
| **B. First paying client** | Managed Postgres paid tier with PITR (Supabase Pro / Neon Launch / Railway / DigitalOcean managed) · always-on API (Fly.io / Render / Railway / small VPS) · R2 · nightly dump to a second provider | **≈ $30–70 / month** |
| **C. Growth** | Dedicated Postgres + read replica, Redis (Upstash), worker nodes, Grafana Cloud, WhatsApp/SMS usage billed through to clients | scales with revenue |

Other free options worth knowing: **Oracle Cloud "Always Free"** (large ARM VM — can self-host Postgres + API for $0, but capacity is hard to obtain and *you* own backups/patching); **Backblaze B2** (10 GB free) as the second-provider backup target; **Metabase** (free, self-hosted) for BI; **Typesense/Meilisearch** (OSS) if search outgrows Postgres; **Gotenberg** (OSS) for PDFs; **Keycloak** (OSS) if you later want self-hosted SSO. Caveat on Vercel: its free *Hobby* plan is for **non-commercial** use — use Netlify/Cloudflare Pages or Vercel Pro for a commercial product **(verify terms)**.

### 11.2 "Start with some organization data" — the starter data pack
Whichever host is chosen, a new company should be useful on day one. Ship these as **seed files applied by the "Create company" wizard** (idempotent, versioned, in `db/seeds/`):

| Seed | Content | Source |
|---|---|---|
| Chart of accounts | The 2-2-2-4 levelled chart already written in `lib/chart-of-accounts.ts`, plus control-account flags and default posting rules | existing code |
| Roles & permissions | The 7 default roles in `lib/mock-data/roles.ts` | existing code |
| Geography | Provinces, divisions, districts, major cities (+ lat/long) | open data (OpenStreetMap/GADM/Pakistan Bureau of Statistics) |
| Banks | List of Pakistani banks/branches for cheques & IBAN validation | State Bank of Pakistan published lists |
| Property taxonomy | Categories, sizes (3/5/7/10 marla, 1/2 kanal…), conversion factors, plot attributes | domain knowledge (configurable) |
| Lead sources & stages | Facebook, WhatsApp, Zameen.com, OLX, referral, walk-in; the 5 pipeline stages | existing UI |
| Leave & HR | Leave types, public-holiday calendar template, salary components | policy (client-editable) |
| Payment-plan templates | e.g. 20 % down + 24 monthly; 30 % down + 12 quarterly; cash | domain knowledge |
| Tax rules | Placeholders **marked "needs accountant confirmation"** | accountant |
| Document templates | Receipt, voucher (CPV/CRV/BPV/BRV/JV), booking form, sale agreement, installment schedule, statement, payslip — bilingual | designed with the client |
| Demo company | Today's `lib/mock-data/*` converted to a generator so sales demos and e2e tests use realistic data | existing code |

**Migrating a real client's existing data:** build the CSV importer early (§7) with templates for customers, properties, bookings+installments, opening balances (trial balance as of cut-over date) and staff. Most dealers arrive with Excel registers — the importer *is* the onboarding experience.

---

## 12. Where AI genuinely helps (and what data to capture from day one)

Capture the data now; build the features after the core is stable.

| Feature | Needs | Notes |
|---|---|---|
| **Collections risk scoring** — which customers will miss the next installment | installment history, call/visit outcomes, cheque bounces | start rule-based (SQL), graduate to gradient boosting once ~12 months of data |
| **Lead scoring & next-best action** | lead activities, source, budget, stage durations | rules → ML |
| **WhatsApp assistant** — answer "my balance / next due date / receipt copy" | party ledger, messages log | strictly read-only tools scoped to that customer |
| **Document extraction** — CNIC/cheque/bill OCR → pre-filled forms | `documents` + extraction results + human-confirmed fields (training signal) | confirm before saving |
| **Natural-language reports** ("collections by project last quarter") | read-only SQL views, schema description | run as `readonly_reports` role with RLS + row limits + audit; never raw write access |
| **Anomaly detection** — duplicate bills, unusual vouchers, off-hours edits, discount outliers | `audit_log`, ledger | great for owner trust |
| **Semantic search over contracts/notes** | `pgvector` embeddings of documents | tenant-filtered |
| **Price suggestion** | price history, sales velocity per block | advisory only |

Safety: all AI calls are tenant-scoped, logged, rate-limited, and never receive another company's data; PII minimized/redacted in prompts.

---

## 13. Delivery roadmap

Relative effort, **assumption:** 2–3 engineers + 1 designer/QA.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Foundations** (2–3 wks) | Monorepo, CI, Postgres + migrations (`core.sql` as baseline), auth, orgs/companies/membership, RLS context middleware, RBAC guards, audit log, files, numbering, observability, OpenAPI client generation, seeds | Log in, switch company, create/read a record, RLS test suite green |
| **1 — Core money & sales** (6–8 wks) | Parties, projects, properties, price lists, quotations, bookings, installments, receipts + allocation, cheques, vouchers + approvals, journal posting rules, trial balance/ledger, party statements, PDF receipts, CSV import (customers, properties, opening balances) | A real dealer can run daily collections and see correct books |
| **2 — People & CRM** (4–5 wks) | CRM pipeline/activities/tasks, WhatsApp/SMS/email notifications, employees, attendance, leave, payroll run + bank file | Payroll month closes; reminders sent automatically |
| **3 — Projects, procurement, maps** (5–6 wks) | Budgets, vendors/POs/bills, contractors/BOQ/IPC/retention, project costing, PostGIS plot map, commissions & transfers/cancellations | Project P&L and budget-vs-actual match the ledger |
| **4 — Scale-out & intelligence** (ongoing) | SaaS billing/limits, client portal, scheduled reports, report builder, replica/BI, AI features (§12), API/webhooks | Self-serve onboarding; first AI feature live |

**Testing strategy.** (1) DB tests like `smoke-test.mjs` for every invariant; (2) service tests with a real Postgres (Testcontainers/PGlite), never mocks, for posting rules; (3) **property-based tests** on the ledger (random valid documents ⇒ trial balance always balances); (4) tenant-isolation tests that run each endpoint as company B against company A's ids and expect 404; (5) Playwright e2e on the demo-company; (6) migration tests applied to a copy of production before every deploy.

---

## 14. Risks & questions to settle with the client before building

1. **Taxes — *answered:* an admin-facing tax section.** The admin defines tax codes, effective-dated rates, bundles and assignment rules for revenue and anything else (§5.2). *Still to confirm with the accountant:* the actual taxes/rates/bases to load, who files, and the **revenue-recognition policy** (on booking / full payment / possession) — a company setting that drives posting rules.
2. **Multi-company & combined transactions — *answered:* "there should be the option of combined transactions".** Designed as (a) combined transactions inside a company (one event settling several documents, split tenders, contra) and (b) inter-company transactions with consolidated statements across the group (§5.3–5.4). *Please confirm that this matches what was meant* — if "combined" meant only one of the two, the other can be deferred. *Still open:* do companies share staff, customers or bank accounts, and is currency translation needed?
3. **Budgets — default policy.** Should new project budgets default to *Warn* or *Block*? Who approves a budget and a revision (CFO only, or CEO above a threshold)? Is the operating budget annual only or also quarterly re-forecast? Are unspent balances carried forward? (All are settings, not code — but the client should choose the defaults.)
4. **Who owns the data on exit?** Export format and retention policy for cancelled subscriptions.
5. **Offline use:** do site agents need to work without internet? (Changes the client architecture — PWA + sync queue.)
6. **Regulatory documents:** which approvals/registries must be tracked per project (NOC, layout approval, registry/transfer paperwork), and are digital signatures or e-stamping required?
7. **Integrations:** accounting-package export (e.g. for the client's auditor), bank statement import formats, FBR/provincial portals, portals like Zameen for lead intake.
8. **Hosting residency & compliance:** any requirement to host data in Pakistan? That changes provider choice (§11).
9. **Volume:** number of companies, properties, bookings, and concurrent users in year 1 — to validate the sizing in §10.

---

### Appendix A — Entity list by module (quick index)

*Platform:* organizations, companies, users, org_members, roles, role_permissions, company_members, invitations, sessions, api_keys, settings, feature_flags, posting_rules, numbering_formats, audit_log, documents, document_links, comments, tags, tag_links, approval_policies, approval_requests, approval_steps, notification_templates, notifications, outbound_messages, tasks, import_jobs, export_jobs, document_templates, generated_documents, outbox_events, webhook_endpoints, webhook_deliveries, custom_field_definitions, saved_views, idempotency_keys.
*Accounting:* fiscal_years, accounting_periods, gl_accounts, cost_centers, journal_entries, journal_lines, account_balances, vouchers, voucher_lines, combined_transactions, combined_transaction_items, bank_statements, bank_statement_lines, bank_reconciliations, recurring_vouchers, opening_balances.
*Parties:* parties, party_roles, party_contacts, party_addresses, party_documents, party_bank_accounts, party_relationships, blacklist_entries.
*Projects & Properties (35):* projects, project_phases, project_blocks, project_approvals, land_parcels, land_acquisitions, project_documents; property_types, properties, property_locations, property_dimensions, property_geometries, property_plot_specs, property_building_specs, property_commercial_specs, amenity_catalog, property_amenities, property_utilities, property_nearby_places, property_media, property_legal, property_documents, property_ownership_history, property_encumbrances, property_valuations, property_inspections, property_tenancies, property_listings, property_charges, price_lists, price_list_items, pricing_rules, property_price_history, property_status_history, property_holds.
*Tax Management (11):* tax_authorities, tax_codes, tax_rates, tax_groups, tax_group_items, tax_assignments, party_tax_exemptions, document_taxes, tax_returns, tax_return_lines, tax_payments.
*Multi-Company & Consolidation (10):* intercompany_accounts, intercompany_transactions, consolidation_groups, consolidation_members, group_accounts, group_account_map, consolidation_runs, consolidated_balances, elimination_entries, elimination_lines.
*CRM:* leads, lead_stage_history, lead_activities, campaigns, campaign_spend, lead_assignment_rules, site_visits, conversations, messages.
*Sales:* quotations, quotation_lines, bookings, booking_parties, booking_nominees, payment_plan_templates(+items), installments, installment_reschedules, penalty_rules, penalty_charges, waivers, receipts, receipt_tenders, receipt_allocations, cheques, cheque_events, property_transfers, booking_cancellations, possessions, commission_rules, commissions, sales_invoices(+lines), service_invoices, billing_schedules, credit_notes, contract_templates, contracts, contract_parties.
*Budgeting & Control (13):* budget_templates, budget_template_lines, budgets, budget_lines, budget_line_periods, budget_snapshots, budget_revisions, budget_revision_lines, budget_commitments, budget_exceptions, budget_alert_rules, budget_alerts, budget_forecasts.
*Procurement:* purchase_requests, purchase_orders, po_lines, goods_receipts, vendor_bills, bill_lines, bill_payments, expense_categories, petty_cash_floats, recurring_templates, stock_items, warehouses, stock_movements.
*Construction:* construction_contracts, contract_items, ipcs, ipc_lines, retention_ledger, variation_orders, milestones, progress_reports, progress_photos, contractor_ratings, guarantees, material_issues.
*HR/Payroll:* employees, departments, designations, salary_components, employee_salary_components, salary_history, shifts, attendance_logs, attendance_daily, holidays, leave_types, leave_policies, leave_balances, leave_requests, payroll_runs, payslips, payslip_lines, staff_loans, loan_installments, sales_targets, incentive_rules.
*Reporting/Billing:* company_kpi_snapshots, saved_reports, report_schedules, plans, plan_limits, subscriptions, subscription_items, usage_meters, saas_invoices, saas_payments, dunning_events, coupons.

### Appendix B — What `docs/schema/core.sql` already proves

Run `node docs/schema/smoke-test.mjs` (after `npm i --no-save @electric-sql/pglite`) — **99 checks** against a real Postgres engine:

- **Ledger:** unbalanced entries rejected · debit-xor-credit lines · posted rows append-only (only "mark reversed" allowed) · group accounts and locked periods unpostable · account balances roll up by trigger · gapless numbering per period.
- **Sales:** one live booking per property (re-bookable after cancel) · generated `net_price` · allocation marks installments paid/partial · over-allocation rejected.
- **Tenant isolation:** own rows visible, another company's invisible, no context ⇒ nothing, cross-company insert refused · CNIC unique per company but allowed across companies.
- **Properties:** a house with location, dimensions, rooms, amenities, utilities, legal and valuation joins cleanly · duplicate/valueless amenity, negative bedrooms, out-of-range GPS rejected · one detail row per property · one cover photo · exactly one current owner (ownership chain closes and reopens) · one active tenancy · one open listing per channel (many channels allowed).
- **Receipts:** one receipt with three tenders settling an installment + invoice + service invoice (all marked paid) · tenders that don't add up rejected · allocation must have exactly one target.
- **Combined transactions:** items add up to the total · contra nets to zero · both violations rejected.
- **Tax:** codes, effective-dated rates, slabs and bundles defined by the admin · overlapping rate periods rejected · exactly one of percent/flat/slabs · rate depends on date (16 % → 18 %) and filer status (3 % vs 6 %) · ordered compound bundle (600,000 then 1,696,000 on 10,600,000) · progressive slabs (40,000 on 2.5 M) · assignment rule and per-document tax record.
- **Inter-company & consolidation:** visible to both companies, hidden from a third · one call posts both sides atomically with each company seeing only its own side · cannot be posted twice or by a non-party · consolidated cash nets to zero and inter-company receivable/payable eliminate to zero · other organizations see nothing.
- **Budgeting:** total rolls up from lines · one live budget per project · project budget must name its project · monthly phasing must add up (and is rescaled on revision) · no skipped status steps · creator cannot approve · approval stores a v1 snapshot · approved lines cannot be edited or added to directly · *actual* is read from the ledger for the right project only · open purchase orders reduce what is available and stop counting once invoiced · control returns allow / warn / block with the over-by amount · no budget or out-of-period date ⇒ nothing to enforce · you cannot approve your own exception · alerts fire once per threshold (85 %, 100 %) and never duplicate · revisions: requester cannot approve, reallocation moves money and keeps the total, must net to zero, supplementary raises the total, version and snapshots advance · other companies see no budget data.
