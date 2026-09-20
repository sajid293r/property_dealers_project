# Design Guidelines

The single biggest gap vs. the reference product (Munshi On Click) is design. This is the constraint every screen gets judged against: **it should look like it was designed by a senior product designer for a premium SaaS**, not like a generic admin template.

## Principles
1. **One coherent nav, not two.** The reference app has competing V1/V2 menus reaching the same data. We ship a single, well-organized sidebar with clear module grouping (Overview, Sales & CRM, Inventory, Finance, People, Reports, Settings).
2. **Distinct visual identity.** Not a clone of any reference theme. A custom palette, custom type pairing, and a recognizable "signature" (e.g. a specific card treatment, a distinctive way we render money/status, a consistent icon-in-tile pattern) that makes screenshots instantly identifiable as this product.
3. **Motion with restraint.** Framer Motion for: page/route transitions, staggered entrance of list/grid items, hover elevation on cards, animated number counters on KPI tiles, smooth accordion/drawer/modal transitions. Never motion that delays the user from acting — everything under ~250ms, easing curves, no bouncy toy animations on a finance app.
4. **Data-dense but not cluttered.** Property dealers live in tables and ledgers — the reference app's list toolkit (filters, bulk actions, export, pagination) is good UX to keep, but re-skinned with generous spacing, clear typographic hierarchy, and subtle dividers instead of default admin-grid borders-everywhere.
5. **Dark mode is first-class**, not an inverted afterthought — separate token tuning for both themes.
6. **Mobile-first responsiveness.** Agents check plot availability and post payments from their phone on-site.
7. **Empty, loading and error states are designed, not default.** Skeletons for tables/cards, tasteful empty-state illustrations/copy, toast notifications for every mutation.

## Direction to start from
- **Type pairing**: a refined serif or high-contrast display face for headings/large numbers (money, KPI figures) paired with a clean grotesque/humanist sans for UI text and tables — mirrors how confident fintech/proptech products signal trust (large legible numerals matter a lot here since this is a money-heavy app).
- **Palette**: a deep, grounded primary (avoid generic SaaS blue/purple) with one warm accent for positive/gold-standard actions (e.g. "sold", "confirmed"), calm neutral surface tones, and clear semantic colors for status (available/reserved/sold, paid/unpaid/overdue). Full palette + tokens to be finalized and locked in `app/globals.css` as CSS variables (light + dark) before any screen is built, so every component pulls from the same token set.
- **Elevation**: soft, low-opacity shadows + 1px hairline borders rather than heavy drop shadows or skeuomorphism.
- **Density modes**: comfortable by default; a "compact" density toggle for power users on data-heavy list screens (a genuinely useful upgrade over the reference app).

## What we deliberately do NOT copy from the reference app
- Two overlapping navigation systems.
- Dense, default-admin-template look (heavy borders, cramped spacing, unstyled default form controls).
- Non-localized currency/number formatting.

## What we DO keep functionally (because it's genuinely good UX for this domain)
- The list-page toolkit pattern: All/Archived tabs, filters, bulk select + bulk actions, CSV/PDF export, column search — just redesigned.
- The interactive plot map concept (Premium tier) — re-imagined with a cleaner, modern map/plot-grid visualization.
- Per-record ledger view (a unit/customer/staff member as a mini financial statement).
