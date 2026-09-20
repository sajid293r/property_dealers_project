# Feature Plan & Subscription Tiers

Modules are grouped the way property dealers actually think about their business, not by the reference app's menu structure. Each module lists what ships at each tier. "—" means not available at that tier; a feature listed at Basic is inherited by Moderate and Premium unless a tier-specific upgrade is noted.

Legend: **B** Basic · **M** Moderate · **P** Premium

## 1. Dashboard & Analytics
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| KPI overview tiles (bookings, collections, expenses, cash in hand) | ✅ | ✅ | ✅ |
| Today vs. yesterday / week-over-week trend charts | — | ✅ | ✅ |
| Multi-project / multi-branch consolidated dashboard | — | — | ✅ |
| Forecasting & predictive collection analytics | — | — | ✅ |
| Custom dashboard widgets | — | — | ✅ |

## 2. CRM (Leads & Client Relationships)
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| Contact/client directory with basic notes | ✅ | ✅ | ✅ |
| Lead pipeline (stages, sources, status) | — | ✅ | ✅ |
| Follow-up tasks & reminders | — | ✅ | ✅ |
| Team assignment (manager → agent hierarchy) | — | ✅ | ✅ |
| Lead scoring & automated drip follow-ups (WhatsApp/SMS/Email) | — | — | ✅ |
| Client self-service portal (view ledger/installments/receipts) | — | — | ✅ |

## 3. Property / Inventory Management
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| Unit/plot catalogue (category, size, price, status) | ✅ | ✅ | ✅ |
| Bulk price update, image gallery per unit | ✅ | ✅ | ✅ |
| Multiple projects / housing schemes | — | ✅ | ✅ |
| Interactive plot map (visual layout, click-to-select, status colour-coding) | — | — | ✅ |
| Stock/inventory ledger & valuation | — | ✅ | ✅ |

## 4. Deals, Bookings & Contracts
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| Booking a unit (single cash or basic installment sale) | ✅ | ✅ | ✅ |
| Flexible installment plans (custom schedules, auto due-reminders) | — | ✅ | ✅ |
| Purchase deals (land/plot acquisition intake) | — | ✅ | ✅ |
| Contract lifecycle tracking + expiry alerts | — | ✅ | ✅ |
| Dealer/broker commission tracking | — | — | ✅ |
| Deal approval / confirmation workflow (maker-checker) | — | ✅ | ✅ |

## 5. Accounts & Accounting
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| Single cash account, manual credit/debit entries | ✅ | ✅ | ✅ |
| Multiple accounts (cash/bank/petty) + transfers | — | ✅ | ✅ |
| Double-entry chart of accounts, journal | — | ✅ | ✅ |
| Trial Balance, P&L, Balance Sheet, Cash Flow statements | — | ✅ | ✅ |
| Investment & loan tracking | — | — | ✅ |
| Multi-currency support | — | — | ✅ |

## 6. Staff & Payroll
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| Staff directory | ✅ (up to 2 seats) | ✅ (up to 15 seats) | ✅ (unlimited) |
| Staff ledger (advances/deductions) | — | ✅ | ✅ |
| Payroll (salary disbursement, loans/advances) | — | ✅ | ✅ |
| Role & permission matrix (custom roles, per-module CRUD) | Fixed roles only | ✅ configurable | ✅ fully custom |

## 7. Expense Management
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| Expense vouchers/bills, categorized | ✅ | ✅ | ✅ |
| Follow-up flags for unpaid bills | — | ✅ | ✅ |
| Budget vs. actual tracking | — | — | ✅ |

## 8. Reports
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| Basic PDF export (bookings, ledgers) | ✅ | ✅ | ✅ |
| Income statement, profit reports, sale/purchase/stock reports | — | ✅ | ✅ |
| Custom report builder + scheduled email reports | — | — | ✅ |
| Data export (CSV/Excel), audit log | — | ✅ | ✅ |

## 9. Communication
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| Manual WhatsApp/SMS reminders (installment due, etc.) | — | ✅ | ✅ |
| Bulk WhatsApp/SMS campaigns | — | — | ✅ |
| Automated drip sequences | — | — | ✅ |
| Custom PDF/voucher templates (branding) | — | ✅ | ✅ White-label |

## 10. Settings & Administration
| Feature | B | M | P |
|---|:-:|:-:|:-:|
| Company profile, logo, tax fields (NTN) | ✅ | ✅ | ✅ |
| Bilingual (English/Urdu) data entry toggle | — | ✅ | ✅ |
| Database backup/export | — | ✅ | ✅ |
| API access / integrations (payment gateways, WhatsApp Business API) | — | — | ✅ |
| Multi-branch tenant management | — | — | ✅ |

## Cross-cutting product requirements (all tiers)
- Fully responsive (mobile agents book/check units on-site).
- Dark mode.
- Pakistani localization by default: PKR formatting, CNIC field, per-Marla / per-Sq-ft pricing, Urdu font support.
- Empty states, skeleton loading, and toasts for every async action (even against mock data) — the prototype should *feel* like a real, fast product.

## Out of scope for this prototype
Real authentication, real multi-tenant database, payment/billing integration, real SMS/WhatsApp gateway calls, real PDF generation pipeline. These are represented in the UI (buttons, flows, toggles) but backed by mock data/handlers — see [`TECH_STACK.md`](TECH_STACK.md).
