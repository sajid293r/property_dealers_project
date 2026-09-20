# Execution Plan

See also: [`CONTEXT.md`](CONTEXT.md) · [`FEATURES.md`](FEATURES.md) · [`TECH_STACK.md`](TECH_STACK.md) · [`DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md)

## Phase 0 — Planning (this step)
- [x] Audit reference product (Munshi On Click feature map).
- [x] Define subscription tiers & feature gating (`FEATURES.md`).
- [x] Define tech stack (`TECH_STACK.md`) and design direction (`DESIGN_GUIDELINES.md`).

## Phase 1 — Project scaffold & design foundation
- Scaffold Next.js (TypeScript, Tailwind, App Router, ESLint).
- Install shadcn/ui, Framer Motion, TanStack Query/Table, React Hook Form + Zod, lucide-react, next-themes.
- Lock design tokens: colors (light+dark), type scale, spacing, radii, shadows in `app/globals.css` + `tailwind.config`.
- Build the app shell: sidebar navigation, topbar (account balance/cash tickers, notifications, profile), plan switcher (Basic/Moderate/Premium demo toggle), light/dark toggle.
- Build the public marketing/landing page + pricing page (this is the sales surface for the subscription model).

## Phase 2 — Core data & mock layer
- Define TypeScript models for: Unit, Deal/Booking, Installment, Customer, Lead, Staff, Account, Transaction, Expense, Contract, Report.
- Build mock data fixtures + service layer + TanStack Query hooks (see `TECH_STACK.md`).
- Build `lib/plan.ts` feature-flag map wired to the sidebar/route guards so tiers actually gate UI.

## Phase 3 — Module build-out (Basic → Moderate → Premium)
Build in this order so every tier is demoable incrementally:
1. Dashboard (KPI tiles, trend charts)
2. Inventory/Units (catalogue, filters, bulk price update)
3. Deals & Bookings (booking flow, installment schedule)
4. Accounts (ledgers, transfers, statements)
5. CRM (leads pipeline, follow-ups) — Moderate+
6. Staff & Payroll — Moderate+
7. Expenses
8. Reports
9. Contracts — Moderate+
10. Interactive plot map — Premium
11. Settings (roles/permissions, company profile, templates)

## Phase 4 — Polish pass
- Motion pass (page transitions, staggered reveals, counters) per `DESIGN_GUIDELINES.md`.
- Empty/loading/error states for every screen.
- Full responsive/mobile pass.
- Accessibility pass (keyboard nav, contrast, focus states).

## Phase 5 — Review & iterate
- Walkthrough against `FEATURES.md` tier matrix to confirm gating is correct end-to-end.
- Gather feedback, adjust before any real-backend investment.

## Explicitly deferred (post-prototype)
Real auth, real multi-tenant DB (Postgres/Prisma), payment/billing integration for subscriptions, real WhatsApp/SMS gateway, real PDF generation, file storage — tracked in `TECH_STACK.md` "Not included yet".
