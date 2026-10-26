# Translation review list

**Every translation in PropIQ was written by an AI. A native speaker who also knows property and accounting must review it before customers see it.** Nothing here has been checked by a person.

How to review: open the file, read the English next to the translation (`lib/i18n/messages/en/<area>.ts` has the same keys in the same order), fix the text in place. Keep the `{placeholders}` and the `{count, plural, one {…} other {…}}` shape; run `node scripts/check-i18n.mjs` afterwards. Term choices are in `docs/I18N_GLOSSARY.md`: fix a word there and in every file that uses it.

## Files to review (status after Phase 1)

| Area | What it covers | English keys | ur | ps | zh | fr | de | ja | ar |
|---|---|---|---|---|---|---|---|---|---|
| `common` | shared words, plan names, status words | 67 | AI, unreviewed | AI, unreviewed | AI, unreviewed | AI, unreviewed | AI, unreviewed | AI, unreviewed | AI, unreviewed |
| `nav` | menu sections and pages | 37 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |
| `shell` | top bar, side menu, search palette, company switcher, plan lock screens | 52 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |
| `auth` | sign-in, sign-up, password reset, sign-in errors | 52 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |
| `account` | My account page | 19 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |
| `dashboard` | the dashboard (sample company and real company) and the sentences the insights engine writes | 268 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |
| `admin` | company default language card (the rest of Administration comes in Phase 3) | 5 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |

Files live at `lib/i18n/messages/<lang>/<area>.ts`. Phases 2 to 4 add more areas to the same table.

## Risks noticed while writing

**All languages**
- Register: French and German use the formal *vous / Sie*; Japanese uses です／ます. Urdu, Pashto and Arabic use respectful forms without a formal/informal split. A reviewer may want a warmer or more formal tone.
- Accounting terms without one standard word (voucher, retention, bank reconciliation, token money, late-payment charge). See the glossary; these are the most important words to confirm with a local accountant.
- Sentences that describe a number ("{count, plural, …}") were built for each language's plural rules (Arabic has six forms). Please check the *two*, *few* and *many* Arabic forms in particular.
- The business-health card and "What the numbers are telling you" sentences are assembled from several parts; a few read stiffly (for example the budget and operating-expense insights).

**Urdu**
- Written in Naskh script (readable in tables), not Nastaliq. Nastaliq is a possible choice for printed headings in Phase 4.
- Amount sizes read as لاکھ / کروڑ / ہزار / ارب (lakh, crore, thousand, arab); amounts always keep "Rs" and Western digits.
- "Yesterday" and "tomorrow" are written گزشتہ کل and آئندہ کل because plain کل means both.
- Greeting for the afternoon is just "سلام" (there is no common Urdu "good afternoon").

**Pashto**
- Pakistani (Khyber Pakhtunkhwa) Pashto. Spellings of ې ۍ ډ ړ ږ ښ ټ ڼ should be checked; several modern spellings vary.
- A few loanwords (ډشبورډ, ټیکه‌دار, کوټیشن, کمیشن) are kept the way speakers say them; a reviewer may prefer a native word.

**Arabic**
- Modern Standard Arabic. Words like عميل محتمل (lead) and عرض سعر (quotation) are standard business Arabic but may sound formal for Pakistani users who read Arabic as a second language.
- The Arabic dictionary avoids Arabic-Indic digits on purpose (Western digits everywhere, as agreed).

**Chinese (Simplified)**
- 回款 (money collected) and 应收款 (receivables) are used consistently; 房产 is "property". Marla and Kanal have no Chinese word, so the original word is kept.
- Sentences with a count use "{count} 笔 / 项 / 张" counters chosen by hand; check the counters.

**French / German**
- Several labels are long in German (*Dienstleistungsrechnungen*, *Konzernübersicht*). The menu and top bar were checked at normal widths; very narrow screens may truncate.
- German "Bargeld deckt … der unbezahlten Rechnungen" wraps to two lines inside the health card; acceptable but could be shortened.

**Japanese**
- Katakana is used for finance words that people say in loan form (ダッシュボード, プロジェクト); 伝票 for voucher.
- No plural forms exist; counters (件, 枚, 日) were chosen per sentence.

## Text that is still English (by screen)

Everything outside the Phase 1 areas: Properties, Projects, Customers, Deals & Bookings (Phase 2); Leads, Quotations, Invoices, Cheques, Contracts, Contractors, Vouchers, Accounts, Reconciliation, Expenses, Budgets, Reports, Staff, Leave, Payroll, the rest of Administration, the activity log, the plot map, the landing page and billing (Phase 3); printed documents, CSV headers, amount in words, reminder messages, server error messages and the browser tab titles (Phase 4). The room is already there: switching language on those screens changes direction, font and layout, but their words stay English until their phase.
