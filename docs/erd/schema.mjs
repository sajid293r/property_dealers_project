// Single source of truth for the ERDs. Edit here, then run:  node docs/erd/build.mjs
//
// Column line syntax:   name type [fk=table] [null] [uq] [pk]   # note
//   types: uuid text int bigint num bool date ts jsonb geom
//   every table gets  id uuid pk  and  company_id uuid fk=companies  automatically
//   (use { noid: true } for composite-key link tables, { global: true } for tables outside a company)
// Standard columns omitted from the diagrams for readability (present on every table):
//   created_at, updated_at, version, deleted_at (master data)

export const MODULES = [
  { key: "platform", title: "Platform & Tenancy", color: "#0f766e", blurb: "Groups, companies, users, roles, settings — who can do what, where." },
  { key: "services", title: "Platform Services", color: "#475569", blurb: "Audit, files, approvals, notifications, imports, webhooks — built once, used by every module." },
  { key: "parties", title: "Parties (Address Book)", color: "#7c3aed", blurb: "Customers, dealers, vendors, contractors and owners as one deduplicated address book." },
  { key: "accounting", title: "Accounting & Ledger", color: "#b45309", blurb: "Chart of accounts (the structure) and vouchers (the documents) both post to one double-entry journal; combined transactions and bank reconciliation." },
  { key: "projects", title: "Projects & Properties", color: "#15803d", blurb: "Schemes, land and approvals, plus a deep property model: location, size, plot/building/commercial specs, amenities, utilities, legal & ownership chain, valuation, media, listings and charges." },
  { key: "crm", title: "CRM & Leads", color: "#be185d", blurb: "Leads, activities, site visits, campaigns, assignment and WhatsApp conversations." },
  { key: "sales", title: "Sales & Collections", color: "#1d4ed8", blurb: "Quotation → booking → installments → receipts, cheques, transfers, cancellations, commissions." },
  { key: "budget", title: "Budgeting & Control", color: "#047857", blurb: "Plan spend per project and per year, phase it by month, approve and lock it, change it only through revisions, track commitments, and stop or warn on overruns." },
  { key: "tax", title: "Tax Management", color: "#b91c1c", blurb: "Admin-configurable tax codes, effective-dated rates, bundles, assignment rules, exemptions, returns and payments." },
  { key: "invoicing", title: "Invoicing & Contracts", color: "#c2410c", blurb: "Sales and service invoices, recurring billing, credit notes, agreement templates." },
  { key: "procurement", title: "Procurement & Stock", color: "#0e7490", blurb: "Vendors' POs, goods receipts, bills, budgets, petty cash and material stock." },
  { key: "construction", title: "Construction & Costing", color: "#a16207", blurb: "Contracts, BOQ, running bills (IPC), retention, variations, progress and guarantees." },
  { key: "hr", title: "HR, Attendance & Payroll", color: "#9333ea", blurb: "Employees, salary structure, attendance, leave, payroll runs, loans, targets." },
  { key: "group", title: "Multi-Company & Consolidation", color: "#0369a1", blurb: "Inter-company transactions, group chart of accounts, eliminations and consolidated statements." },
  { key: "saas", title: "Reporting & SaaS Billing", color: "#334155", blurb: "KPI snapshots, saved/scheduled reports, plans, subscriptions and usage." },
];

export const TABLES = [];
function t(module, name, desc, cols, opts = {}) {
  TABLES.push({ module, name, desc, cols, opts });
}

// ═══════════════════════════════════════════════ PLATFORM & TENANCY
t("platform", "organizations", "The paying customer / group owner", `
name text
slug text uq
plan text # basic|moderate|premium
status text # trial|active|past_due|suspended|closed
`, { global: true });

t("platform", "companies", "A legal entity inside an organization", `
org_id uuid fk=organizations
name text
short_name text
ntn text
strn text
city text
province text
address text
phone text
email text
base_currency text # PKR
fiscal_year_start int # 7 = July
settings jsonb
status text
`, { global: true });

t("platform", "users", "A login (person who signs in)", `
email text uq
phone text
full_name text
password_hash text null
mfa_enabled bool
status text # invited|active|suspended
last_login_at ts
`, { global: true });

t("platform", "org_members", "User belongs to an organization", `
org_id uuid pk fk=organizations
user_id uuid pk fk=users
org_role text # owner|admin|member
`, { noid: true, global: true });

t("platform", "roles", "Named permission bundle (system or custom)", `
org_id uuid fk=organizations null # null = platform default
name text
description text
is_system bool
`, { global: true });

t("platform", "role_permissions", "Module x action grid + data scope", `
role_id uuid pk fk=roles
module text pk # matches frontend PERMISSION_MODULES
can_view bool
can_create bool
can_edit bool
can_delete bool
can_approve bool
data_scope text # own|team|project|company
`, { noid: true, global: true });

t("platform", "company_members", "Which role a user holds in which company", `
company_id uuid pk fk=companies
user_id uuid pk fk=users
role_id uuid fk=roles
status text
`, { noid: true, global: true });

t("platform", "invitations", "Pending invites to join a company", `
company_id uuid fk=companies
email text
role_id uuid fk=roles
token_hash text
expires_at ts
accepted_at ts null
invited_by uuid fk=users
`, { global: true });

t("platform", "sessions", "Active logins / devices", `
user_id uuid fk=users
refresh_token_hash text
device text
ip text
expires_at ts
revoked_at ts null
`, { global: true });

t("platform", "api_keys", "Machine access for integrations", `
name text
key_hash text
scopes jsonb
last_used_at ts null
expires_at ts null
`);

t("platform", "settings", "Per-company configuration (key/value)", `
key text # numbering, marla_to_sqft, rounding, revenue policy
value jsonb
`);

t("platform", "feature_flags", "Per-organization or per-company feature switches", `
org_id uuid fk=organizations null
key text
enabled bool
config jsonb
`, { global: true });

t("platform", "document_sequences", "Gapless document counters", `
doc_type text pk # CPV, BK, RCT...
period_key text pk # e.g. FY2026
prefix text
next_value bigint
`, { noid: true });

// ═══════════════════════════════════════════════ PLATFORM SERVICES
t("services", "audit_log", "Append-only record of every change (monthly partitions)", `
occurred_at ts
user_id uuid fk=users null
action text # create|update|delete|approve|export|reveal
entity_type text
entity_id uuid null
before_data jsonb
after_data jsonb
ip text
request_id text
`);

t("services", "documents", "File metadata (blob lives in object storage)", `
storage_key text
file_name text
mime text
size_bytes bigint
sha256 text
uploaded_by uuid fk=users
version int
`);

t("services", "document_links", "Attach a file to any record", `
document_id uuid fk=documents
entity_type text
entity_id uuid
kind text # cnic_front|agreement|invoice|photo
`);

t("services", "comments", "Notes/discussion on any record", `
entity_type text
entity_id uuid
author_id uuid fk=users
body text
mentions jsonb
`);

t("services", "tags", "Labels", `
name text
color text
`);

t("services", "tag_links", "Tag a record", `
tag_id uuid pk fk=tags
entity_type text pk
entity_id uuid pk
`, { noid: true });

t("services", "approval_policies", "Who must approve which document", `
doc_type text # voucher|leave|refund|price_change...
condition jsonb # e.g. amount > 500000
steps jsonb # ordered approver roles
active bool
`);

t("services", "approval_requests", "A document waiting for approval", `
policy_id uuid fk=approval_policies
entity_type text
entity_id uuid
requested_by uuid fk=users
status text # pending|approved|rejected|cancelled
`);

t("services", "approval_steps", "Individual approver decisions", `
request_id uuid fk=approval_requests
step_no int
approver_id uuid fk=users
decision text null
note text
decided_at ts null
`);

t("services", "notification_templates", "Message templates (EN/UR) per channel", `
code text
channel text # whatsapp|sms|email|in_app
language text
subject text
body text
provider_template_id text null
`);

t("services", "notifications", "In-app notifications", `
user_id uuid fk=users
title text
body text
entity_type text
entity_id uuid null
read_at ts null
`);

t("services", "outbound_messages", "WhatsApp/SMS/email delivery log", `
channel text
to_address text
template_id uuid fk=notification_templates null
party_id uuid fk=parties null
status text # queued|sent|delivered|failed
provider_message_id text
cost num
error text
sent_at ts null
`);

t("services", "tasks", "Reminders and to-dos", `
title text
assignee_id uuid fk=users
due_at ts
status text
entity_type text
entity_id uuid null
`);

t("services", "import_jobs", "CSV/Excel migration runs", `
kind text # customers|properties|bookings|opening_balances
file_id uuid fk=documents
mapping jsonb
status text # dry_run|running|done|failed
rows_ok int
rows_error int
error_report jsonb
created_by uuid fk=users
`);

t("services", "export_jobs", "Downloads (audited)", `
kind text
filters jsonb
file_id uuid fk=documents null
status text
requested_by uuid fk=users
`);

t("services", "document_templates", "Branded HTML templates for PDFs", `
doc_type text # receipt|voucher|agreement|payslip
language text
html text
version int
active bool
`);

t("services", "generated_documents", "Rendered PDFs", `
template_id uuid fk=document_templates
entity_type text
entity_id uuid
file_id uuid fk=documents
`);

t("services", "outbox_events", "Reliable post-commit events", `
event_type text
payload jsonb
published_at ts null
`);

t("services", "webhook_endpoints", "Customer integrations", `
url text
secret_hash text
events jsonb
active bool
`);

t("services", "webhook_deliveries", "Delivery attempts", `
endpoint_id uuid fk=webhook_endpoints
event_id uuid fk=outbox_events
status_code int
attempt int
next_retry_at ts null
`);

t("services", "custom_field_definitions", "Client-specific extra fields", `
entity_type text
key text
label text
data_type text
options jsonb
required bool
`);

t("services", "saved_views", "Saved filters per user", `
user_id uuid fk=users
module text
name text
filters jsonb
shared bool
`);

t("services", "idempotency_keys", "Safe retries of money-moving POSTs", `
key text uq
request_hash text
response jsonb
expires_at ts
`);

// ═══════════════════════════════════════════════ PARTIES
t("parties", "parties", "One address book: person or organization", `
kind text # person|organization
display_name text
legal_name text
name_ur text
cnic text uq # encrypted at rest
cnic_hash text
ntn text
phone_e164 text
email text
city text
tax_status text # filer|non_filer
referrer_id uuid fk=parties null
created_by uuid fk=users
`);

t("parties", "party_roles", "customer | dealer | vendor | contractor | employee | investor | landowner", `
party_id uuid pk fk=parties
role text pk
`, { noid: true });

t("parties", "party_contacts", "Phones, WhatsApp, emails", `
party_id uuid fk=parties
type text # phone|whatsapp|email
value text
is_primary bool
consent_whatsapp bool
`);

t("parties", "party_addresses", "Current / permanent / office", `
party_id uuid fk=parties
kind text
line text
city text
country text
`);

t("parties", "party_documents", "KYC files with expiry", `
party_id uuid fk=parties
kind text # cnic|ntn|photo|proof_of_address
file_id uuid fk=documents
expires_on date null
verified_by uuid fk=users null
`);

t("parties", "party_bank_accounts", "For refunds and payouts", `
party_id uuid fk=parties
bank_name text
iban text
account_title text
is_default bool
`);

t("parties", "party_relationships", "Spouse, nominee, guardian, company representative", `
party_id uuid fk=parties
related_party_id uuid fk=parties
relation text
`);

t("parties", "blacklist_entries", "Flagged parties", `
party_id uuid fk=parties
reason text
added_by uuid fk=users
lifted_at ts null
`);

// ═══════════════════════════════════════════════ ACCOUNTING
t("accounting", "fiscal_years", "e.g. FY2025-26 (July–June)", `
name text uq
start_date date
end_date date
status text # open|closed
`);

t("accounting", "accounting_periods", "Months; locked periods reject postings", `
fiscal_year_id uuid fk=fiscal_years
start_date date uq
end_date date
status text # open|locked
`);

t("accounting", "gl_accounts", "Chart of accounts (2-2-2-4 levels)", `
code text uq
name text
account_class text # asset|liability|equity|income|expense
category text
parent_id uuid fk=gl_accounts null
is_group bool
is_system bool
requires_party bool
active bool
`);

t("accounting", "cost_centers", "Departments / cost buckets", `
code text uq
name text
active bool
`);

t("accounting", "journal_entries", "Header of a posted entry (append-only)", `
entry_no text uq
entry_date date
period_id uuid fk=accounting_periods
source_type text # voucher|receipt|invoice|payroll|bill|opening
source_id uuid null
description text
status text # posted|reversed
reversal_of uuid fk=journal_entries null
posted_by uuid fk=users
`);

t("accounting", "journal_lines", "Debit/credit lines — the single source of financial truth", `
entry_id uuid fk=journal_entries
line_no int
account_id uuid fk=gl_accounts
party_id uuid fk=parties null
project_id uuid fk=projects null
cost_center_id uuid fk=cost_centers null
debit num
credit num
memo text
`);

t("accounting", "account_balances", "Period roll-ups (trigger-maintained, fast reports)", `
account_id uuid pk fk=gl_accounts
period_id uuid pk fk=accounting_periods
debit_total num
credit_total num
`, { noid: true });

t("accounting", "vouchers", "CPV / CRV / BPV / BRV / JV documents", `
voucher_type text
number text uq
voucher_date date
cheque_date date null
party_id uuid fk=parties null
description text
status text # draft|pending|approved|rejected|void
journal_entry_id uuid fk=journal_entries null
combined_txn_id uuid fk=combined_transactions null
approved_by uuid fk=users null
approval_note text
recurring_rule jsonb
created_by uuid fk=users
`);

t("accounting", "voucher_lines", "Lines of a voucher", `
voucher_id uuid fk=vouchers
line_no int
account_id uuid fk=gl_accounts
debit num
credit num
remarks text
project_id uuid fk=projects null
cost_center_id uuid fk=cost_centers null
`);

t("accounting", "recurring_vouchers", "Schedules that auto-create vouchers", `
template_voucher_id uuid fk=vouchers
frequency text
next_run_on date
end_on date null
active bool
`);

t("accounting", "bank_statements", "Imported bank statement headers", `
bank_account_id uuid fk=gl_accounts
period_start date
period_end date
opening_balance num
closing_balance num
file_id uuid fk=documents null
`);

t("accounting", "bank_statement_lines", "Lines matched to the ledger", `
statement_id uuid fk=bank_statements
txn_date date
description text
debit num
credit num
matched_line_id uuid fk=journal_lines null
`);

t("accounting", "bank_reconciliations", "Signed-off reconciliations", `
statement_id uuid fk=bank_statements
reconciled_by uuid fk=users
reconciled_on date
difference num
`);

t("accounting", "opening_balances", "Cut-over balances when migrating", `
account_id uuid fk=gl_accounts
party_id uuid fk=parties null
as_of date
debit num
credit num
import_job_id uuid fk=import_jobs null
`);

t("accounting", "combined_transactions", "One business event that settles several documents at once (all-or-nothing, reversible as a unit)", `
txn_no text uq
txn_date date
kind text # combined_receipt|combined_payment|settlement|contra|multi_party_voucher
party_id uuid fk=parties null
total_amount num
status text # draft|posted|reversed
journal_entry_id uuid fk=journal_entries null
reversal_of uuid fk=combined_transactions null
note text
created_by uuid fk=users
`);

t("accounting", "combined_transaction_items", "The receipts / vouchers / bill payments that make up a combined transaction", `
combined_txn_id uuid fk=combined_transactions
item_type text # receipt|voucher|bill_payment|invoice_settlement|cheque
ref_id uuid # the document it points to
direction text # in|out
amount num
`);

t("accounting", "posting_rules", "Event → debit/credit account mapping (editable by accountant)", `
event text # receipt|commission_accrual|payroll...
debit_account_id uuid fk=gl_accounts
credit_account_id uuid fk=gl_accounts
conditions jsonb
active bool
`);

// ═══════════════════════════════════════════════ PROJECTS & PROPERTIES
t("projects", "projects", "A housing scheme / development", `
code text uq
name text
type text # residential|commercial|mixed_use
status text # planning|active|on_hold|completed|cancelled
city text
address text
land_area_marla num
manager_id uuid fk=users null
approved_budget num
planned_start date
planned_end date
actual_start date null
handover_date date null
`);

t("projects", "project_phases", "Phase 1, 2, 3 …", `
project_id uuid fk=projects
name text
sequence int
planned_start date
planned_end date
status text
`);

t("projects", "project_blocks", "Blocks / sectors / streets", `
project_id uuid fk=projects
phase_id uuid fk=project_phases null
name text
`);

t("projects", "project_approvals", "NOC / layout plan / regulator approvals", `
project_id uuid fk=projects
authority text
approval_type text
reference_no text
issued_on date
valid_until date null
status text
file_id uuid fk=documents null
`);

t("projects", "land_parcels", "Land held for a project (khasra / registry details)", `
project_id uuid fk=projects
khasra_no text
registry_no text
area_marla num
mutation_status text
`);

t("projects", "land_acquisitions", "Purchase of land", `
parcel_id uuid fk=land_parcels
seller_id uuid fk=parties
purchase_date date
cost num
journal_entry_id uuid fk=journal_entries null
`);

t("projects", "property_types", "Catalogue of property types (drives which spec fields apply)", `
code text uq # plot|house|flat|upper_portion|penthouse|shop|office|warehouse|farmhouse|agri_land...
name text
property_group text # residential|commercial|industrial|agricultural
applies_specs jsonb # which spec tables apply
sort_order int
active bool
`);

t("projects", "properties", "The property itself — the hub every detail table hangs off", `
project_id uuid fk=projects null # null for standalone / consignment stock
block_id uuid fk=project_blocks null
type_id uuid fk=property_types
code text uq # PRP-1042
listing_ref text
title text
title_ur text
description text
purpose text # sale|rent|both
status text # available|reserved|sold|blocked|rented|cancelled
list_price num
price_per_marla num
price_negotiable bool
installments_available bool
possession_status text # ready|under_construction|off_plan
possession_date date null
ownership_source text # own_inventory|consignment|dealer_stock|client_listing
owner_party_id uuid fk=parties null
is_featured bool
internal_notes text
attributes jsonb # client-defined extra fields
`);

t("projects", "property_locations", "Where it is — address, society, GPS and access", `
property_id uuid fk=properties uq
plot_no text
street_no text
sector text
phase text
society text
area_name text
city text
province text
postal_code text
landmark text
latitude num
longitude num
road_name text
road_width_ft num
distance_main_road_m num
facing text # north|south|east|west|corner...
`);

t("projects", "property_dimensions", "Sizes and measurements", `
property_id uuid fk=properties uq
size_value num
size_unit text # marla|kanal|sqft|sqyd|acre
size_sqft num
covered_area_sqft num
frontage_ft num
depth_ft num
length_ft num
width_ft num
shape text # regular|irregular|triangular
corner bool
plot_cut text # e.g. 5% cut / extra land
`);

t("projects", "property_plot_specs", "Plot-specific details (land, utilities readiness, status)", `
property_id uuid fk=properties uq
land_use text # residential|commercial|agricultural|mixed
plot_condition text # developed|undeveloped|semi_developed
balloted bool
disputed bool
park_facing bool
boulevard_facing bool
boundary_wall bool
possession_available bool
file_type text # open_file|allocation_letter|registered
zoning_note text
topography text # flat|sloped
soil_type text
`);

t("projects", "property_building_specs", "House / flat / building details", `
property_id uuid fk=properties uq
bedrooms int
bathrooms int
kitchens int
drawing_rooms int
dining_rooms int
tv_lounges int
servant_quarters int
store_rooms int
laundry_rooms int
study_rooms int
prayer_rooms int
balconies int
terraces int
parking_spaces int
floors_total int
floor_no int
unit_no text
tower_name text
year_built int
age_years int
construction_status text # grey_structure|finished|under_construction
condition text # new|excellent|good|needs_renovation
furnishing text # unfurnished|semi|furnished
flooring text
kitchen_type text
view text
`);

t("projects", "property_commercial_specs", "Shop / office / warehouse details", `
property_id uuid fk=properties uq
commercial_type text # shop|office|showroom|warehouse|factory|plaza_floor
frontage_ft num
mezzanine bool
floor_height_ft num
footfall text # low|medium|high
suitable_for text
expected_rent num
expected_roi_pct num
loading_bay bool
power_load_kw num
`);

t("projects", "amenity_catalog", "Master list of features/amenities (admin-extendable)", `
code text uq
name text
name_ur text
category text # plot_features|building|community|security|business_comm|healthcare_rec|eco|nearby
input_type text # yes_no|number|text
icon text
applies_to jsonb # property types it applies to
sort_order int
active bool
`);

t("projects", "property_amenities", "Which amenities a property has", `
property_id uuid fk=properties
amenity_id uuid fk=amenity_catalog
value_bool bool null
value_num num null
value_text text null
`);

t("projects", "property_utilities", "Electricity, gas, water, sewerage, internet … with meter details", `
property_id uuid fk=properties
utility text # electricity|gas|water|sewerage|internet|telephone|solar|generator
status text # available|nearby|applied|not_available
provider text
connection_no text
meter_no text
connected_on date null
est_monthly_bill num
`);

t("projects", "property_nearby_places", "Schools, hospitals, mosques, markets, transport within reach", `
property_id uuid fk=properties
category text # school|hospital|mosque|market|park|airport|motorway|public_transport
name text
distance_km num
travel_minutes int
latitude num
longitude num
`);

t("projects", "property_media", "Photos, videos, 360° tours, floor and site plans, brochures", `
property_id uuid fk=properties
kind text # photo|video|tour_360|floor_plan|site_plan|drone|brochure
file_id uuid fk=documents
caption text
sort_order int
is_cover bool
visibility text # public|internal
taken_at ts
`);

t("projects", "property_legal", "Title & legal status of the property", `
property_id uuid fk=properties uq
ownership_type text # freehold|leasehold|allotment|power_of_attorney|file
title_status text # clear|under_verification|disputed
registry_no text
fard_no text
khasra_no text
allotment_no text
allotment_date date null
mutation_status text
noc_status text
transfer_status text # transferable|restricted|transferred
lease_start date null
lease_end date null
ground_rent num
legal_notes text
verified_by uuid fk=users null
verified_on date null
`);

t("projects", "property_documents", "Registry, fard, allotment letter, NOC, sale deed, site plan …", `
property_id uuid fk=properties
doc_type text # registry|fard|allotment_letter|noc|sale_deed|site_plan|tax_receipt|utility_bill
file_id uuid fk=documents
reference_no text
issued_on date null
expires_on date null
status text # pending|verified|rejected
verified_by uuid fk=users null
`);

t("projects", "property_ownership_history", "Full chain of owners over time", `
property_id uuid fk=properties
owner_party_id uuid fk=parties
acquisition_type text # purchase|inheritance|gift|allotment|transfer
from_date date
to_date date null
price num
deed_ref text
booking_id uuid fk=bookings null
`);

t("projects", "property_encumbrances", "Mortgage, lien, court stay, litigation", `
property_id uuid fk=properties
kind text # mortgage|lien|court_stay|litigation|tenancy_right
holder_party_id uuid fk=parties null
amount num
since date
released_on date null
status text # active|released
notes text
`);

t("projects", "property_valuations", "Valuation history (internal / bank / market)", `
property_id uuid fk=properties
valuation_date date
method text # market|bank|internal
value num
valuer_party_id uuid fk=parties null
report_file_id uuid fk=documents null
notes text
`);

t("projects", "property_inspections", "Site visits / condition checks", `
property_id uuid fk=properties
inspected_on date
inspector_id uuid fk=users
condition_rating int # 1-5
checklist jsonb
findings text
report_file_id uuid fk=documents null
`);

t("projects", "property_tenancies", "Rented-out properties and rent roll", `
property_id uuid fk=properties
tenant_party_id uuid fk=parties
monthly_rent num
security_deposit num
start_date date
end_date date null
status text # active|ended|notice
agreement_contract_id uuid fk=contracts null
`);

t("projects", "property_listings", "Publishing to portals / own website (Zameen-style listings)", `
property_id uuid fk=properties
channel text # website|zameen|olx|facebook|walk_in
external_ref text
listing_title text
listing_description text
asking_price num
status text # draft|live|paused|expired
published_at ts null
expires_at ts null
views int
inquiries int
last_synced_at ts null
`);

t("projects", "property_charges", "Extra charges on top of price (development, transfer, possession, maintenance)", `
property_id uuid fk=properties
charge_type text # development|transfer_fee|possession|maintenance|utility_connection|membership
amount num
basis text # flat|per_marla|pct_of_price
due_event text # on_booking|on_possession|on_transfer
tax_code_id uuid fk=tax_codes null
`);

t("projects", "property_geometries", "Plot polygon for the interactive map (PostGIS)", `
property_id uuid fk=properties uq
geom geom # Polygon, SRID 4326
dimensions jsonb # N/S/E/W
`);

t("projects", "price_lists", "Versioned price lists", `
project_id uuid fk=projects
name text
effective_from date
effective_to date null
approved_by uuid fk=users null
`);

t("projects", "price_list_items", "Price per property or per category", `
price_list_id uuid fk=price_lists
property_id uuid fk=properties null
category text
rate_per_marla num null
price num null
`);

t("projects", "pricing_rules", "Premiums & discounts (corner +5%, park-facing…)", `
project_id uuid fk=projects
name text
condition jsonb
adjustment_pct num
active bool
`);

t("projects", "property_price_history", "Every price change", `
property_id uuid fk=properties
price num
effective_from ts
changed_by uuid fk=users
reason text
`);

t("projects", "property_status_history", "Every status change", `
property_id uuid fk=properties
from_status text
to_status text
changed_by uuid fk=users
reason text
`);

t("projects", "property_holds", "Temporary reservations with auto-expiry", `
property_id uuid fk=properties
held_for_party_id uuid fk=parties null
held_by uuid fk=users
expires_at ts
released_at ts null
`);

t("projects", "project_documents", "Maps, approvals, brochures", `
project_id uuid fk=projects
kind text
file_id uuid fk=documents
`);

// ═══════════════════════════════════════════════ BUDGETING & CONTROL
t("budget", "budget_templates", "Reusable category splits for new budgets", `
name text uq
kind text # project|operating|capex
description text
active bool
`);

t("budget", "budget_template_lines", "Categories and their share of the total", `
template_id uuid fk=budget_templates
cost_code text
category text
account_id uuid fk=gl_accounts null
share_pct num
`);

t("budget", "budgets", "A planned limit on spend — per project, per fiscal year, or per capital item", `
budget_no text uq
name text
kind text # project|operating|capex
project_id uuid fk=projects null # required for project budgets
cost_center_id uuid fk=cost_centers null
fiscal_year_id uuid fk=fiscal_years null
period_start date null
period_end date null
status text # draft|submitted|approved|locked|closed
control_mode text # none|warn|block
version_no int
parent_budget_id uuid fk=budgets null # copied / carried forward from
template_id uuid fk=budget_templates null
total_amount num # rolls up from the lines
currency text
created_by uuid fk=users
approved_by uuid fk=users null
approved_at ts null
locked_at ts null
`);

t("budget", "budget_lines", "One budgeted category, tied to a ledger account", `
budget_id uuid fk=budgets
line_no int
cost_code text
category text
description text
account_id uuid fk=gl_accounts # the ledger account whose postings count as "actual"
cost_center_id uuid fk=cost_centers null
budget_amount num
basis text # manual|per_unit|pct_of_revenue
notes text
`);

t("budget", "budget_line_periods", "Month-by-month phasing of a line (must add up to the line)", `
budget_line_id uuid fk=budget_lines
period_id uuid fk=accounting_periods
amount num
`);

t("budget", "budget_snapshots", "Frozen copy of the budget at every approved version (audit trail)", `
budget_id uuid fk=budgets
version_no int
reason text
data jsonb # all lines as approved
taken_at ts
`);

t("budget", "budget_revisions", "A formal request to change an approved budget", `
budget_id uuid fk=budgets
revision_no int
type text # supplementary|reallocation|reforecast
reason text
delta_amount num # net change to the budget total
status text # pending|approved|rejected
requested_by uuid fk=users
approved_by uuid fk=users null # must differ from requested_by
approved_at ts null
approval_request_id uuid fk=approval_requests null
`);

t("budget", "budget_revision_lines", "Which lines gain or lose money in a revision", `
revision_id uuid fk=budget_revisions
budget_line_id uuid fk=budget_lines
delta_amount num # + adds, - takes away (a reallocation nets to zero)
`);

t("budget", "budget_commitments", "Money already spoken for but not yet paid (orders, contracts, running bills)", `
budget_line_id uuid fk=budget_lines
source_type text # purchase_order|construction_contract|ipc|vendor_bill|payroll|manual
source_id uuid null
amount num
status text # open|invoiced|released|cancelled
committed_on date
note text
`);

t("budget", "budget_exceptions", "A request to go over budget when control mode is Block", `
budget_line_id uuid fk=budget_lines
doc_type text # voucher|purchase_order|vendor_bill|ipc
doc_id uuid null
requested_amount num
over_by num
reason text
status text # pending|approved|rejected
requested_by uuid fk=users
decided_by uuid fk=users null # must differ from requested_by
decided_at ts null
`);

t("budget", "budget_alert_rules", "Notify when a line reaches a threshold (e.g. 85%, 100%)", `
budget_id uuid fk=budgets null # null = applies to every budget
threshold_pct num
channel text # in_app|email|whatsapp
notify_role_id uuid fk=roles null
active bool
`);

t("budget", "budget_alerts", "Alerts that have fired (one per line per threshold)", `
budget_line_id uuid fk=budget_lines
threshold_pct num
utilization_pct num
triggered_at ts
acknowledged_by uuid fk=users null
acknowledged_at ts null
`);

t("budget", "budget_forecasts", "Estimate at completion / full-year outlook per line", `
budget_line_id uuid fk=budget_lines
as_of date
method text # run_rate|percent_complete|manual
estimate_to_complete num
forecast_at_completion num
note text
created_by uuid fk=users
`);

// ═══════════════════════════════════════════════ TAX MANAGEMENT (admin-configurable)
t("tax", "tax_authorities", "FBR, provincial revenue authorities, local bodies", `
name text
short_code text # FBR|PRA|SRB|KPRA|BRA
registration_no text
filing_frequency text # monthly|quarterly|annual
`);

t("tax", "tax_codes", "A tax the admin defines (sales tax, withholding, stamp duty …)", `
code text uq
name text
authority_id uuid fk=tax_authorities null
kind text # sales_tax|withholding|stamp_duty|capital_value|income_tax|other
direction text # output|input|withheld_by_us|withheld_from_us
applies_on text # revenue|expense|payroll|transfer|any
calc_method text # percent|flat|slab
price_inclusive bool
rounding text # nearest|up|down
payable_account_id uuid fk=gl_accounts null
receivable_account_id uuid fk=gl_accounts null
expense_account_id uuid fk=gl_accounts null
active bool
`);

t("tax", "tax_rates", "Effective-dated rates — change the rate without touching history", `
tax_code_id uuid fk=tax_codes
rate_pct num null
flat_amount num null
slabs jsonb null # [{from, to, rate}]
min_base num null
max_base num null
filer_status text # filer|non_filer|any
effective_from date
effective_to date null
note text
`);

t("tax", "tax_groups", "A bundle of taxes applied together (e.g. all taxes on a plot sale)", `
name text uq
description text
active bool
`);

t("tax", "tax_group_items", "Taxes inside a bundle, in order", `
group_id uuid pk fk=tax_groups
tax_code_id uuid pk fk=tax_codes
sequence int
compound bool # tax on top of previous tax
`, { noid: true });

t("tax", "tax_assignments", "Rules: which tax bundle applies to which kind of transaction", `
name text
doc_type text # booking|receipt|sales_invoice|service_invoice|vendor_bill|payroll|transfer|commission|voucher
tax_group_id uuid fk=tax_groups
conditions jsonb # property type, project, filer status, amount range …
priority int
effective_from date
effective_to date null
active bool
`);

t("tax", "party_tax_exemptions", "Exemption certificates (party exempt from a tax)", `
party_id uuid fk=parties
tax_code_id uuid fk=tax_codes
certificate_no text
valid_from date
valid_to date null
file_id uuid fk=documents null
`);

t("tax", "document_taxes", "Every tax computed on any document (invoice, booking, bill …)", `
doc_type text
doc_id uuid
tax_code_id uuid fk=tax_codes
tax_rate_id uuid fk=tax_rates null
base_amount num
rate_pct num
tax_amount num
direction text # output|input|withheld_by_us|withheld_from_us
status text # computed|posted|reversed
override_reason text null
journal_entry_id uuid fk=journal_entries null
`);

t("tax", "tax_returns", "Periodic filings (e.g. monthly sales-tax return)", `
authority_id uuid fk=tax_authorities
tax_type text
period_start date
period_end date
total_output num
total_input num
net_payable num
status text # draft|filed|paid
filed_on date null
reference_no text
file_id uuid fk=documents null
`);

t("tax", "tax_return_lines", "Which tax records are in a return", `
return_id uuid pk fk=tax_returns
document_tax_id uuid pk fk=document_taxes
`, { noid: true });

t("tax", "tax_payments", "Challans / payments to the authority", `
return_id uuid fk=tax_returns null
tax_code_id uuid fk=tax_codes
amount num
paid_on date
challan_no text
voucher_id uuid fk=vouchers null
`);

// ═══════════════════════════════════════════════ MULTI-COMPANY & CONSOLIDATION (organization level)
t("group", "intercompany_accounts", "Due-from / due-to accounts per pair of companies", `
counterparty_company_id uuid fk=companies
due_from_account_id uuid fk=gl_accounts
due_to_account_id uuid fk=gl_accounts
`);

t("group", "intercompany_transactions", "A transaction between two companies of the group (mirrored in both ledgers)", `
org_id uuid fk=organizations
txn_no text uq
from_company_id uuid fk=companies
to_company_id uuid fk=companies
kind text # loan|repayment|fund_transfer|expense_recharge|sale|commission
txn_date date
amount num
description text
status text # draft|posted|settled|reversed
from_entry_id uuid fk=journal_entries null
to_entry_id uuid fk=journal_entries null
matched_at ts null
created_by uuid fk=users
`, { global: true });

t("group", "consolidation_groups", "A set of companies reported together", `
org_id uuid fk=organizations
name text
base_currency text
status text
`, { global: true });

t("group", "consolidation_members", "Companies in a consolidation, with ownership %", `
group_id uuid pk fk=consolidation_groups
company_id uuid pk fk=companies
ownership_pct num
method text # full|proportional|equity
`, { noid: true, global: true });

t("group", "group_accounts", "Group-level chart of accounts used for consolidated statements", `
org_id uuid fk=organizations
code text
name text
account_class text
parent_id uuid fk=group_accounts null
`, { global: true });

t("group", "group_account_map", "Maps each company's account to a group account", `
company_id uuid pk fk=companies
gl_account_id uuid pk fk=gl_accounts
group_account_id uuid fk=group_accounts
`, { noid: true, global: true });

t("group", "consolidation_runs", "One consolidation for a period", `
group_id uuid fk=consolidation_groups
period_start date
period_end date
status text # draft|final
run_by uuid fk=users
run_at ts
`, { global: true });

t("group", "consolidated_balances", "Result: combined balance per group account", `
run_id uuid pk fk=consolidation_runs
group_account_id uuid pk fk=group_accounts
debit_total num
credit_total num
`, { noid: true, global: true });

t("group", "elimination_entries", "Removes inter-company balances so the group isn't double counted", `
run_id uuid fk=consolidation_runs
kind text # intercompany|investment|unrealized_profit
description text
intercompany_txn_id uuid fk=intercompany_transactions null
`, { global: true });

t("group", "elimination_lines", "Debit/credit lines of an elimination", `
entry_id uuid fk=elimination_entries
group_account_id uuid fk=group_accounts
company_id uuid fk=companies null
debit num
credit num
`, { global: true });

// ═══════════════════════════════════════════════ CRM
t("crm", "campaigns", "Marketing campaigns", `
name text
channel text # facebook|zameen|whatsapp|event
project_id uuid fk=projects null
start_date date
end_date date null
budget num
`);

t("crm", "campaign_spend", "Spend entries per campaign", `
campaign_id uuid fk=campaigns
spent_on date
amount num
voucher_id uuid fk=vouchers null
`);

t("crm", "leads", "Prospects", `
party_id uuid fk=parties null # created on conversion
name text
phone_e164 text
source text
campaign_id uuid fk=campaigns null
referrer_id uuid fk=parties null
interested_project_id uuid fk=projects null
budget_min num
budget_max num
stage text # new|contacted|negotiation|won|lost
lost_reason text
score int
assigned_to uuid fk=users null
next_follow_up_at ts null
`);

t("crm", "lead_stage_history", "Time in each stage", `
lead_id uuid fk=leads
from_stage text
to_stage text
changed_by uuid fk=users
changed_at ts
`);

t("crm", "lead_activities", "Calls, WhatsApps, meetings, notes", `
lead_id uuid fk=leads
type text
outcome text
notes text
done_by uuid fk=users
done_at ts
`);

t("crm", "site_visits", "Scheduled & completed visits", `
lead_id uuid fk=leads
project_id uuid fk=projects
property_id uuid fk=properties null
scheduled_at ts
accompanied_by uuid fk=users null
outcome text
`);

t("crm", "lead_assignment_rules", "Round-robin / by source / by city", `
name text
criteria jsonb
strategy text
agents jsonb
active bool
`);

t("crm", "conversations", "WhatsApp / SMS threads", `
party_id uuid fk=parties null
lead_id uuid fk=leads null
channel text
last_message_at ts
`);

t("crm", "messages", "Messages in a thread", `
conversation_id uuid fk=conversations
direction text # in|out
body text
provider_message_id text
status text
sent_at ts
`);

// ═══════════════════════════════════════════════ SALES & COLLECTIONS
t("sales", "quotations", "Price quote to a prospect", `
number text uq
customer_id uuid fk=parties null
lead_id uuid fk=leads null
property_id uuid fk=properties
sales_agent_id uuid fk=users
version int
valid_until date
status text # draft|sent|accepted|expired|converted
converted_booking_id uuid fk=bookings null
`);

t("sales", "quotation_lines", "Price, discount, charges", `
quotation_id uuid fk=quotations
description text
amount num
kind text # price|discount|development|premium
`);

t("sales", "payment_plan_templates", "Reusable plans (20% down + 24 monthly)", `
name text
project_id uuid fk=projects null
down_payment_pct num
active bool
`);

t("sales", "payment_plan_template_items", "Schedule rows of a template", `
template_id uuid fk=payment_plan_templates
kind text # installment|balloon|possession
count int
interval_months int
pct_of_price num
`);

t("sales", "bookings", "Sale agreement for one property", `
booking_no text uq
property_id uuid fk=properties
customer_id uuid fk=parties
sales_agent_id uuid fk=users null
dealer_id uuid fk=parties null
quotation_id uuid fk=quotations null
plan_template_id uuid fk=payment_plan_templates null
file_no text
booking_date date
list_price num
discount num
net_price num
payment_type text # cash|installment
status text # pending|confirmed|completed|cancelled
approved_by uuid fk=users null
`);

t("sales", "booking_parties", "Joint owners", `
booking_id uuid pk fk=bookings
party_id uuid pk fk=parties
share_pct num
`, { noid: true });

t("sales", "booking_nominees", "Nominee / next of kin", `
booking_id uuid fk=bookings
party_id uuid fk=parties
relation text
`);

t("sales", "installments", "Payment schedule rows", `
booking_id uuid fk=bookings
seq int
kind text # down_payment|installment|balloon|possession
due_date date
amount num
paid_amount num
status text # due|partial|paid|waived
`);

t("sales", "installment_reschedules", "Old vs new schedule when plans change", `
booking_id uuid fk=bookings
reason text
old_schedule jsonb
new_schedule jsonb
approved_by uuid fk=users
`);

t("sales", "penalty_rules", "Late-payment surcharge policy", `
project_id uuid fk=projects null
grace_days int
rate_pct num
flat_amount num
cap_amount num
active bool
`);

t("sales", "penalty_charges", "Surcharges raised on overdue installments", `
installment_id uuid fk=installments
rule_id uuid fk=penalty_rules
amount num
status text
`);

t("sales", "waivers", "Approved waivers of dues", `
installment_id uuid fk=installments null
penalty_id uuid fk=penalty_charges null
amount num
reason text
approved_by uuid fk=users
`);

t("sales", "receipts", "Money received", `
receipt_no text uq
customer_id uuid fk=parties
booking_id uuid fk=bookings null
received_on date
amount num
method text # cash|cheque|bank_transfer|online|pay_order|split
deposit_account_id uuid fk=gl_accounts null # null when split across several tenders
instrument_ref text
status text # posted|void
combined_txn_id uuid fk=combined_transactions null
journal_entry_id uuid fk=journal_entries null
`);

t("sales", "receipt_tenders", "How one receipt was paid: cash + cheque + online in a single receipt", `
receipt_id uuid fk=receipts
method text # cash|cheque|bank_transfer|online|pay_order
amount num
deposit_account_id uuid fk=gl_accounts
instrument_ref text
cheque_id uuid fk=cheques null
bank_name text
`);

t("sales", "receipt_allocations", "What a receipt settled — installments, penalties, invoices (one receipt can settle many)", `
receipt_id uuid fk=receipts
installment_id uuid fk=installments null
penalty_id uuid fk=penalty_charges null
sales_invoice_id uuid fk=sales_invoices null
service_invoice_id uuid fk=service_invoices null
amount num # exactly one target is set
`);

t("sales", "cheques", "Post-dated cheque register", `
cheque_no text
bank_name text
branch text
amount num
cheque_date date
received_on date
customer_id uuid fk=parties
booking_id uuid fk=bookings null
installment_id uuid fk=installments null
status text # in_hand|deposited|cleared|bounced
receipt_id uuid fk=receipts null
replaced_by uuid fk=cheques null
`);

t("sales", "cheque_events", "Deposit / clear / bounce history", `
cheque_id uuid fk=cheques
event text
event_date date
bounce_reason text
bank_charges num
`);

t("sales", "property_transfers", "Resale / change of ownership", `
booking_id uuid fk=bookings
from_party_id uuid fk=parties
to_party_id uuid fk=parties
transfer_fee num
tax_amount num
status text
approved_by uuid fk=users null
transferred_on date null
`);

t("sales", "booking_cancellations", "Cancellation & refund", `
booking_id uuid fk=bookings uq
reason text
deduction_pct num
forfeited_amount num
refund_amount num
refund_voucher_id uuid fk=vouchers null
approved_by uuid fk=users
`);

t("sales", "possessions", "Handover of the property", `
booking_id uuid fk=bookings uq
handover_date date
checklist jsonb
dues_cleared bool
`);

t("sales", "commission_rules", "Commission terms per dealer / project", `
dealer_id uuid fk=parties null
project_id uuid fk=projects null
basis text # pct_of_price|flat|slab
rate num
slabs jsonb
trigger_pct_received num
`);

t("sales", "commissions", "Accrued & paid commissions", `
booking_id uuid fk=bookings
payee_id uuid fk=parties
rule_id uuid fk=commission_rules
amount num
status text # accrued|payable|paid|clawed_back
payment_voucher_id uuid fk=vouchers null
`);

// ═══════════════════════════════════════════════ INVOICING & CONTRACTS
t("invoicing", "sales_invoices", "Invoice to a customer", `
number text uq
customer_id uuid fk=parties
booking_id uuid fk=bookings null
invoice_date date
due_date date
subtotal num
tax_amount num
total num
status text # unpaid|partial|paid|void
journal_entry_id uuid fk=journal_entries null
`);

t("invoicing", "sales_invoice_lines", "Invoice lines with tax", `
invoice_id uuid fk=sales_invoices
description text
quantity num
rate num
tax_code_id uuid fk=tax_codes null
tax_amount num
amount num
`);

t("invoicing", "billing_schedules", "Recurring maintenance / service billing", `
customer_id uuid fk=parties
property_id uuid fk=properties null
service_type text # maintenance|security|utility
amount num
frequency text
next_run_on date
active bool
`);

t("invoicing", "service_invoices", "Generated from billing schedules", `
number text uq
schedule_id uuid fk=billing_schedules null
customer_id uuid fk=parties
property_id uuid fk=properties null
period_label text
due_date date
amount num
status text
`);

t("invoicing", "credit_notes", "Reductions against an invoice", `
invoice_id uuid fk=sales_invoices
amount num
reason text
journal_entry_id uuid fk=journal_entries null
`);

t("invoicing", "contract_templates", "Agreement templates with merge fields", `
kind text # sale|lease|dealer|employment
language text
body_html text
merge_fields jsonb
active bool
`);

t("invoicing", "contracts", "Signed agreements with expiry", `
number text uq
template_id uuid fk=contract_templates null
kind text
title text
booking_id uuid fk=bookings null
start_date date
end_date date
status text # draft|active|expiring|expired|terminated
value num
signed_file_id uuid fk=documents null
renewal_of uuid fk=contracts null
`);

t("invoicing", "contract_parties", "Who is party to a contract", `
contract_id uuid pk fk=contracts
party_id uuid pk fk=parties
role text
`, { noid: true });

// ═══════════════════════════════════════════════ PROCUREMENT & STOCK
t("procurement", "expense_categories", "Expense types mapped to GL accounts", `
name text
account_id uuid fk=gl_accounts
parent_id uuid fk=expense_categories null
`);

t("procurement", "purchase_requests", "Internal request to buy", `
number text uq
project_id uuid fk=projects null
requested_by uuid fk=users
status text
needed_by date
`);

t("procurement", "purchase_orders", "Order to a vendor", `
number text uq
vendor_id uuid fk=parties
project_id uuid fk=projects null
request_id uuid fk=purchase_requests null
order_date date
total num
status text # draft|approved|received|closed
approved_by uuid fk=users null
`);

t("procurement", "po_lines", "Items ordered", `
po_id uuid fk=purchase_orders
stock_item_id uuid fk=stock_items null
description text
quantity num
rate num
amount num
`);

t("procurement", "goods_receipts", "Delivery received", `
po_id uuid fk=purchase_orders
warehouse_id uuid fk=warehouses null
received_on date
received_by uuid fk=users
`);

t("procurement", "vendor_bills", "Expense / payable (replaces the prototype's Expense)", `
number text uq
vendor_id uuid fk=parties
po_id uuid fk=purchase_orders null
project_id uuid fk=projects null
category_id uuid fk=expense_categories
bill_date date
due_date date
subtotal num
tax_amount num
total num
status text # unpaid|partial|paid|void
journal_entry_id uuid fk=journal_entries null
`);

t("procurement", "bill_lines", "Bill lines", `
bill_id uuid fk=vendor_bills
description text
account_id uuid fk=gl_accounts
project_id uuid fk=projects null
cost_center_id uuid fk=cost_centers null
tax_code_id uuid fk=tax_codes null
tax_amount num
amount num
`);

t("procurement", "bill_payments", "Payments applied to bills", `
bill_id uuid pk fk=vendor_bills
voucher_id uuid pk fk=vouchers
amount num
`, { noid: true });

t("procurement", "petty_cash_floats", "Imprest float and replenishment", `
custodian_id uuid fk=users
account_id uuid fk=gl_accounts
float_amount num
`);

t("procurement", "recurring_templates", "Recurring bills", `
vendor_id uuid fk=parties
category_id uuid fk=expense_categories
amount num
frequency text
next_run_on date
`);

t("procurement", "warehouses", "Stores / site yards", `
name text
project_id uuid fk=projects null
`);

t("procurement", "stock_items", "Materials (cement, steel, tiles…)", `
sku text uq
name text
unit text
avg_cost num
reorder_level num
`);

t("procurement", "stock_movements", "In / out / transfer ledger", `
item_id uuid fk=stock_items
warehouse_id uuid fk=warehouses
movement_type text # receipt|issue|transfer|adjustment
quantity num
unit_cost num
ref_type text
ref_id uuid null
moved_on date
`);

// ═══════════════════════════════════════════════ CONSTRUCTION & COSTING
t("construction", "construction_contracts", "Contractor engagement on a project", `
number text uq
project_id uuid fk=projects
contractor_id uuid fk=parties
scope_of_work text
contract_value num
retention_pct num
advance_amount num
start_date date
end_date date
status text # active|completed|terminated
progress_pct num
`);

t("construction", "contract_items", "BOQ lines", `
contract_id uuid fk=construction_contracts
cost_code text
description text
unit text
quantity num
rate num
amount num
`);

t("construction", "ipcs", "Interim payment certificates (running bills)", `
contract_id uuid fk=construction_contracts
ipc_no int
period_end date
gross_amount num
retention_held num
advance_recovered num
other_deductions num
net_payable num
status text # draft|approved|paid
bill_id uuid fk=vendor_bills null
`);

t("construction", "ipc_lines", "Measured quantity per BOQ line", `
ipc_id uuid fk=ipcs
item_id uuid fk=contract_items
quantity_this_period num
cumulative_quantity num
amount num
`);

t("construction", "retention_ledger", "Retention held and released", `
contract_id uuid fk=construction_contracts
ipc_id uuid fk=ipcs null
amount num # + held, - released
event_date date
note text
`);

t("construction", "variation_orders", "Approved changes to scope/value", `
contract_id uuid fk=construction_contracts
description text
amount num
status text
approved_by uuid fk=users null
`);

t("construction", "milestones", "Planned milestones", `
contract_id uuid fk=construction_contracts
name text
planned_date date
actual_date date null
weight_pct num
`);

t("construction", "progress_reports", "Site progress reports", `
contract_id uuid fk=construction_contracts
report_date date
progress_pct num
notes text
reported_by uuid fk=users
`);

t("construction", "progress_photos", "Photos with date and location", `
report_id uuid fk=progress_reports
file_id uuid fk=documents
caption text
taken_at ts
geom geom null
`);

t("construction", "contractor_ratings", "Performance history", `
contractor_id uuid fk=parties
contract_id uuid fk=construction_contracts null
rating int
comment text
rated_by uuid fk=users
`);

t("construction", "guarantees", "Bank guarantees / insurance with expiry", `
contract_id uuid fk=construction_contracts
kind text
reference_no text
amount num
expires_on date
file_id uuid fk=documents null
`);

t("construction", "material_issues", "Stock issued to a contract", `
contract_id uuid fk=construction_contracts
stock_movement_id uuid fk=stock_movements
value num
`);

// ═══════════════════════════════════════════════ HR, ATTENDANCE & PAYROLL
t("hr", "departments", "Sales, Accounts, Operations…", `
name text uq
head_employee_id uuid fk=employees null
`);

t("hr", "designations", "Job titles", `
name text uq
level int
`);

t("hr", "employees", "Employee file (also a party)", `
party_id uuid fk=parties uq
user_id uuid fk=users null uq # login, if any
employee_no text uq
department_id uuid fk=departments
designation_id uuid fk=designations
manager_id uuid fk=employees null
employment_type text
joined_on date
probation_end date null
confirmed_on date null
exit_date date null
bank_iban text
status text
`);

t("hr", "salary_components", "Basic, house rent, conveyance, medical…", `
code text uq
name text
kind text # earning|deduction
taxable bool
formula jsonb
`);

t("hr", "employee_salary_components", "Effective-dated salary structure", `
employee_id uuid fk=employees
component_id uuid fk=salary_components
amount num
effective_from date
effective_to date null
`);

t("hr", "salary_history", "Increments & changes", `
employee_id uuid fk=employees
previous_total num
new_total num
effective_date date
reason text
approved_by uuid fk=users
`);

t("hr", "shifts", "Working shifts", `
name text
start_time text
end_time text
grace_minutes int
`);

t("hr", "attendance_logs", "Raw check-in / check-out events", `
employee_id uuid fk=employees
logged_at ts
direction text
source text # web|mobile|biometric
geom geom null
`);

t("hr", "attendance_daily", "Daily summary used by payroll", `
employee_id uuid fk=employees
work_date date
shift_id uuid fk=shifts null
status text # present|absent|leave|holiday
late_minutes int
overtime_minutes int
`);

t("hr", "holidays", "Public holiday calendar", `
holiday_date date
name text
`);

t("hr", "leave_types", "Casual, Sick, Annual, Unpaid", `
name text uq
paid bool
carry_forward bool
`);

t("hr", "leave_policies", "Entitlement rules", `
leave_type_id uuid fk=leave_types
annual_days num
accrual text
max_carry num
`);

t("hr", "leave_balances", "Balance per employee per year", `
employee_id uuid fk=employees
leave_type_id uuid fk=leave_types
year int
entitled num
used num
carried num
`);

t("hr", "leave_requests", "Applications", `
employee_id uuid fk=employees
leave_type_id uuid fk=leave_types
from_date date
to_date date
days num
reason text
status text # pending|approved|rejected
approved_by uuid fk=users null
`);

t("hr", "payroll_runs", "Monthly payroll batch", `
period_id uuid fk=accounting_periods
month text
status text # draft|reviewed|approved|disbursed|locked
total_gross num
total_net num
journal_entry_id uuid fk=journal_entries null
approved_by uuid fk=users null
`);

t("hr", "payslips", "One per employee per run", `
run_id uuid fk=payroll_runs
employee_id uuid fk=employees
gross num
deductions num
net num
pdf_file_id uuid fk=documents null
`);

t("hr", "payslip_lines", "Earnings / deductions", `
payslip_id uuid fk=payslips
component_id uuid fk=salary_components null
label text
kind text
amount num
`);

t("hr", "staff_loans", "Advances & loans to staff", `
employee_id uuid fk=employees
principal num
installments int
issued_on date
status text
approved_by uuid fk=users
voucher_id uuid fk=vouchers null
`);

t("hr", "loan_installments", "Recovered through payroll", `
loan_id uuid fk=staff_loans
due_month text
amount num
recovered_in_payslip_id uuid fk=payslips null
`);

t("hr", "sales_targets", "Monthly targets per agent", `
employee_id uuid fk=employees
month text
target_amount num
achieved_amount num
`);

t("hr", "incentive_rules", "Commission / bonus rules for agents", `
name text
basis text
rate num
slabs jsonb
active bool
`);

// ═══════════════════════════════════════════════ REPORTING & SAAS BILLING
t("saas", "company_kpi_snapshots", "Daily summary for Group Overview & dashboards", `
snapshot_date date
properties int
available int
collections num
cash num
receivable num
overdue num
`);

t("saas", "saved_reports", "Custom report definitions", `
name text
module text
definition jsonb
owner_id uuid fk=users
shared bool
`);

t("saas", "report_schedules", "Emailed reports", `
report_id uuid fk=saved_reports
cron text
recipients jsonb
format text
last_run_at ts null
`);

t("saas", "plans", "Basic / Moderate / Premium", `
code text uq
name text
price_monthly num
`, { global: true });

t("saas", "plan_limits", "Seats, companies, projects, storage per plan", `
plan_id uuid fk=plans
limit_key text
limit_value int
`, { global: true });

t("saas", "subscriptions", "An organization's plan", `
org_id uuid fk=organizations
plan_id uuid fk=plans
status text # trial|active|past_due|cancelled
current_period_end date
cancel_at ts null
`, { global: true });

t("saas", "subscription_items", "Add-ons (extra seats / companies)", `
subscription_id uuid fk=subscriptions
item_key text
quantity int
`, { global: true });

t("saas", "usage_meters", "Measured usage", `
org_id uuid fk=organizations
meter text
value num
recorded_on date
`, { global: true });

t("saas", "saas_invoices", "Our invoices to the customer", `
org_id uuid fk=organizations
subscription_id uuid fk=subscriptions
amount num
status text
due_date date
`, { global: true });

t("saas", "saas_payments", "Payments received", `
invoice_id uuid fk=saas_invoices
method text # card|jazzcash|easypaisa|bank
amount num
reference text
paid_at ts
`, { global: true });

t("saas", "dunning_events", "Failed-payment reminders", `
invoice_id uuid fk=saas_invoices
attempt int
sent_at ts
`, { global: true });

t("saas", "coupons", "Discount codes", `
code text uq
percent_off num
valid_until date null
`, { global: true });

// ═══════════════════════════════════════════════ SUB-DIAGRAMS
// Each feature area is drawn as one or more readable diagrams (every table must appear exactly once).
export const SUBGROUPS = {
  platform: [
    ["Identity & access", ["users", "org_members", "roles", "role_permissions", "company_members", "invitations", "sessions", "api_keys"]],
    ["Organization & settings", ["organizations", "companies", "settings", "feature_flags", "document_sequences"]],
  ],
  services: [
    ["Audit, files & collaboration", ["audit_log", "documents", "document_links", "comments", "tags", "tag_links", "custom_field_definitions", "saved_views"]],
    ["Approvals & messaging", ["approval_policies", "approval_requests", "approval_steps", "notification_templates", "notifications", "outbound_messages", "tasks"]],
    ["Templates, imports & integrations", ["import_jobs", "export_jobs", "document_templates", "generated_documents", "outbox_events", "webhook_endpoints", "webhook_deliveries", "idempotency_keys"]],
  ],
  accounting: [
    ["Chart of accounts & ledger", ["fiscal_years", "accounting_periods", "gl_accounts", "cost_centers", "journal_entries", "journal_lines", "account_balances", "opening_balances", "posting_rules"]],
    ["Vouchers & combined transactions", ["vouchers", "voucher_lines", "recurring_vouchers", "combined_transactions", "combined_transaction_items"]],
    ["Bank reconciliation", ["bank_statements", "bank_statement_lines", "bank_reconciliations"]],
  ],
  projects: [
    ["Project & land", ["projects", "project_phases", "project_blocks", "project_approvals", "land_parcels", "land_acquisitions", "project_documents"]],
    ["Property core & location", ["property_types", "properties", "property_locations", "property_dimensions", "property_geometries"]],
    ["Property specifications & features", ["property_plot_specs", "property_building_specs", "property_commercial_specs", "amenity_catalog", "property_amenities", "property_utilities", "property_nearby_places"]],
    ["Property legal, ownership & valuation", ["property_legal", "property_documents", "property_ownership_history", "property_encumbrances", "property_valuations", "property_inspections", "property_tenancies"]],
    ["Property media, listings, pricing & charges", ["property_media", "property_listings", "property_charges", "price_lists", "price_list_items", "pricing_rules", "property_price_history", "property_status_history", "property_holds"]],
  ],
  sales: [
    ["Quotation & booking", ["quotations", "quotation_lines", "payment_plan_templates", "payment_plan_template_items", "bookings", "booking_parties", "booking_nominees"]],
    ["Installments & penalties", ["installments", "installment_reschedules", "penalty_rules", "penalty_charges", "waivers"]],
    ["Receipts (split tenders & allocations)", ["receipts", "receipt_tenders", "receipt_allocations"]],
    ["Cheques, commissions & after-sales", ["cheques", "cheque_events", "commission_rules", "commissions", "property_transfers", "booking_cancellations", "possessions"]],
  ],
  procurement: [
    ["Purchasing & vendor bills", ["expense_categories", "purchase_requests", "purchase_orders", "po_lines", "goods_receipts", "vendor_bills", "bill_lines", "bill_payments", "recurring_templates"]],
    ["Petty cash & stock", ["petty_cash_floats", "warehouses", "stock_items", "stock_movements"]],
  ],
  construction: [
    ["Contracts & running bills", ["construction_contracts", "contract_items", "ipcs", "ipc_lines", "retention_ledger", "variation_orders"]],
    ["Progress, quality & materials", ["milestones", "progress_reports", "progress_photos", "contractor_ratings", "guarantees", "material_issues"]],
  ],
  hr: [
    ["Employees & salary structure", ["departments", "designations", "employees", "salary_components", "employee_salary_components", "salary_history"]],
    ["Attendance & leave", ["shifts", "attendance_logs", "attendance_daily", "holidays", "leave_types", "leave_policies", "leave_balances", "leave_requests"]],
    ["Payroll, loans & targets", ["payroll_runs", "payslips", "payslip_lines", "staff_loans", "loan_installments", "sales_targets", "incentive_rules"]],
  ],
  budget: [
    ["Budget setup & phasing", ["budget_templates", "budget_template_lines", "budgets", "budget_lines", "budget_line_periods", "budget_snapshots"]],
    ["Revisions, commitments & control", ["budget_revisions", "budget_revision_lines", "budget_commitments", "budget_exceptions", "budget_alert_rules", "budget_alerts", "budget_forecasts"]],
  ],
  tax: [
    ["Tax setup (codes, rates, bundles, rules)", ["tax_authorities", "tax_codes", "tax_rates", "tax_groups", "tax_group_items", "tax_assignments", "party_tax_exemptions"]],
    ["Tax computed, returns & payments", ["document_taxes", "tax_returns", "tax_return_lines", "tax_payments"]],
  ],
  group: [
    ["Inter-company transactions", ["intercompany_accounts", "intercompany_transactions"]],
    ["Consolidation & eliminations", ["consolidation_groups", "consolidation_members", "group_accounts", "group_account_map", "consolidation_runs", "consolidated_balances", "elimination_entries", "elimination_lines"]],
  ],
  saas: [
    ["Reporting", ["company_kpi_snapshots", "saved_reports", "report_schedules"]],
    ["Subscription billing", ["plans", "plan_limits", "subscriptions", "subscription_items", "usage_meters", "saas_invoices", "saas_payments", "dunning_events", "coupons"]],
  ],
};
