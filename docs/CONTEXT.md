# Context — Property Dealer ERP/CRM

## Business goal
Build a modern ERP/CRM SaaS for **property dealers** (real estate agencies, plot/housing-scheme sellers) in Pakistan. Sold as a subscription (**Basic / Moderate / Premium**) where higher tiers unlock more modules and capacity. Initial go-to-market is the local Pakistani market.

## Reference product: Munshi On Click
A business contact of the founder runs on **munshionclick.com**, a white-label multi-industry ERP/POS platform (13 industry presets — Mobile Shop, Housing Scheme, Fast Food, Tower, etc.). The audited tenant runs the **Tower/real-estate preset**. Full feature audit lives at the artifact linked in project chat; the module list is captured in [`FEATURES.md`](FEATURES.md).

Key takeaways from the audit:
- It is functionally rich (double-entry accounting, plot mapping, payroll, CRM pipeline, 82 PDF templates, SMS/QR, bilingual EN/UR fields, full role/permission matrix) but **visually dated** — dense admin-panel UI, two overlapping/confusing nav systems (V1 module-first, V2 CRM-first), no motion/polish.
- It proves out *what* a Pakistani property dealer actually needs day-to-day: plot inventory with installment sales, dealer/staff ledgers, cash & bank books, confirmation/approval workflow, contract expiry tracking, and a real interactive plot map.

## Our differentiation
- **Functional parity or better** on the modules that matter for property dealers (see FEATURES.md), consolidated into **one coherent navigation** instead of two competing menus.
- **Dramatically better design**: a distinct, premium visual identity (not a reskin of the reference), animation/micro-interaction polish, dark mode, mobile-first responsiveness.
- **Localized for Pakistan**: PKR currency formatting, CNIC fields, per-Marla/per-Sq-ft pricing, Urdu/English bilingual toggle, WhatsApp-first communication (WhatsApp is the dominant channel in Pakistan, more relevant than plain SMS).
- **Subscription-gated feature architecture** baked in from day one, not bolted on later.

## Current phase
Prototype only:
- **Dummy/mock data**, no real multi-tenant backend, no real auth, no payment gateway.
- Goal is to validate product scope, information architecture, and — most importantly — get the design language right before investing in a production backend.
- Code should still be structured so a real backend (Postgres + Prisma, real auth, real billing) can be swapped in later without a rewrite (data access behind service functions, not scattered fetches).

## Target user personas
1. **Independent property dealer / small agency** (1–3 people) — Basic tier.
2. **Growing agency with staff & multiple active projects/housing schemes** — Moderate tier.
3. **Established developer/dealer network with dealers, commissions, multi-branch operations** — Premium tier.
