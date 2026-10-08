-- ============================================================================
-- PropIQ — core production schema (PostgreSQL 15+)
--
-- Scope: the foundation every module builds on — tenancy, identity & RBAC,
-- audit, document numbering, the double-entry ledger (chart of accounts AND
-- vouchers — the COA is the structure, vouchers are the documents that post
-- into it), the rich property model, parties, bookings, installments, receipts
-- with split tenders, combined transactions, the admin-configurable tax module,
-- budgeting with commitments, revisions and spend control, and inter-company
-- transactions with consolidation.
-- The remaining modules (CRM, HR/payroll, procurement, construction, ...)
-- follow the same conventions; see docs/BACKEND_DESIGN.md §6 for their tables.
--
-- Conventions
--   * Every business table carries company_id and is protected by RLS.
--   * Money is NUMERIC(18,2); never float. Quantities of land are NUMERIC(12,2) marla.
--   * Ids are uuid (app should generate UUIDv7 for index locality; gen_random_uuid()
--     is the default so the schema works anywhere).
--   * Status/type columns are text + CHECK (cheap to evolve, unlike enums).
--   * Posted accounting rows are append-only; corrections are reversals.
--   * Tenant context is set per transaction:  SET LOCAL app.company_id = '<uuid>'.
-- ============================================================================

create schema if not exists app;

-- ---------------------------------------------------------------- tenant context
create or replace function app.current_company() returns uuid
language sql stable as $$ select nullif(current_setting('app.company_id', true), '')::uuid $$;

create or replace function app.current_user_id() returns uuid
language sql stable as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function app.current_org() returns uuid
language sql stable as $$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;   -- optimistic locking: UPDATE ... WHERE version = :seen
  return new;
end $$;

-- ---------------------------------------------------------------- organizations / companies
-- organization = the paying customer (a group owner); company = a legal entity inside it.
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  plan          text not null default 'basic' check (plan in ('basic','moderate','premium')),
  status        text not null default 'active' check (status in ('trial','active','past_due','suspended','closed')),
  created_at    timestamptz not null default now()
);

create table companies (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id),
  name               text not null,
  short_name         text,
  ntn                text,
  strn               text,
  city               text,
  province           text,
  address            text,
  phone              text,
  email              text,
  base_currency      char(3) not null default 'PKR',
  fiscal_year_start  smallint not null default 7 check (fiscal_year_start between 1 and 12), -- Pakistan: July
  settings           jsonb not null default '{}',
  status             text not null default 'active' check (status in ('active','suspended','archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            int not null default 1
);
create index companies_org_idx on companies(org_id);
create trigger companies_touch before update on companies for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------- identity & RBAC
create table users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  phone          text,
  full_name      text not null,
  password_hash  text,                       -- null when an external IdP owns credentials
  mfa_enabled    boolean not null default false,
  status         text not null default 'active' check (status in ('invited','active','suspended')),
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);
create unique index users_email_uq on users (lower(email));

create table org_members (
  org_id    uuid not null references organizations(id),
  user_id   uuid not null references users(id),
  org_role  text not null default 'member' check (org_role in ('owner','admin','member')),
  primary key (org_id, user_id)
);

-- roles are per organization (org_id) or platform defaults (org_id null, is_system)
create table roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id),
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index roles_name_uq on roles (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table role_permissions (
  role_id      uuid not null references roles(id) on delete cascade,
  module       text not null,   -- matches PERMISSION_MODULES keys in the frontend
  can_view     boolean not null default false,
  can_create   boolean not null default false,
  can_edit     boolean not null default false,
  can_delete   boolean not null default false,
  can_approve  boolean not null default false,
  data_scope   text not null default 'company' check (data_scope in ('own','team','project','company')),
  primary key (role_id, module)
);

-- a user can hold a different role in each company of the group
create table company_members (
  company_id  uuid not null references companies(id),
  user_id     uuid not null references users(id),
  role_id     uuid not null references roles(id),
  status      text not null default 'active' check (status in ('invited','active','suspended')),
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on company_members(user_id);

-- ---------------------------------------------------------------- audit trail (append-only, partitioned)
create table audit_log (
  id           bigint generated always as identity,
  occurred_at  timestamptz not null default now(),
  company_id   uuid not null,
  user_id      uuid,
  action       text not null,                  -- create | update | delete | approve | login | export ...
  entity_type  text not null,
  entity_id    uuid,
  before_data  jsonb,
  after_data   jsonb,
  ip           inet,
  request_id   text,
  primary key (id, occurred_at)
) partition by range (occurred_at);
create table audit_log_default partition of audit_log default;   -- ops job creates monthly partitions ahead of time
create index audit_log_entity_idx on audit_log (company_id, entity_type, entity_id, occurred_at desc);

-- ---------------------------------------------------------------- document numbering
create table document_sequences (
  company_id  uuid not null references companies(id),
  doc_type    text not null,        -- 'CPV','BPV','CRV','BRV','JV','BOOKING','RECEIPT','INVOICE',...
  period_key  text not null default 'ALL',   -- e.g. 'FY2026' to restart numbering each fiscal year
  prefix      text not null,
  next_value  bigint not null default 1,
  primary key (company_id, doc_type, period_key)
);

-- Atomic, per-company, per-period counter. Row lock => no duplicates under concurrency.
create or replace function app.next_doc_no(p_company uuid, p_type text, p_period text default 'ALL')
returns text language plpgsql as $$
declare v_prefix text; v_n bigint;
begin
  insert into document_sequences (company_id, doc_type, period_key, prefix, next_value)
  values (p_company, p_type, p_period, p_type, 2)
  on conflict (company_id, doc_type, period_key)
  do update set next_value = document_sequences.next_value + 1
  returning prefix, next_value - 1 into v_prefix, v_n;
  return v_prefix || '-' || lpad(v_n::text, 5, '0');
end $$;

-- ---------------------------------------------------------------- parties (one address book)
-- A person/organization is stored once and can be customer, vendor, contractor,
-- dealer and employee at the same time (no duplicate "customer" vs "dealer" rows).
create table parties (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  kind          text not null default 'person' check (kind in ('person','organization')),
  display_name  text not null,
  legal_name    text,
  name_ur       text,                          -- Urdu rendering for bilingual documents
  cnic          text,                          -- encrypt at rest in production (see design doc §9)
  ntn           text,
  phone_e164    text,                          -- normalized +923XXXXXXXXX, used for de-duplication
  email         text,
  city          text,
  address       text,
  notes         text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       int not null default 1,
  deleted_at    timestamptz
);
create unique index parties_cnic_uq  on parties (company_id, cnic) where cnic is not null and deleted_at is null;
create index parties_phone_idx on parties (company_id, phone_e164);
create index parties_name_idx  on parties (company_id, lower(display_name));
create trigger parties_touch before update on parties for each row execute function app.touch_updated_at();

create table party_roles (
  company_id  uuid not null references companies(id),
  party_id    uuid not null references parties(id),
  role        text not null check (role in ('customer','vendor','contractor','dealer','employee','lead','investor','landowner')),
  primary key (party_id, role)
);

-- ---------------------------------------------------------------- accounting calendar
create table fiscal_years (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  name        text not null,                        -- 'FY2025-26'
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'open' check (status in ('open','closed')),
  check (end_date > start_date),
  unique (company_id, name)
);

create table accounting_periods (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  fiscal_year_id uuid not null references fiscal_years(id),
  start_date     date not null,
  end_date       date not null,
  status         text not null default 'open' check (status in ('open','locked')),  -- locked = no posting
  check (end_date >= start_date),
  unique (company_id, start_date)
);

-- ---------------------------------------------------------------- chart of accounts (levelled 2-2-2-4 codes)
create table gl_accounts (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  code           text not null,
  name           text not null,
  account_class  text not null check (account_class in ('asset','liability','equity','income','expense')),
  category       text not null,                    -- asset_cash, liability_payable, ...
  parent_id      uuid references gl_accounts(id),
  is_group       boolean not null default false,   -- headers never receive postings
  is_system      boolean not null default false,   -- control accounts used by auto-posting
  requires_party boolean not null default false,   -- receivable/payable accounts demand a party on each line
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (company_id, code)
);
create index gl_accounts_parent_idx on gl_accounts(parent_id);

create table cost_centers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  code        text not null,
  name        text not null,
  active      boolean not null default true,
  unique (company_id, code)
);

-- ---------------------------------------------------------------- projects & properties
create table projects (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id),
  code               text not null,
  name               text not null,
  type               text not null check (type in ('residential','commercial','mixed_use')),
  status             text not null default 'planning' check (status in ('planning','active','on_hold','completed','cancelled')),
  city               text,
  address            text,
  land_area_marla    numeric(14,2),
  manager_id         uuid references users(id),
  approved_budget    numeric(18,2) not null default 0,
  planned_start      date,
  planned_end        date,
  actual_start       date,
  handover_date      date,
  description        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            int not null default 1,
  deleted_at         timestamptz,
  unique (company_id, code)
);
create trigger projects_touch before update on projects for each row execute function app.touch_updated_at();

create table project_blocks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  project_id  uuid not null references projects(id),
  name        text not null,
  phase       text,
  unique (project_id, name)
);

create table property_types (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  code           text not null,                       -- plot, house, flat, shop, office, farmhouse, warehouse ...
  name           text not null,
  property_group text not null check (property_group in ('residential','commercial','industrial','agricultural')),
  active         boolean not null default true,
  unique (company_id, code)
);

-- The hub every detail table hangs off. Anything specific to a kind of property
-- (rooms, frontage, legal status ...) lives in its own 1:1 or 1:N table so the
-- hub stays narrow and each detail can be queried, secured and indexed on its own.
create table properties (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies(id),
  project_id             uuid references projects(id),          -- null for standalone / consignment stock
  block_id               uuid references project_blocks(id),
  type_id                uuid not null references property_types(id),
  code                   text not null,
  listing_ref            text,
  title                  text not null,
  title_ur               text,
  description            text,
  purpose                text not null default 'sale' check (purpose in ('sale','rent','both')),
  list_price             numeric(18,2) not null check (list_price >= 0),
  price_per_marla        numeric(18,2),
  price_negotiable       boolean not null default false,
  installments_available boolean not null default false,
  possession_status      text check (possession_status in ('ready','under_construction','off_plan')),
  possession_date        date,
  ownership_source       text not null default 'own_inventory' check (ownership_source in ('own_inventory','consignment','dealer_stock','client_listing')),
  owner_party_id         uuid references parties(id),
  is_featured            boolean not null default false,
  status                 text not null default 'available' check (status in ('available','reserved','sold','blocked','rented','cancelled')),
  internal_notes         text,
  attributes             jsonb not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  version                int not null default 1,
  deleted_at             timestamptz,
  unique (company_id, code)
);
create index properties_project_status_idx on properties (company_id, project_id, status);
create trigger properties_touch before update on properties for each row execute function app.touch_updated_at();

create table property_price_history (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id),
  property_id  uuid not null references properties(id),
  price        numeric(18,2) not null,
  effective_from timestamptz not null default now(),
  changed_by   uuid references users(id),
  reason       text
);
create index price_history_prop_idx on property_price_history (property_id, effective_from desc);

-- Files (metadata only — the bytes live in object storage).
create table documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id),
  storage_key  text not null,
  file_name    text not null,
  mime         text,
  size_bytes   bigint,
  sha256       text,
  uploaded_by  uuid references users(id),
  created_at   timestamptz not null default now()
);

create table property_locations (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id),
  property_id          uuid not null unique references properties(id) on delete cascade,
  plot_no              text, street_no text, sector text, phase text, society text,
  area_name            text, city text, province text, postal_code text, landmark text,
  latitude             numeric(9,6) check (latitude between -90 and 90),
  longitude            numeric(9,6) check (longitude between -180 and 180),
  road_name            text,
  road_width_ft        numeric(6,1) check (road_width_ft >= 0),
  distance_main_road_m numeric(8,1) check (distance_main_road_m >= 0),
  facing               text check (facing in ('north','south','east','west','north_east','north_west','south_east','south_west'))
);
create index property_locations_area_idx on property_locations (company_id, city, area_name);

create table property_dimensions (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id),
  property_id        uuid not null unique references properties(id) on delete cascade,
  size_value         numeric(12,2) not null check (size_value > 0),
  size_unit          text not null check (size_unit in ('marla','kanal','sqft','sqyd','acre')),
  size_sqft          numeric(12,2),                    -- normalized with the company's conversion setting
  covered_area_sqft  numeric(12,2),
  frontage_ft        numeric(8,2), depth_ft numeric(8,2), length_ft numeric(8,2), width_ft numeric(8,2),
  shape              text check (shape in ('regular','irregular','triangular')),
  corner             boolean not null default false,
  plot_cut           text
);

create table property_plot_specs (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id),
  property_id           uuid not null unique references properties(id) on delete cascade,
  land_use              text check (land_use in ('residential','commercial','agricultural','mixed')),
  plot_condition        text check (plot_condition in ('developed','undeveloped','semi_developed')),
  balloted              boolean, disputed boolean, park_facing boolean, boulevard_facing boolean,
  boundary_wall         boolean, possession_available boolean,
  file_type             text check (file_type in ('open_file','allocation_letter','registered')),
  zoning_note           text, topography text, soil_type text
);

create table property_building_specs (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id),
  property_id          uuid not null unique references properties(id) on delete cascade,
  bedrooms int check (bedrooms >= 0), bathrooms int check (bathrooms >= 0), kitchens int check (kitchens >= 0),
  drawing_rooms int, dining_rooms int, tv_lounges int, servant_quarters int, store_rooms int,
  laundry_rooms int, study_rooms int, prayer_rooms int, balconies int, terraces int, parking_spaces int,
  floors_total int, floor_no int, unit_no text, tower_name text,
  year_built int check (year_built between 1900 and 2100), age_years int,
  construction_status  text check (construction_status in ('grey_structure','finished','under_construction')),
  condition            text check (condition in ('new','excellent','good','needs_renovation')),
  furnishing           text check (furnishing in ('unfurnished','semi','furnished')),
  flooring text, kitchen_type text, view text
);

create table property_commercial_specs (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id),
  property_id        uuid not null unique references properties(id) on delete cascade,
  commercial_type    text check (commercial_type in ('shop','office','showroom','warehouse','factory','plaza_floor')),
  frontage_ft        numeric(8,2), mezzanine boolean, floor_height_ft numeric(6,1),
  footfall           text check (footfall in ('low','medium','high')),
  suitable_for       text, expected_rent numeric(18,2), expected_roi_pct numeric(6,2),
  loading_bay        boolean, power_load_kw numeric(8,2)
);

-- Admin-extendable master list of features (parking, lift, gas, solar, security ...).
create table amenity_catalog (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  code        text not null,
  name        text not null,
  name_ur     text,
  category    text not null check (category in ('plot_features','building','community','security','business_comm','healthcare_rec','eco','nearby')),
  input_type  text not null default 'yes_no' check (input_type in ('yes_no','number','text')),
  applies_to  jsonb not null default '[]',
  sort_order  int not null default 0,
  active      boolean not null default true,
  unique (company_id, code)
);

create table property_amenities (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id),
  property_id  uuid not null references properties(id) on delete cascade,
  amenity_id   uuid not null references amenity_catalog(id),
  value_bool   boolean, value_num numeric(14,2), value_text text,
  check (num_nonnulls(value_bool, value_num, value_text) >= 1),
  unique (property_id, amenity_id)
);
create index property_amenities_amenity_idx on property_amenities (company_id, amenity_id);   -- "all properties with a lift"

create table property_utilities (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  property_id     uuid not null references properties(id) on delete cascade,
  utility         text not null check (utility in ('electricity','gas','water','sewerage','internet','telephone','solar','generator')),
  status          text not null check (status in ('available','nearby','applied','not_available')),
  provider text, connection_no text, meter_no text, connected_on date, est_monthly_bill numeric(14,2),
  unique (property_id, utility)
);

create table property_nearby_places (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  property_id    uuid not null references properties(id) on delete cascade,
  category       text not null check (category in ('school','hospital','mosque','market','park','airport','motorway','public_transport')),
  name           text not null,
  distance_km    numeric(7,2) check (distance_km >= 0),
  travel_minutes int, latitude numeric(9,6), longitude numeric(9,6)
);

create table property_media (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  property_id uuid not null references properties(id) on delete cascade,
  kind        text not null check (kind in ('photo','video','tour_360','floor_plan','site_plan','drone','brochure')),
  file_id     uuid not null references documents(id),
  caption     text, sort_order int not null default 0,
  is_cover    boolean not null default false,
  visibility  text not null default 'public' check (visibility in ('public','internal')),
  taken_at    timestamptz
);
create unique index property_media_one_cover on property_media (property_id) where is_cover;

create table property_legal (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  property_id      uuid not null unique references properties(id) on delete cascade,
  ownership_type   text check (ownership_type in ('freehold','leasehold','allotment','power_of_attorney','file')),
  title_status     text check (title_status in ('clear','under_verification','disputed')),
  registry_no text, fard_no text, khasra_no text, allotment_no text, allotment_date date,
  mutation_status text, noc_status text,
  transfer_status  text check (transfer_status in ('transferable','restricted','transferred')),
  lease_start date, lease_end date, ground_rent numeric(14,2),
  legal_notes text,
  verified_by uuid references users(id), verified_on date
);

create table property_documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id),
  property_id  uuid not null references properties(id) on delete cascade,
  doc_type     text not null check (doc_type in ('registry','fard','allotment_letter','noc','sale_deed','site_plan','tax_receipt','utility_bill')),
  file_id      uuid not null references documents(id),
  reference_no text, issued_on date, expires_on date,
  status       text not null default 'pending' check (status in ('pending','verified','rejected')),
  verified_by  uuid references users(id)
);

-- Full chain of title. Exactly one open row (to_date is null) = the current owner.
create table property_ownership_history (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  property_id      uuid not null references properties(id) on delete cascade,
  owner_party_id   uuid not null references parties(id),
  acquisition_type text not null check (acquisition_type in ('purchase','inheritance','gift','allotment','transfer')),
  from_date        date not null,
  to_date          date,
  price            numeric(18,2), deed_ref text,
  booking_id       uuid,                              -- FK added after bookings exists
  check (to_date is null or to_date >= from_date)
);
create unique index property_one_current_owner on property_ownership_history (property_id) where to_date is null;

create table property_encumbrances (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  property_id     uuid not null references properties(id) on delete cascade,
  kind            text not null check (kind in ('mortgage','lien','court_stay','litigation','tenancy_right')),
  holder_party_id uuid references parties(id),
  amount          numeric(18,2), since date not null, released_on date,
  status          text not null default 'active' check (status in ('active','released')),
  notes           text
);

create table property_valuations (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  property_id      uuid not null references properties(id) on delete cascade,
  valuation_date   date not null,
  method           text not null check (method in ('market','bank','internal')),
  value            numeric(18,2) not null check (value >= 0),
  valuer_party_id  uuid references parties(id),
  report_file_id   uuid references documents(id),
  notes            text
);

create table property_inspections (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  property_id      uuid not null references properties(id) on delete cascade,
  inspected_on     date not null,
  inspector_id     uuid not null references users(id),
  condition_rating int check (condition_rating between 1 and 5),
  checklist        jsonb not null default '{}',
  findings         text,
  report_file_id   uuid references documents(id)
);

create table property_tenancies (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id),
  property_id           uuid not null references properties(id) on delete cascade,
  tenant_party_id       uuid not null references parties(id),
  monthly_rent          numeric(18,2) not null check (monthly_rent >= 0),
  security_deposit      numeric(18,2) not null default 0,
  start_date            date not null, end_date date,
  status                text not null default 'active' check (status in ('active','ended','notice')),
  agreement_contract_id uuid
);
create unique index property_one_active_tenancy on property_tenancies (property_id) where status = 'active';

-- Syndication: the same property can be published on several channels (own site, portals ...).
create table property_listings (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id),
  property_id         uuid not null references properties(id) on delete cascade,
  channel             text not null check (channel in ('website','zameen','olx','facebook','walk_in')),
  external_ref        text, listing_title text, listing_description text,
  asking_price        numeric(18,2),
  status              text not null default 'draft' check (status in ('draft','live','paused','expired')),
  published_at timestamptz, expires_at timestamptz,
  views int not null default 0, inquiries int not null default 0, last_synced_at timestamptz
);
create unique index property_one_open_listing_per_channel on property_listings (property_id, channel) where status in ('draft','live','paused');

-- ---------------------------------------------------------------- journal (single source of financial truth)
create table journal_entries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  entry_no      text not null,
  entry_date    date not null,
  period_id     uuid not null references accounting_periods(id),
  source_type   text not null check (source_type in ('voucher','receipt','invoice','payroll','bill','opening','adjustment','system')),
  source_id     uuid,
  description   text,
  status        text not null default 'posted' check (status in ('posted','reversed')),
  reversal_of   uuid references journal_entries(id),
  posted_by     uuid references users(id),
  posted_at     timestamptz not null default now(),
  unique (company_id, entry_no)
);
create index journal_entries_source_idx on journal_entries (company_id, source_type, source_id);
create index journal_entries_date_idx on journal_entries (company_id, entry_date);

create table journal_lines (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  entry_id       uuid not null references journal_entries(id),
  line_no        int not null,
  account_id     uuid not null references gl_accounts(id),
  party_id       uuid references parties(id),
  project_id     uuid references projects(id),
  cost_center_id uuid references cost_centers(id),
  debit          numeric(18,2) not null default 0 check (debit >= 0),
  credit         numeric(18,2) not null default 0 check (credit >= 0),
  memo           text,
  check ((debit = 0) <> (credit = 0)),            -- exactly one side per line
  unique (entry_id, line_no)
);
create index journal_lines_account_idx on journal_lines (company_id, account_id);
create index journal_lines_party_idx   on journal_lines (company_id, party_id) where party_id is not null;
create index journal_lines_project_idx on journal_lines (company_id, project_id) where project_id is not null;

-- Rule 1: every entry balances. Deferred, so lines can be inserted one by one inside a transaction.
create or replace function app.assert_entry_balanced() returns trigger
language plpgsql as $$
declare v_entry uuid := coalesce(new.entry_id, old.entry_id); v_diff numeric;
begin
  select coalesce(sum(debit),0) - coalesce(sum(credit),0) into v_diff from journal_lines where entry_id = v_entry;
  if v_diff <> 0 then
    raise exception 'Journal entry % is unbalanced by %', v_entry, v_diff using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger journal_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function app.assert_entry_balanced();

-- Rule 2: posted rows are immutable. Corrections = a reversing entry, never an UPDATE/DELETE.
create or replace function app.block_entry_mutation() returns trigger
language plpgsql as $$
begin
  -- the only permitted change to a posted entry: flag it as reversed
  if tg_op = 'UPDATE' and old.status = 'posted' and new.status = 'reversed'
     and (new.id, new.company_id, new.entry_no, new.entry_date, new.period_id) is not distinct from
         (old.id, old.company_id, old.entry_no, old.entry_date, old.period_id) then
    return new;
  end if;
  raise exception 'journal_entries is append-only; post a reversing entry instead' using errcode = '55000';
end $$;
create trigger journal_entries_immutable before update or delete on journal_entries
  for each row execute function app.block_entry_mutation();

create or replace function app.block_line_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'journal_lines is append-only; post a reversing entry instead' using errcode = '55000';
end $$;
create trigger journal_lines_immutable before update or delete on journal_lines
  for each row execute function app.block_line_mutation();

-- Rule 3: no posting into a locked period or onto a group (header) account.
create or replace function app.assert_postable() returns trigger
language plpgsql as $$
declare v_group boolean; v_locked text;
begin
  select is_group into v_group from gl_accounts where id = new.account_id;
  if v_group then raise exception 'Account is a group header and cannot be posted to' using errcode = '23514'; end if;
  select p.status into v_locked from journal_entries e join accounting_periods p on p.id = e.period_id where e.id = new.entry_id;
  if v_locked = 'locked' then raise exception 'Accounting period is locked' using errcode = '23514'; end if;
  return new;
end $$;
create trigger journal_lines_postable before insert on journal_lines
  for each row execute function app.assert_postable();

-- Running totals per account per period: trial balance / dashboards read this
-- (small table) instead of scanning millions of journal lines. Updated in the same transaction.
create table account_balances (
  company_id   uuid not null references companies(id),
  account_id   uuid not null references gl_accounts(id),
  period_id    uuid not null references accounting_periods(id),
  debit_total  numeric(18,2) not null default 0,
  credit_total numeric(18,2) not null default 0,
  primary key (company_id, account_id, period_id)
);

create or replace function app.roll_account_balance() returns trigger
language plpgsql as $$
declare v_period uuid;
begin
  select period_id into v_period from journal_entries where id = new.entry_id;
  insert into account_balances (company_id, account_id, period_id, debit_total, credit_total)
  values (new.company_id, new.account_id, v_period, new.debit, new.credit)
  on conflict (company_id, account_id, period_id)
  do update set debit_total = account_balances.debit_total + excluded.debit_total,
                credit_total = account_balances.credit_total + excluded.credit_total;
  return null;
end $$;
create trigger journal_lines_roll after insert on journal_lines
  for each row execute function app.roll_account_balance();

-- ---------------------------------------------------------------- combined transactions
-- One business event that touches several documents: e.g. a customer hands over a single
-- payment that settles two bookings' installments and a maintenance invoice, or two
-- parties' receivable and payable are netted (contra). Items post together or not at all,
-- and the whole group is reversed as a unit.
create table combined_transactions (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  txn_no           text not null,
  txn_date         date not null,
  kind             text not null check (kind in ('combined_receipt','combined_payment','settlement','contra','multi_party_voucher')),
  party_id         uuid references parties(id),
  total_amount     numeric(18,2) not null check (total_amount >= 0),
  status           text not null default 'draft' check (status in ('draft','posted','reversed')),
  journal_entry_id uuid references journal_entries(id),
  reversal_of      uuid references combined_transactions(id),
  note             text,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  unique (company_id, txn_no)
);

create table combined_transaction_items (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  combined_txn_id  uuid not null references combined_transactions(id) on delete cascade,
  item_type        text not null check (item_type in ('receipt','voucher','bill_payment','invoice_settlement','cheque')),
  ref_id           uuid not null,
  direction        text not null check (direction in ('in','out')),
  amount           numeric(18,2) not null check (amount > 0)
);
create index combined_items_txn_idx on combined_transaction_items (combined_txn_id);

-- Settlements/contras must net to zero (in = out); other kinds must add up to the header total.
create or replace function app.assert_combined_consistent() returns trigger
language plpgsql as $$
declare v_id uuid := coalesce(new.combined_txn_id, old.combined_txn_id);
        v_kind text; v_total numeric; v_in numeric; v_out numeric; v_sum numeric;
begin
  select kind, total_amount into v_kind, v_total from combined_transactions where id = v_id;
  if not found then return null; end if;               -- header deleted (cascade)
  select coalesce(sum(amount) filter (where direction = 'in'), 0),
         coalesce(sum(amount) filter (where direction = 'out'), 0),
         coalesce(sum(amount), 0)
    into v_in, v_out, v_sum from combined_transaction_items where combined_txn_id = v_id;
  if v_kind in ('settlement','contra') then
    if v_in <> v_out then raise exception 'Combined % does not net to zero (in %, out %)', v_kind, v_in, v_out using errcode = '23514'; end if;
  elsif v_sum <> v_total then
    raise exception 'Combined transaction items (%) do not add up to the total (%)', v_sum, v_total using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger combined_items_consistent
  after insert or update or delete on combined_transaction_items
  deferrable initially deferred
  for each row execute function app.assert_combined_consistent();

-- ---------------------------------------------------------------- vouchers (the user-facing documents)
create table vouchers (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  voucher_type     text not null check (voucher_type in ('CPV','CRV','BPV','BRV','JV')),
  number           text not null,
  voucher_date     date not null,
  cheque_date      date,
  party_id         uuid references parties(id),
  description      text,
  status           text not null default 'draft' check (status in ('draft','pending','approved','rejected','void')),
  journal_entry_id uuid references journal_entries(id),   -- set when approved & posted
  combined_txn_id  uuid references combined_transactions(id),
  recurring_rule   jsonb,
  created_by       uuid references users(id),
  approved_by      uuid references users(id),
  approved_at      timestamptz,
  approval_note    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  version          int not null default 1,
  unique (company_id, number)
);
create trigger vouchers_touch before update on vouchers for each row execute function app.touch_updated_at();

create table voucher_lines (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  voucher_id     uuid not null references vouchers(id) on delete cascade,
  line_no        int not null,
  account_id     uuid not null references gl_accounts(id),
  debit          numeric(18,2) not null default 0 check (debit >= 0),
  credit         numeric(18,2) not null default 0 check (credit >= 0),
  remarks        text,
  project_id     uuid references projects(id),
  cost_center_id uuid references cost_centers(id),
  unique (voucher_id, line_no)
);

-- ---------------------------------------------------------------- sales: bookings, installments, receipts
create table bookings (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  booking_no       text not null,
  property_id      uuid not null references properties(id),
  customer_id      uuid not null references parties(id),
  sales_agent_id   uuid references users(id),
  dealer_id        uuid references parties(id),
  booking_date     date not null,
  list_price       numeric(18,2) not null,
  discount         numeric(18,2) not null default 0 check (discount >= 0),
  net_price        numeric(18,2) generated always as (list_price - discount) stored,
  payment_type     text not null check (payment_type in ('cash','installment')),
  status           text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  version          int not null default 1,
  unique (company_id, booking_no)
);
-- One live booking per property, enforced by the database (not just the UI).
create unique index bookings_one_live_per_property on bookings (company_id, property_id)
  where status in ('pending','confirmed','completed');
create index bookings_customer_idx on bookings (company_id, customer_id);
create trigger bookings_touch before update on bookings for each row execute function app.touch_updated_at();

create table installments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  booking_id    uuid not null references bookings(id),
  seq           int not null,
  kind          text not null default 'installment' check (kind in ('down_payment','installment','balloon','possession')),
  due_date      date not null,
  amount        numeric(18,2) not null check (amount > 0),
  paid_amount   numeric(18,2) not null default 0 check (paid_amount >= 0),
  status        text not null default 'due' check (status in ('due','partial','paid','waived')),
  check (paid_amount <= amount),
  unique (booking_id, seq)
);
create index installments_due_idx on installments (company_id, due_date) where status in ('due','partial');

create table receipts (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  receipt_no       text not null,
  customer_id      uuid not null references parties(id),
  booking_id       uuid references bookings(id),
  received_on      date not null,
  amount           numeric(18,2) not null check (amount > 0),
  method           text not null check (method in ('cash','cheque','bank_transfer','online','pay_order','split')),
  deposit_account  uuid references gl_accounts(id),            -- null only when paid by several tenders
  instrument_ref   text,
  status           text not null default 'posted' check (status in ('posted','void')),
  combined_txn_id  uuid references combined_transactions(id),
  journal_entry_id uuid references journal_entries(id),
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  unique (company_id, receipt_no),
  check (method = 'split' or deposit_account is not null)
);

-- A single receipt can be paid with several instruments: 250k cash + 150k cheque + online.
create table receipt_tenders (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  receipt_id       uuid not null references receipts(id),
  method           text not null check (method in ('cash','cheque','bank_transfer','online','pay_order')),
  amount           numeric(18,2) not null check (amount > 0),
  deposit_account  uuid not null references gl_accounts(id),
  instrument_ref   text, bank_name text,
  cheque_id        uuid
);
create index receipt_tenders_receipt_idx on receipt_tenders (receipt_id);

create or replace function app.assert_tenders_match() returns trigger
language plpgsql as $$
declare v_id uuid := coalesce(new.receipt_id, old.receipt_id); v_amount numeric; v_sum numeric; v_n int;
begin
  select amount into v_amount from receipts where id = v_id;
  select coalesce(sum(amount), 0), count(*) into v_sum, v_n from receipt_tenders where receipt_id = v_id;
  if v_n > 0 and v_sum <> v_amount then
    raise exception 'Tenders (%) must add up to the receipt amount (%)', v_sum, v_amount using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger receipt_tenders_match
  after insert or update or delete on receipt_tenders
  deferrable initially deferred
  for each row execute function app.assert_tenders_match();

-- Things a receipt can settle besides installments.
create table penalty_charges (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  installment_id uuid not null references installments(id),
  amount         numeric(18,2) not null check (amount > 0),
  paid_amount    numeric(18,2) not null default 0 check (paid_amount >= 0),
  status         text not null default 'open' check (status in ('open','partial','paid','waived')),
  check (paid_amount <= amount)
);

create table sales_invoices (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  number        text not null,
  customer_id   uuid not null references parties(id),
  booking_id    uuid references bookings(id),
  invoice_date  date not null, due_date date not null,
  subtotal      numeric(18,2) not null, tax_amount numeric(18,2) not null default 0,
  total         numeric(18,2) not null check (total >= 0),
  paid_amount   numeric(18,2) not null default 0 check (paid_amount >= 0),
  status        text not null default 'unpaid' check (status in ('unpaid','partial','paid','void')),
  unique (company_id, number),
  check (paid_amount <= total)
);

create table service_invoices (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  number        text not null,
  customer_id   uuid not null references parties(id),
  property_id   uuid references properties(id),
  period_label  text, due_date date not null,
  amount        numeric(18,2) not null check (amount >= 0),
  paid_amount   numeric(18,2) not null default 0 check (paid_amount >= 0),
  status        text not null default 'unpaid' check (status in ('unpaid','partial','paid','void')),
  unique (company_id, number),
  check (paid_amount <= amount)
);

-- What a receipt settled. Exactly one target per row; a receipt may have many rows
-- (several installments across bookings + a penalty + a service invoice ...).
create table receipt_allocations (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id),
  receipt_id         uuid not null references receipts(id),
  installment_id     uuid references installments(id),
  penalty_id         uuid references penalty_charges(id),
  sales_invoice_id   uuid references sales_invoices(id),
  service_invoice_id uuid references service_invoices(id),
  amount             numeric(18,2) not null check (amount > 0),
  check (num_nonnulls(installment_id, penalty_id, sales_invoice_id, service_invoice_id) = 1)
);
create index receipt_allocations_receipt_idx on receipt_allocations (receipt_id);

-- An allocation can never exceed the receipt total, and keeps the target's state consistent.
create or replace function app.apply_allocation() returns trigger
language plpgsql as $$
declare v_receipt numeric; v_allocated numeric;
begin
  select amount into v_receipt from receipts where id = new.receipt_id;
  select coalesce(sum(amount),0) into v_allocated from receipt_allocations where receipt_id = new.receipt_id;
  if v_allocated > v_receipt then
    raise exception 'Allocations (%) exceed receipt amount (%)', v_allocated, v_receipt using errcode = '23514';
  end if;
  if new.installment_id is not null then
    update installments set paid_amount = paid_amount + new.amount,
           status = case when paid_amount + new.amount >= amount then 'paid' else 'partial' end
     where id = new.installment_id;
  elsif new.penalty_id is not null then
    update penalty_charges set paid_amount = paid_amount + new.amount,
           status = case when paid_amount + new.amount >= amount then 'paid' else 'partial' end
     where id = new.penalty_id;
  elsif new.sales_invoice_id is not null then
    update sales_invoices set paid_amount = paid_amount + new.amount,
           status = case when paid_amount + new.amount >= total then 'paid' else 'partial' end
     where id = new.sales_invoice_id;
  else
    update service_invoices set paid_amount = paid_amount + new.amount,
           status = case when paid_amount + new.amount >= amount then 'paid' else 'partial' end
     where id = new.service_invoice_id;
  end if;
  return null;
end $$;
create trigger receipt_allocations_apply after insert on receipt_allocations
  for each row execute function app.apply_allocation();

alter table property_ownership_history
  add constraint property_ownership_booking_fk foreign key (booking_id) references bookings(id);

-- ---------------------------------------------------------------- tax management (admin-configurable)
-- Nothing about tax is hard-coded: the admin defines tax codes, gives each effective-dated
-- rates, bundles them into groups, and writes assignment rules ("plot sales to non-filers
-- get bundle X"). Whenever a document is taxed, the result is recorded per tax in document_taxes.
create table tax_authorities (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  name             text not null,
  short_code       text,
  registration_no  text,
  filing_frequency text check (filing_frequency in ('monthly','quarterly','annual'))
);

create table tax_codes (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies(id),
  code                   text not null,
  name                   text not null,
  authority_id           uuid references tax_authorities(id),
  kind                   text not null check (kind in ('sales_tax','withholding','stamp_duty','capital_value','income_tax','other')),
  direction              text not null check (direction in ('output','input','withheld_by_us','withheld_from_us')),
  applies_on             text not null default 'any' check (applies_on in ('revenue','expense','payroll','transfer','any')),
  calc_method            text not null default 'percent' check (calc_method in ('percent','flat','slab')),
  price_inclusive        boolean not null default false,
  rounding               text not null default 'nearest' check (rounding in ('nearest','up','down')),
  payable_account_id     uuid references gl_accounts(id),
  receivable_account_id  uuid references gl_accounts(id),
  expense_account_id     uuid references gl_accounts(id),
  active                 boolean not null default true,
  unique (company_id, code)
);

create table tax_rates (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  tax_code_id    uuid not null references tax_codes(id),
  rate_pct       numeric(7,4) check (rate_pct between 0 and 100),
  flat_amount    numeric(18,2) check (flat_amount >= 0),
  slabs          jsonb,                                   -- [{"from":0,"to":500000,"rate":1}, ...] progressive
  min_base       numeric(18,2), max_base numeric(18,2),
  filer_status   text not null default 'any' check (filer_status in ('filer','non_filer','any')),
  effective_from date not null,
  effective_to   date,
  note           text,
  check (effective_to is null or effective_to >= effective_from),
  check (num_nonnulls(rate_pct, flat_amount, slabs) = 1)
);
create index tax_rates_lookup_idx on tax_rates (tax_code_id, filer_status, effective_from desc);

-- Rate history must never be ambiguous: two rates for the same code + filer status cannot overlap in time.
create or replace function app.assert_tax_rate_no_overlap() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1 from tax_rates r
     where r.tax_code_id = new.tax_code_id and r.filer_status = new.filer_status and r.id <> new.id
       and daterange(r.effective_from, coalesce(r.effective_to, 'infinity'::date), '[]')
        && daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]')
  ) then
    raise exception 'Tax rate periods overlap for this tax code and filer status' using errcode = '23P01';
  end if;
  return new;
end $$;
create trigger tax_rates_no_overlap before insert or update on tax_rates
  for each row execute function app.assert_tax_rate_no_overlap();

create table tax_groups (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  name        text not null,
  description text,
  active      boolean not null default true,
  unique (company_id, name)
);

create table tax_group_items (
  company_id  uuid not null references companies(id),
  group_id    uuid not null references tax_groups(id) on delete cascade,
  tax_code_id uuid not null references tax_codes(id),
  sequence    int not null,
  compound    boolean not null default false,             -- tax on top of the previous taxes
  primary key (group_id, tax_code_id)
);

create table tax_assignments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  name           text not null,
  doc_type       text not null check (doc_type in ('booking','receipt','sales_invoice','service_invoice','vendor_bill','payroll','transfer','commission','voucher')),
  tax_group_id   uuid not null references tax_groups(id),
  conditions     jsonb not null default '{}',             -- {"property_group":"residential","filer_status":"non_filer","min_amount":5000000}
  priority       int not null default 100,
  effective_from date not null default current_date,
  effective_to   date,
  active         boolean not null default true
);
create index tax_assignments_doc_idx on tax_assignments (company_id, doc_type, priority) where active;

create table party_tax_exemptions (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  party_id       uuid not null references parties(id),
  tax_code_id    uuid not null references tax_codes(id),
  certificate_no text, valid_from date not null, valid_to date,
  file_id        uuid references documents(id)
);

create table document_taxes (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  doc_type         text not null,
  doc_id           uuid not null,
  tax_code_id      uuid not null references tax_codes(id),
  tax_rate_id      uuid references tax_rates(id),
  base_amount      numeric(18,2) not null,
  rate_pct         numeric(7,4),
  tax_amount       numeric(18,2) not null,
  direction        text not null check (direction in ('output','input','withheld_by_us','withheld_from_us')),
  status           text not null default 'computed' check (status in ('computed','posted','reversed')),
  override_reason  text,
  journal_entry_id uuid references journal_entries(id)
);
create index document_taxes_doc_idx on document_taxes (company_id, doc_type, doc_id);

create table tax_returns (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  authority_id  uuid not null references tax_authorities(id),
  tax_type      text not null,
  period_start  date not null, period_end date not null,
  total_output  numeric(18,2) not null default 0,
  total_input   numeric(18,2) not null default 0,
  net_payable   numeric(18,2) not null default 0,
  status        text not null default 'draft' check (status in ('draft','filed','paid')),
  filed_on      date, reference_no text, file_id uuid references documents(id)
);

create table tax_return_lines (
  company_id       uuid not null references companies(id),
  return_id        uuid not null references tax_returns(id) on delete cascade,
  document_tax_id  uuid not null references document_taxes(id),
  primary key (return_id, document_tax_id)
);

create table tax_payments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  return_id   uuid references tax_returns(id),
  tax_code_id uuid not null references tax_codes(id),
  amount      numeric(18,2) not null check (amount > 0),
  paid_on     date not null, challan_no text,
  voucher_id  uuid references vouchers(id)
);

-- Extra charges on a property (development, transfer fee ...), optionally taxed.
create table property_charges (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id),
  property_id  uuid not null references properties(id) on delete cascade,
  charge_type  text not null check (charge_type in ('development','transfer_fee','possession','maintenance','utility_connection','membership')),
  amount       numeric(18,2) not null check (amount >= 0),
  basis        text not null default 'flat' check (basis in ('flat','per_marla','pct_of_price')),
  due_event    text check (due_event in ('on_booking','on_possession','on_transfer')),
  tax_code_id  uuid references tax_codes(id)
);

-- The rate in force on a date (specific filer status beats 'any'; newest start wins).
create or replace function app.tax_rate_on(p_code uuid, p_date date, p_filer text default 'any')
returns tax_rates language sql stable as $$
  select r.* from tax_rates r
   where r.tax_code_id = p_code and r.effective_from <= p_date
     and (r.effective_to is null or r.effective_to >= p_date)
     and r.filer_status in (p_filer, 'any')
   order by (r.filer_status = p_filer) desc, r.effective_from desc
   limit 1 $$;

-- Applies a whole bundle to an amount: honours sequence, compounding, inclusive prices,
-- flat amounts, progressive slabs and per-tax rounding. Returns one row per tax.
create or replace function app.apply_tax_group(p_group uuid, p_base numeric, p_date date, p_filer text default 'any')
returns table (tax_code_id uuid, rate_pct numeric, base_amount numeric, tax_amount numeric, direction text)
language plpgsql stable as $$
declare r record; v_rate tax_rates; v_running numeric := p_base; v_basis numeric; v_tax numeric;
begin
  for r in
    select i.tax_code_id as code_id, i.compound, c.direction as dir, c.rounding, c.price_inclusive
      from tax_group_items i join tax_codes c on c.id = i.tax_code_id
     where i.group_id = p_group
     order by i.sequence
  loop
    v_rate := app.tax_rate_on(r.code_id, p_date, p_filer);
    continue when v_rate.id is null;
    v_basis := case when r.compound then v_running else p_base end;
    if v_rate.rate_pct is not null then
      v_tax := case when r.price_inclusive then v_basis - v_basis / (1 + v_rate.rate_pct / 100)
                    else v_basis * v_rate.rate_pct / 100 end;
    elsif v_rate.flat_amount is not null then
      v_tax := v_rate.flat_amount;
    else
      select coalesce(sum(greatest(least(v_basis, coalesce((s->>'to')::numeric, v_basis)) - (s->>'from')::numeric, 0)
                          * (s->>'rate')::numeric / 100), 0)
        into v_tax from jsonb_array_elements(v_rate.slabs) s;
    end if;
    v_tax := case r.rounding when 'up' then ceil(v_tax) when 'down' then floor(v_tax) else round(v_tax, 2) end;
    tax_code_id := r.code_id; rate_pct := v_rate.rate_pct; base_amount := v_basis; tax_amount := v_tax; direction := r.dir;
    return next;
    if not r.price_inclusive then v_running := v_running + v_tax; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- multi-company: inter-company & consolidation
-- Organization-level objects. Inter-company transactions are visible to BOTH companies involved
-- (and to nobody else); consolidation objects are visible to the organization's group admins.
create table intercompany_accounts (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies(id),
  counterparty_company_id uuid not null references companies(id),
  due_from_account_id    uuid not null references gl_accounts(id),
  due_to_account_id      uuid not null references gl_accounts(id),
  unique (company_id, counterparty_company_id),
  check (company_id <> counterparty_company_id)
);

create table intercompany_transactions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  txn_no          text not null,
  from_company_id uuid not null references companies(id),
  to_company_id   uuid not null references companies(id),
  kind            text not null check (kind in ('loan','repayment','fund_transfer','expense_recharge','sale','commission')),
  txn_date        date not null,
  amount          numeric(18,2) not null check (amount > 0),
  description     text,
  status          text not null default 'draft' check (status in ('draft','posted','settled','reversed')),
  from_entry_id   uuid references journal_entries(id),
  to_entry_id     uuid references journal_entries(id),
  matched_at      timestamptz,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  unique (org_id, txn_no),
  check (from_company_id <> to_company_id)
);

create table consolidation_groups (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  name          text not null,
  base_currency char(3) not null default 'PKR',
  status        text not null default 'active'
);

create table consolidation_members (
  group_id       uuid not null references consolidation_groups(id) on delete cascade,
  company_id     uuid not null references companies(id),
  ownership_pct  numeric(5,2) not null default 100 check (ownership_pct between 0 and 100),
  method         text not null default 'full' check (method in ('full','proportional','equity')),
  primary key (group_id, company_id)
);

create table group_accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  code          text not null,
  name          text not null,
  account_class text not null check (account_class in ('asset','liability','equity','income','expense')),
  parent_id     uuid references group_accounts(id),
  unique (org_id, code)
);

-- Each company keeps its own chart of accounts; this maps them onto the group chart.
create table group_account_map (
  company_id       uuid not null references companies(id),
  gl_account_id    uuid not null references gl_accounts(id),
  group_account_id uuid not null references group_accounts(id),
  primary key (company_id, gl_account_id)
);

create table consolidation_runs (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references consolidation_groups(id),
  period_start date not null, period_end date not null,
  status       text not null default 'draft' check (status in ('draft','final')),
  run_by       uuid references users(id),
  run_at       timestamptz not null default now()
);

create table consolidated_balances (
  run_id           uuid not null references consolidation_runs(id) on delete cascade,
  group_account_id uuid not null references group_accounts(id),
  debit_total      numeric(18,2) not null default 0,
  credit_total     numeric(18,2) not null default 0,
  primary key (run_id, group_account_id)
);

create table elimination_entries (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null references consolidation_runs(id) on delete cascade,
  kind                  text not null check (kind in ('intercompany','investment','unrealized_profit')),
  description           text,
  intercompany_txn_id   uuid references intercompany_transactions(id)
);

create table elimination_lines (
  id               uuid primary key default gen_random_uuid(),
  entry_id         uuid not null references elimination_entries(id) on delete cascade,
  group_account_id uuid not null references group_accounts(id),
  company_id       uuid references companies(id),
  debit            numeric(18,2) not null default 0 check (debit >= 0),
  credit           numeric(18,2) not null default 0 check (credit >= 0),
  check ((debit = 0) <> (credit = 0))
);

-- Posts BOTH sides of an inter-company transaction atomically: the sender books
-- Dr Due-from-counterparty / Cr Bank, the receiver books Dr Bank / Cr Due-to-counterparty.
-- SECURITY DEFINER because it must write into two companies' ledgers; it first checks that the
-- caller is one of the two parties. In production the function owner is a dedicated role
-- with BYPASSRLS and nothing else.
create or replace function app.post_intercompany(p_txn uuid, p_from_bank uuid, p_to_bank uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare t intercompany_transactions; a_from intercompany_accounts; a_to intercompany_accounts;
        v_pf uuid; v_pt uuid; v_ef uuid := gen_random_uuid(); v_et uuid := gen_random_uuid();
begin
  select * into t from intercompany_transactions where id = p_txn for update;
  if not found then raise exception 'Inter-company transaction not found'; end if;
  if t.status <> 'draft' then raise exception 'Only draft transactions can be posted' using errcode = '55000'; end if;
  if app.current_company() not in (t.from_company_id, t.to_company_id) then
    raise exception 'Caller is not a party to this transaction' using errcode = '42501';
  end if;
  select * into a_from from intercompany_accounts where company_id = t.from_company_id and counterparty_company_id = t.to_company_id;
  select * into a_to   from intercompany_accounts where company_id = t.to_company_id   and counterparty_company_id = t.from_company_id;
  if a_from.id is null or a_to.id is null then raise exception 'Inter-company accounts are not configured for this pair'; end if;
  select id into v_pf from accounting_periods where company_id = t.from_company_id and t.txn_date between start_date and end_date;
  select id into v_pt from accounting_periods where company_id = t.to_company_id   and t.txn_date between start_date and end_date;
  if v_pf is null or v_pt is null then raise exception 'No accounting period covers % in both companies', t.txn_date; end if;

  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_ef, t.from_company_id, app.next_doc_no(t.from_company_id, 'ICJ'), t.txn_date, v_pf, 'system', t.id, t.description, app.current_user_id()),
         (v_et, t.to_company_id,   app.next_doc_no(t.to_company_id,   'ICJ'), t.txn_date, v_pt, 'system', t.id, t.description, app.current_user_id());
  insert into journal_lines (company_id, entry_id, line_no, account_id, debit, credit) values
    (t.from_company_id, v_ef, 1, a_from.due_from_account_id, t.amount, 0),
    (t.from_company_id, v_ef, 2, p_from_bank,                0, t.amount),
    (t.to_company_id,   v_et, 1, p_to_bank,                  t.amount, 0),
    (t.to_company_id,   v_et, 2, a_to.due_to_account_id,     0, t.amount);
  update intercompany_transactions set from_entry_id = v_ef, to_entry_id = v_et, status = 'posted', matched_at = now() where id = t.id;
end $$;

-- Consolidated trial balance for a period: sums every member company's ledger through the
-- group-account map, then eliminates inter-company balances so the group is not double counted.
create or replace function app.run_consolidation(p_group uuid, p_from date, p_to date) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_run uuid := gen_random_uuid(); v_org uuid; v_elim uuid; t record;
begin
  select org_id into v_org from consolidation_groups where id = p_group;
  if v_org is distinct from app.current_org() then raise exception 'Not authorised for this group' using errcode = '42501'; end if;
  insert into consolidation_runs (id, group_id, period_start, period_end, run_by) values (v_run, p_group, p_from, p_to, app.current_user_id());

  insert into consolidated_balances (run_id, group_account_id, debit_total, credit_total)
  select v_run, m.group_account_id, sum(l.debit), sum(l.credit)
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    join consolidation_members cm on cm.company_id = l.company_id and cm.group_id = p_group
    join group_account_map m on m.company_id = l.company_id and m.gl_account_id = l.account_id
   where e.entry_date between p_from and p_to
   group by m.group_account_id;

  for t in
    select tx.id, tx.txn_no, tx.description, tx.amount, tx.from_company_id, tx.to_company_id,
           fa.due_from_account_id, ta.due_to_account_id
      from intercompany_transactions tx
      join intercompany_accounts fa on fa.company_id = tx.from_company_id and fa.counterparty_company_id = tx.to_company_id
      join intercompany_accounts ta on ta.company_id = tx.to_company_id   and ta.counterparty_company_id = tx.from_company_id
     where tx.org_id = v_org and tx.status in ('posted','settled') and tx.txn_date between p_from and p_to
       and tx.from_company_id in (select company_id from consolidation_members where group_id = p_group)
       and tx.to_company_id   in (select company_id from consolidation_members where group_id = p_group)
  loop
    v_elim := gen_random_uuid();
    insert into elimination_entries (id, run_id, kind, description, intercompany_txn_id)
    values (v_elim, v_run, 'intercompany', t.txn_no || ' ' || coalesce(t.description, ''), t.id);
    insert into elimination_lines (entry_id, group_account_id, company_id, debit, credit)
    values (v_elim, (select group_account_id from group_account_map where company_id = t.to_company_id   and gl_account_id = t.due_to_account_id),   t.to_company_id,   t.amount, 0),
           (v_elim, (select group_account_id from group_account_map where company_id = t.from_company_id and gl_account_id = t.due_from_account_id), t.from_company_id, 0, t.amount);
  end loop;

  insert into consolidated_balances (run_id, group_account_id, debit_total, credit_total)
  select v_run, l.group_account_id, sum(l.debit), sum(l.credit)
    from elimination_lines l join elimination_entries e on e.id = l.entry_id
   where e.run_id = v_run group by l.group_account_id
  on conflict (run_id, group_account_id)
  do update set debit_total = consolidated_balances.debit_total + excluded.debit_total,
                credit_total = consolidated_balances.credit_total + excluded.credit_total;
  return v_run;
end $$;

-- ---------------------------------------------------------------- budgeting & budget control
-- A budget is a planned limit on spend. "Actual" is never typed in: it is read from the ledger
-- (journal_lines on the line's account, narrowed by project / cost centre / period), and
-- "committed" comes from open commitments (orders, contracts, running bills). Once approved,
-- the lines can only change through an approved revision (maker-checker), and every approved
-- version is snapshotted for audit.
create table budget_templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  name        text not null,
  kind        text not null check (kind in ('project','operating','capex')),
  description text,
  active      boolean not null default true,
  unique (company_id, name)
);

create table budget_template_lines (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  template_id uuid not null references budget_templates(id) on delete cascade,
  cost_code   text,
  category    text not null,
  account_id  uuid references gl_accounts(id),
  share_pct   numeric(6,3) not null check (share_pct > 0 and share_pct <= 100)
);

create table budgets (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  budget_no        text not null,
  name             text not null,
  kind             text not null check (kind in ('project','operating','capex')),
  project_id       uuid references projects(id),
  cost_center_id   uuid references cost_centers(id),
  fiscal_year_id   uuid references fiscal_years(id),
  period_start     date,
  period_end       date,
  status           text not null default 'draft' check (status in ('draft','submitted','approved','locked','closed')),
  control_mode     text not null default 'warn' check (control_mode in ('none','warn','block')),
  version_no       int not null default 1,
  parent_budget_id uuid references budgets(id),
  template_id      uuid references budget_templates(id),
  total_amount     numeric(18,2) not null default 0,
  currency         char(3) not null default 'PKR',
  created_by       uuid references users(id),
  approved_by      uuid references users(id),
  approved_at      timestamptz,
  locked_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  version          int not null default 1,
  unique (company_id, budget_no),
  check (kind <> 'project' or project_id is not null),
  check (period_start is null or period_end is null or period_end >= period_start),
  check (approved_by is null or approved_by <> created_by)            -- maker-checker on the whole budget
);
-- One live budget per project (a closed one may be followed by a new one).
create unique index budgets_one_live_per_project on budgets (company_id, project_id)
  where kind = 'project' and status in ('draft','submitted','approved','locked');
create trigger budgets_touch before update on budgets for each row execute function app.touch_updated_at();

-- Status moves one step at a time; nothing skips approval.
create or replace function app.assert_budget_transition() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and (old.status || '>' || new.status) <> all (array['draft>submitted','submitted>draft','submitted>approved','approved>locked','locked>approved','approved>closed','locked>closed','draft>closed']) then
    raise exception 'A budget cannot go from % to %', old.status, new.status using errcode = '55000';
  end if;
  return new;
end $$;
create trigger budgets_transition before update on budgets for each row execute function app.assert_budget_transition();

create table budget_lines (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  budget_id      uuid not null references budgets(id) on delete cascade,
  line_no        int not null,
  cost_code      text,
  category       text not null,
  description    text,
  account_id     uuid not null references gl_accounts(id),   -- postings to this account count as "actual"
  cost_center_id uuid references cost_centers(id),
  budget_amount  numeric(18,2) not null check (budget_amount >= 0),
  basis          text not null default 'manual' check (basis in ('manual','per_unit','pct_of_revenue')),
  notes          text,
  unique (budget_id, line_no)
);
create index budget_lines_account_idx on budget_lines (company_id, account_id);

-- After approval, lines change only through an approved revision (app.approve_budget_revision sets the flag).
create or replace function app.guard_budget_lines() returns trigger
language plpgsql as $$
declare v_status text; v_budget uuid := coalesce(new.budget_id, old.budget_id);
begin
  select status into v_status from budgets where id = v_budget;
  if v_status in ('approved','locked','closed') and coalesce(current_setting('app.budget_revision', true), '') <> 'on' then
    raise exception 'Lines of an % budget can only change through an approved revision', v_status using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
create trigger budget_lines_guard before insert or update or delete on budget_lines
  for each row execute function app.guard_budget_lines();

create or replace function app.roll_budget_total() returns trigger
language plpgsql as $$
declare v_budget uuid := coalesce(new.budget_id, old.budget_id);
begin
  update budgets set total_amount = coalesce((select sum(budget_amount) from budget_lines where budget_id = v_budget), 0) where id = v_budget;
  return null;
end $$;
create trigger budget_lines_total after insert or update or delete on budget_lines
  for each row execute function app.roll_budget_total();

-- Monthly phasing: if a line is phased, the months must add up to the line.
create table budget_line_periods (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  budget_line_id uuid not null references budget_lines(id) on delete cascade,
  period_id      uuid not null references accounting_periods(id),
  amount         numeric(18,2) not null check (amount >= 0),
  unique (budget_line_id, period_id)
);

create or replace function app.assert_phasing_matches() returns trigger
language plpgsql as $$
declare v_line uuid := coalesce(new.budget_line_id, old.budget_line_id); v_amount numeric; v_sum numeric; v_n int;
begin
  select budget_amount into v_amount from budget_lines where id = v_line;
  if not found then return null; end if;
  select coalesce(sum(amount), 0), count(*) into v_sum, v_n from budget_line_periods where budget_line_id = v_line;
  if v_n > 0 and v_sum <> v_amount then
    raise exception 'Monthly phasing (%) must add up to the line amount (%)', v_sum, v_amount using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger budget_phasing_matches
  after insert or update or delete on budget_line_periods
  deferrable initially deferred
  for each row execute function app.assert_phasing_matches();

create table budget_snapshots (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  budget_id  uuid not null references budgets(id) on delete cascade,
  version_no int not null,
  reason     text,
  data       jsonb not null,
  taken_at   timestamptz not null default now(),
  unique (budget_id, version_no)
);

create table budget_revisions (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id),
  budget_id           uuid not null references budgets(id),
  revision_no         int not null,
  type                text not null check (type in ('supplementary','reallocation','reforecast')),
  reason              text not null,
  delta_amount        numeric(18,2) not null default 0,
  status              text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by        uuid references users(id),
  approved_by         uuid references users(id),
  approved_at         timestamptz,
  approval_request_id uuid,
  unique (budget_id, revision_no),
  check (approved_by is null or approved_by <> requested_by)
);

create table budget_revision_lines (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  revision_id    uuid not null references budget_revisions(id) on delete cascade,
  budget_line_id uuid not null references budget_lines(id),
  delta_amount   numeric(18,2) not null check (delta_amount <> 0)
);

create table budget_commitments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  budget_line_id uuid not null references budget_lines(id),
  source_type    text not null check (source_type in ('purchase_order','construction_contract','ipc','vendor_bill','payroll','manual')),
  source_id      uuid,
  amount         numeric(18,2) not null check (amount > 0),
  status         text not null default 'open' check (status in ('open','invoiced','released','cancelled')),
  committed_on   date not null,
  note           text
);
create index budget_commitments_line_idx on budget_commitments (budget_line_id) where status = 'open';

create table budget_exceptions (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  budget_line_id   uuid not null references budget_lines(id),
  doc_type         text not null check (doc_type in ('voucher','purchase_order','vendor_bill','ipc')),
  doc_id           uuid,
  requested_amount numeric(18,2) not null check (requested_amount > 0),
  over_by          numeric(18,2) not null check (over_by >= 0),
  reason           text,
  status           text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by     uuid references users(id),
  decided_by       uuid references users(id),
  decided_at       timestamptz,
  check (decided_by is null or decided_by <> requested_by)           -- you cannot approve your own overrun
);

create table budget_alert_rules (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  budget_id      uuid references budgets(id),                        -- null = every budget
  threshold_pct  numeric(6,2) not null check (threshold_pct > 0),
  channel        text not null default 'in_app' check (channel in ('in_app','email','whatsapp')),
  notify_role_id uuid references roles(id),
  active         boolean not null default true
);

create table budget_alerts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  budget_line_id  uuid not null references budget_lines(id) on delete cascade,
  threshold_pct   numeric(6,2) not null,
  utilization_pct numeric(8,2) not null,
  triggered_at    timestamptz not null default now(),
  acknowledged_by uuid references users(id),
  acknowledged_at timestamptz,
  unique (budget_line_id, threshold_pct)                             -- each threshold fires once per line
);

create table budget_forecasts (
  id                      uuid primary key default gen_random_uuid(),
  company_id              uuid not null references companies(id),
  budget_line_id          uuid not null references budget_lines(id) on delete cascade,
  as_of                   date not null,
  method                  text not null check (method in ('run_rate','percent_complete','manual')),
  estimate_to_complete    numeric(18,2) not null check (estimate_to_complete >= 0),
  forecast_at_completion  numeric(18,2) not null,
  note                    text,
  created_by              uuid references users(id)
);

-- Live budget position of every line: budget, committed, actual (from the ledger), available, utilization.
-- security_invoker => the caller's row-level security applies to everything the view reads.
create view v_budget_line_status with (security_invoker = true) as
select l.id               as budget_line_id,
       l.company_id,
       l.budget_id,
       b.name             as budget_name,
       b.kind,
       b.status,
       b.control_mode,
       l.category,
       l.account_id,
       l.budget_amount,
       coalesce(c.committed, 0)                                  as committed_amount,
       coalesce(a.actual, 0)                                     as actual_amount,
       l.budget_amount - coalesce(c.committed, 0) - coalesce(a.actual, 0) as available_amount,
       case when l.budget_amount > 0
            then round((coalesce(c.committed, 0) + coalesce(a.actual, 0)) / l.budget_amount * 100, 2) end as utilization_pct
  from budget_lines l
  join budgets b on b.id = l.budget_id
  left join lateral (
    select sum(bc.amount) as committed from budget_commitments bc
     where bc.budget_line_id = l.id and bc.status = 'open'
  ) c on true
  left join lateral (
    select sum(jl.debit - jl.credit) as actual
      from journal_lines jl join journal_entries e on e.id = jl.entry_id
     where jl.company_id = l.company_id
       and jl.account_id = l.account_id
       and (b.project_id is null or jl.project_id = b.project_id)
       and (l.cost_center_id is null or jl.cost_center_id = l.cost_center_id)
       and (b.period_start is null or e.entry_date >= b.period_start)
       and (b.period_end is null or e.entry_date <= b.period_end)
  ) a on true;

-- Called before a voucher / PO / bill is accepted: would this amount fit, and what should happen?
-- No row = no approved budget covers it (nothing to enforce).
create or replace function app.check_budget(p_account uuid, p_project uuid, p_cost_center uuid, p_date date, p_amount numeric)
returns table (budget_line_id uuid, control_mode text, available numeric, over_by numeric, decision text)
language sql stable as $$
  select s.budget_line_id, b.control_mode, s.available_amount,
         greatest(p_amount - s.available_amount, 0),
         case when p_amount <= s.available_amount then 'allow'
              when b.control_mode = 'block' then 'block'
              when b.control_mode = 'warn' then 'warn'
              else 'allow' end
    from v_budget_line_status s
    join budgets b on b.id = s.budget_id
    join budget_lines l on l.id = s.budget_line_id
   where s.account_id = p_account
     and b.status in ('approved','locked')
     and (b.project_id is null or b.project_id = p_project)
     and (l.cost_center_id is null or l.cost_center_id = p_cost_center)
     and (b.period_start is null or p_date >= b.period_start)
     and (b.period_end is null or p_date <= b.period_end)
   order by (b.project_id is not null) desc, (l.cost_center_id is not null) desc
   limit 1 $$;

-- Fires an alert the first time a line crosses each threshold. Safe to run repeatedly (e.g. nightly or after each posting).
create or replace function app.evaluate_budget_alerts(p_budget uuid) returns int
language plpgsql as $$
declare n int;
begin
  insert into budget_alerts (company_id, budget_line_id, threshold_pct, utilization_pct)
  select s.company_id, s.budget_line_id, r.threshold_pct, s.utilization_pct
    from v_budget_line_status s
    join budget_alert_rules r on r.active and r.company_id = s.company_id and (r.budget_id = s.budget_id or r.budget_id is null)
   where s.budget_id = p_budget and s.utilization_pct >= r.threshold_pct
  on conflict (budget_line_id, threshold_pct) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Draft/submitted -> approved. The approver cannot be the creator; a v1 snapshot is stored.
create or replace function app.approve_budget(p_budget uuid, p_approver uuid) returns void
language plpgsql as $$
declare b budgets;
begin
  select * into b from budgets where id = p_budget for update;
  if not found then raise exception 'Budget not found'; end if;
  if b.status <> 'submitted' then raise exception 'Only a submitted budget can be approved (this one is %)', b.status using errcode = '55000'; end if;
  if b.total_amount <= 0 then raise exception 'A budget needs at least one line with an amount before approval' using errcode = '23514'; end if;
  if p_approver = b.created_by then raise exception 'Maker-checker: the creator cannot approve their own budget' using errcode = '42501'; end if;
  update budgets set status = 'approved', approved_by = p_approver, approved_at = now() where id = p_budget;
  insert into budget_snapshots (company_id, budget_id, version_no, reason, data)
  select b.company_id, b.id, b.version_no, 'Approved',
         (select jsonb_agg(jsonb_build_object('line_no', line_no, 'category', category, 'amount', budget_amount) order by line_no) from budget_lines where budget_id = p_budget);
end $$;

-- Applies an approved revision to the lines (the only way to change an approved budget).
create or replace function app.approve_budget_revision(p_revision uuid, p_approver uuid) returns void
language plpgsql as $$
declare r budget_revisions; v_sum numeric; l record; v_old numeric; v_new numeric; v_diff numeric;
begin
  select * into r from budget_revisions where id = p_revision for update;
  if not found then raise exception 'Revision not found'; end if;
  if r.status <> 'pending' then raise exception 'Revision is already %', r.status using errcode = '55000'; end if;
  if r.requested_by is not null and r.requested_by = p_approver then
    raise exception 'Maker-checker: the requester cannot approve their own revision' using errcode = '42501';
  end if;
  select coalesce(sum(delta_amount), 0) into v_sum from budget_revision_lines where revision_id = p_revision;
  if r.type = 'reallocation' and v_sum <> 0 then raise exception 'A reallocation must net to zero (net %)', v_sum using errcode = '23514'; end if;
  if r.type = 'supplementary' and v_sum <= 0 then raise exception 'A supplementary revision must add budget' using errcode = '23514'; end if;

  perform set_config('app.budget_revision', 'on', true);
  for l in select rl.budget_line_id, rl.delta_amount from budget_revision_lines rl where rl.revision_id = p_revision loop
    select budget_amount into v_old from budget_lines where id = l.budget_line_id;
    v_new := v_old + l.delta_amount;
    if v_new < 0 then raise exception 'A revision cannot take a line below zero' using errcode = '23514'; end if;
    update budget_lines set budget_amount = v_new where id = l.budget_line_id;
    if v_old > 0 and exists (select 1 from budget_line_periods where budget_line_id = l.budget_line_id) then
      -- keep the monthly phasing proportional and absorb rounding in the largest month
      update budget_line_periods set amount = round(amount * v_new / v_old, 2) where budget_line_id = l.budget_line_id;
      select v_new - sum(amount) into v_diff from budget_line_periods where budget_line_id = l.budget_line_id;
      update budget_line_periods set amount = amount + v_diff
       where id = (select id from budget_line_periods where budget_line_id = l.budget_line_id order by amount desc, id limit 1);
    end if;
  end loop;
  perform set_config('app.budget_revision', 'off', true);

  update budget_revisions set status = 'approved', approved_by = p_approver, approved_at = now(), delta_amount = v_sum where id = p_revision;
  update budgets set version_no = version_no + 1 where id = r.budget_id;
  insert into budget_snapshots (company_id, budget_id, version_no, reason, data)
  select r.company_id, r.budget_id, b.version_no, r.type || ': ' || r.reason,
         (select jsonb_agg(jsonb_build_object('line_no', line_no, 'category', category, 'amount', budget_amount) order by line_no) from budget_lines where budget_id = r.budget_id)
    from budgets b where b.id = r.budget_id;
end $$;

-- ---------------------------------------------------------------- row-level security (tenant isolation)
-- Applied to every table that has a company_id column. A request that has not set
-- app.company_id sees nothing; one that sets it sees only that company's rows.
do $$
declare t record;
begin
  for t in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
    where n.nspname = current_schema() and c.relkind in ('r','p') and not c.relispartition
      and c.relname not in ('consolidation_members','group_account_map','elimination_lines')   -- organization-level, own policies below
  loop
    execute format('alter table %I enable row level security', t.table_name);
    execute format('alter table %I force row level security', t.table_name);
    execute format('create policy tenant_isolation on %I using (company_id = app.current_company()) with check (company_id = app.current_company())', t.table_name);
  end loop;
end $$;

-- Organization-level and two-company tables get their own policies.
-- Inter-company transactions: visible to (and writable by) either company involved, nobody else.
alter table intercompany_transactions enable row level security;
alter table intercompany_transactions force row level security;
create policy intercompany_parties on intercompany_transactions
  using (from_company_id = app.current_company() or to_company_id = app.current_company())
  with check (from_company_id = app.current_company() or to_company_id = app.current_company());

-- Consolidation objects: visible to the organization they belong to.
do $$
declare t text;
begin
  foreach t in array array['consolidation_groups','group_accounts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (org_id = app.current_org()) with check (org_id = app.current_org())', t);
  end loop;
  foreach t in array array['consolidation_runs','consolidation_members'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (exists (select 1 from consolidation_groups g where g.id = group_id and g.org_id = app.current_org()))', t);
  end loop;
  foreach t in array array['consolidated_balances','elimination_entries'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (exists (select 1 from consolidation_runs r join consolidation_groups g on g.id = r.group_id where r.id = run_id and g.org_id = app.current_org()))', t);
  end loop;
end $$;
alter table elimination_lines enable row level security;
alter table elimination_lines force row level security;
create policy org_isolation on elimination_lines
  using (exists (select 1 from elimination_entries e join consolidation_runs r on r.id = e.run_id join consolidation_groups g on g.id = r.group_id where e.id = entry_id and g.org_id = app.current_org()));
alter table group_account_map enable row level security;
alter table group_account_map force row level security;
create policy org_isolation on group_account_map
  using (exists (select 1 from companies c where c.id = company_id and c.org_id = app.current_org()));
