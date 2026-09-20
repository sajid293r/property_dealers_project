# Tech Stack & Architecture

## Framework
- **Next.js 14+ (App Router)** with **TypeScript** — scalable, supports the future move from mock data to real API routes/server actions without changing the frontend architecture.
- **React Server Components** by default; `"use client"` only where interactivity/animation requires it.

## Styling & UI
- **Tailwind CSS** for utility styling, with a custom design-token theme (see [`DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md)) rather than default Tailwind palette/fonts.
- **shadcn/ui** (Radix primitives) as the accessible component base — copied into the repo (`components/ui`) so we fully own and restyle every component instead of fighting a third-party design system.
- **Framer Motion** for page transitions, staggered list reveals, hover/tap micro-interactions, modal/drawer animation.
- **lucide-react** for iconography.
- **next-themes** for light/dark mode.
- **Tremor** or **Recharts** for charts (final pick during dashboard build; styled per the `dataviz` design rules — no default chart-library look).

## Forms, tables, data
- **React Hook Form + Zod** for all forms (bookings, unit entry, staff, etc.) with schema validation.
- **TanStack Table** for the data-grid heavy screens (unit lists, ledgers, deal lists) — sorting, filtering, pagination like the reference app's list toolkit, but styled to our own system.
- **TanStack Query** wrapping the mock data layer, even though data is local — this means swapping mock handlers for real API calls later is a one-line change per hook, not a rewrite.

## Data layer (prototype stage)
- No real database. All "records" live in `lib/mock-data/*.ts` (typed fixtures: units, deals, staff, accounts, expenses, leads, contracts...).
- A thin **service layer** (`lib/services/*.ts`) exposes functions like `getUnits()`, `createDeal()` that currently read/write the in-memory mock store, simulating latency. Screens call the service layer via TanStack Query hooks — never the mock arrays directly. This is the seam where a real backend (Postgres/Prisma + REST or server actions) plugs in later.
- Subscription tier is a client-side setting (a "plan switcher" in the demo header) that gates which nav items/features render, using a single `lib/plan.ts` feature-flag map driven by `FEATURES.md`.

## Project structure (planned)
```
app/
  (marketing)/            # public landing + pricing page
  (auth)/                 # login/signup screens (UI only, no real auth)
  (dashboard)/
    dashboard/
    crm/
    inventory/
    deals/
    accounts/
    accounting/
    staff/
    payroll/
    expenses/
    reports/
    settings/
components/
  ui/                     # shadcn primitives, restyled
  charts/
  layout/                 # sidebar, topbar, shell
lib/
  mock-data/
  services/
  plan.ts                 # subscription tier -> feature map
  utils/
```

## Tooling
- ESLint + Prettier, TypeScript strict mode.
- pnpm as package manager (fast installs; falls back to npm if unavailable in this environment).

## Not included yet (future real-backend phase)
Prisma schema + Postgres, real auth (NextAuth/Clerk), payment gateway (JazzCash/EasyPaisa/Stripe), WhatsApp Business API, real PDF generation (e.g. `@react-pdf/renderer` or a server-side PDF service), file/image upload storage (S3/Cloudinary).
