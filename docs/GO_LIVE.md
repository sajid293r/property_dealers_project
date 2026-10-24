# Going live — checklist

What is wired to real data today, what is not, and the steps to put the product in front of a first customer.

## 1. What a real company can use today

Signed-in users of a real company see only the pages their plan includes (the menu hides the rest; the server refuses them too).

| Plan | Pages |
|---|---|
| **Basic** — PKR 12,000/month, 3 users | Dashboard, Projects, Properties, Customers, Deals & Bookings, Accounts, Vouchers (cash, bank, journal, contra), Expenses, Reports, Administration (users, standard roles, company profile) |
| **Professional** — PKR 22,000/month, 10 users | + Leads, Quotations, Sales Invoices (and credit/debit notes), Service Invoices, Post-dated cheques, Bank Reconciliation, Contracts, Contractors, custom roles |
| **Advanced** — PKR 40,000/month, 20 users | + Budgets, Staff, Leave, Payroll, Plot Map |

**Extra seats** can be added to any plan: +3 seats PKR 4,000, +5 seats PKR 6,000, +10 seats PKR 8,000 per month. Support records them with `update organizations set extra_seats = … where slug = '…'`.

**Also in every plan:** printable receipts, vouchers, invoices, statements, payment plans, quotations, agreements and payslips (Print → Save as PDF); CSV export (opens in Excel) on every list; file attachments (4 MB each) on customers, properties, bookings, vouchers, contracts, cheques, staff and contractor agreements; property detail pages (legal, ownership chain, liens, valuations, price history); collection reminders (WhatsApp message in English or Urdu, call log); late-payment charges with a company rule; refunds on cancelled bookings; booking transfers; dealer commission; activity log; forgot-password and My account.

**Not built yet (hidden from real companies, still in the demo):** Settings/Billing, Group overview. Plans are changed by PropIQ support (`update organizations set plan = …`), there is no self-service billing yet.

## 2. Before the first customer logs in

1. **Rotate secrets that were shared in chat or notes:** the Supabase owner database password, the `propiq_app` password, and the test user's password. Put the new values only in the host's secret store.
2. **Back up `api/.env` keys:** `CNIC_HMAC_KEY` and `CNIC_DATA_KEY`. Losing the data key makes stored CNICs unreadable; changing the HMAC key breaks duplicate-CNIC detection. Never rotate casually.
3. **Supabase dashboard:** *Authentication → Sign In / Providers*: keep *Email* on and *Allow new users to sign up* on (invited staff create their own sign-in at `/login`); turn the *Data API* off (the app only talks to our API); in *Authentication → URL configuration* set the site URL and add the website's address to the redirect list; turn on email confirmation and a strong password policy; enable daily backups (paid plan) or schedule `pg_dump`.
4. **Confirm with the client's accountant:** the chart of accounts (85 accounts), the fiscal year (July–June), tax codes/rates, and the revenue-recognition policy (receipts currently credit *Customer Advances*; no revenue is booked automatically).
5. **Verify the bank list** (43 banks) against the State Bank of Pakistan list.

## 3. Deploy (everything on Netlify, free)

The website and the API deploy together from this repository. The API runs as a Netlify Function (`netlify/functions-src/api.mts`, bundled at build time) and is served on the **same address** as the website under `/api`, so there is no second host, no cross-site call and no CORS to configure. `netlify.toml` already has the build command.

**One-time setup** (Netlify → *Add new site → Import from Git*, pick this repository; the build settings come from `netlify.toml`). Then *Site configuration → Environment variables*, add all of these (keep the default scopes: builds, functions and runtime):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable (anon) key from Supabase → Project Settings → API Keys |
| `NEXT_PUBLIC_API_URL` | `/api` (exactly this; the API is on the same address) |
| `DATABASE_URL` | the **`propiq_app`** login through Supabase's **transaction pooler** (host `…pooler.supabase.com`, port **6543**). Never the `postgres` owner. |
| `DB_POOL_MAX` | `3` (each function instance holds a few connections; the pooler shares them) |
| `SUPABASE_JWKS_URL` | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_ISSUER` | `https://<project-ref>.supabase.co/auth/v1` |
| `CNIC_HMAC_KEY`, `CNIC_DATA_KEY` | the same values as in `api/.env` today (back them up) |
| `LOG_LEVEL` | `info` |

`NEXT_PUBLIC_*` values are baked in at build time, so **redeploy** after changing them. Leave them unset and the site runs as the demo only.

Check it: open `https://<your-site>.netlify.app/api/health` → `{"ok":true}`, then `/api/health/db` → `{"ok":true}`.

**Things to know about running on Netlify Functions**
- **Speed from Pakistan:** the function runs in Netlify's default region (US East) and the database is in Tokyo, so each request makes several round trips across the Pacific. Expect roughly 1–2 seconds per click at first. If it feels slow, the fixes are, in order: create a new Supabase project in a US East region (the database then sits next to the function; run `npm run migrate` and `npm run setup` on it), or a paid Netlify plan that lets you pick the function region. Measure first.
- **Cold start:** the first request after a quiet spell takes an extra second or two.
- **Limits:** a request or answer can be at most about 6 MB, which is why attachments are capped at 4 MB. A function stops after 10 seconds (26 on request), plenty for everything here.
- **Free plan allowance:** 125,000 function calls and 100 hours of run time a month. A busy team clicking all day stays well inside it; watch *Usage* on the Netlify dashboard.
- **Not on Netlify?** `api/Dockerfile` runs the same API as a normal server (any container host); then set `NEXT_PUBLIC_API_URL` to its address and `CORS_ORIGIN` to the website's address.

**Database changes:** run `cd api && npm run migrate` with `MIGRATION_DATABASE_URL` (the owner login) *before* deploying code that needs them. Migrations 0001–0015 are applied on the Supabase project today; after a migration that adds roles or permission areas run `cd api && npm run setup` once to top up the standard roles (Owner, Administrator, Sales Agent, Accountant, Viewer).

## 4. Smoke test after each deploy

Sign in → Dashboard loads → add a customer → book a property → set a payment plan → receive a payment → the receipt shows on the customer statement and the trial balance → void it → Bank Reconciliation opens. The same walk-through is automated against a local sandbox: `cd api && npm run sandbox`, start the website with the variables it prints, then in `e2e/` run `node run.mjs && node finance.mjs && node sales.mjs` (needs a fresh sandbox).

## 5. Known limits to tell the customer about

- Receipts apply to bookings; paying a sales invoice goes through a cash/bank receipt voucher for the customer.
- Money received on a booking that is later cancelled stays on the customer's account until refunded with a payment voucher.
- One company per sign-in at a time. Staff are invited by email under Administration → Users and create their own sign-in.
- Budgets: self-approval is allowed by default (a one-person company would otherwise be locked out); turn it off per company with `settings.budget_self_approval = false`.
- Reminders open WhatsApp (or the phone dialler) with the message ready and record that it was done; nothing is sent automatically. Automatic sending needs a WhatsApp Business / SMS provider account.
- Files live in the database (4 MB each). For very large document volumes move them to object storage later.
- Supabase *Authentication → URL configuration* must list `<website>/reset-password` as a redirect URL for forgot-password emails to work.
