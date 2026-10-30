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
| `admin` | company default language card (the rest of Administration comes in Phase 3) | 5 |
| `files` | shared dialog/picker words, status words, document attachments and their categories | 58 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |
| `projects` | Projects list and page, New Project form, land sizes, contractor trades | 73 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |
| `properties` | Properties list, Add Property, a property's page (legal, ownership chain, liens, valuations, price) | 152 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |
| `customers` | customers & suppliers (address book), Add forms, pickers | 72 | ″ | ″ | ″ | ″ | ″ | ″ | ″ |
| `deals` | Deals & Bookings, a booking's page, payment plan, receipts, late charges, refunds, transfers, commission, collections | 256 | ″ | ″ | ″ | ″ | ″ | ″ | ″ | ″ | ″ | ″ | ″ | ″ | ″ | ″ |

Files live at `lib/i18n/messages/<lang>/<area>.ts`. Phases 2 to 4 add more areas to the same table.

## Risks noticed while writing

**Phase 4 (output and edges)**
- **Urdu amount in words** is hand-built (every number below 100 has its own word, then سو، ہزار، لاکھ، کروڑ، ارب). A native speaker should read a few printed amounts (for example 1,250,000.50 and 99, 71, 79, 89) because spelling variants exist (انیاسی/اناسی, ستہتر/ستتر).
- Every other language prints **English** words ("Rupees … Only") on documents. Arabic, French, German, Chinese, Japanese and Pashto number-to-words are not written.
- **Reminder texts** are read by customers: the Urdu, Pashto and Arabic ones open with the Islamic greeting; French, German, Chinese and Japanese use a neutral business greeting. Check the tone with someone who writes to customers in each language.
- **Error messages:** English keeps the server sentence; other languages show one generic sentence per code (for example "Booking not found." becomes "That record could not be found."). Codes that carry a name or an amount still show the server's English text.
- Printed documents: the fixed labels follow the interface language, but text typed by staff, account names, journal memos and installment kinds stored in English stay as stored.

**Phase 3 (finance and people terms)**
- Voucher types: the ten document names (cash/bank payment and receipt, contra, sales, purchase invoice, credit/debit note, journal) were written as accounting terms; a local accountant should confirm them, especially Arabic (سند صرف / سند قبض) and Japanese (伝票 / 貸方票).
- Debit/credit wording on forms follows the glossary; check "Soll/Haben", "借方/貸方", "مدين/دائن", "ڈیبٹ/کریڈٹ" against what each market's accountants actually say.
- Retention ("مبلغ محتجز", "质保金", "Einbehalt", "留保金") and "post-dated cheque" wording per the glossary.
- Permission-matrix module names and the plan-feature names are translations of English labels; role names ("Owner", "Accountant"), leave types and the sample role descriptions come from the database and stay English.
- Landing page copy is marketing text: tone and word choice need a native copywriter, not just a reviewer.
- Chinese, Japanese and Arabic plural forms are written with only the forms the language needs.

**Phase 2 (property and booking terms)**
- Land-registry words have no standard translation: *fard*, *khasra*, *mutation* (انتقال), *NOC*, *allotment*. Urdu and Pashto use the local terms; Arabic, Chinese, French, German and Japanese use the closest legal term with the original word in brackets or kept as is. A Pakistani property lawyer should confirm them.
- "Late-payment charge" is rendered as a penalty/default-interest term (جرمانہ, غرامة التأخير, 滞纳金, pénalité de retard, Verzugsgebühr, 遅延損害金); the right word depends on whether the company treats it as a fine or as interest.
- "Token money / down payment / balloon payment" are separate concepts in Pakistani deals; the *balloon* wording (آخری بڑی ادائیگی, الدفعة الختامية الكبيرة, 尾款, Schlussrate, 最終一括払い) is descriptive rather than a standard term.
- Dr/Cr on the customer balance are shown as مدين/دائن, ڈیبٹ/کریڈٹ, 借/贷, Soll/Haben, 借方/貸方; a local accountant may prefer the English abbreviations.
- Document categories (CNIC copy, Fard, NOC, sale deed…) are stored in English and only their display name is translated.
- The collection reminder message itself (the WhatsApp text) is still English/Urdu only; a per-message language selector comes in Phase 4.

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

Everything outside Phases 1 and 2. Still English after Phase 2: the contractor dialogs reached from a project page (Assign Contractor, New Contractor), the sample-only Accounts "transfer payment" and Payroll "record advance" dialogs, the booking print documents, the collection reminder text, and server error messages (shown as the server wrote them). Leads, Quotations, Invoices, Cheques, Contracts, Contractors, Vouchers, Accounts, Reconciliation, Expenses, Budgets, Reports, Staff, Leave, Payroll, the rest of Administration, the activity log, the plot map, the landing page and billing (Phase 3); printed documents, CSV headers, amount in words, reminder messages, server error messages and the browser tab titles (Phase 4). The room is already there: switching language on those screens changes direction, font and layout, but their words stay English until their phase.

## Demo-mode screens (area `demo`)

File: `lib/i18n/messages/<lang>/demo.ts` (~490 keys). Keys `dm.x.*` are stored English labels (budget control modes, payroll adjustment kinds, leave types, payment methods, voucher/contract types) looked up by `tx(text)`; a label with no entry falls back to the English text. Native reviewers should check: the budget-control descriptions (`dm.x.warn…`, `dm.x.block…`), plural phrases for Arabic and Urdu, and the leave and payroll terms. Not translated: sample-data names and descriptions, budget category templates, bank names, database role and leave-type names.
