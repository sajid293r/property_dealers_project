-- 0008: administration (invites, plan lookup), CRM leads, quotations, post-dated cheques, service invoices, contracts.
-- Every new table follows the house rules: company_id + row-level security, company-checked references, audit trail.

-- ---------------------------------------------------------------- the plan a company is on (read from its organization)
-- A small definer function so the API can learn the plan without being allowed to read organizations directly.
create or replace function app.company_plan(p_company uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select o.plan from companies c join organizations o on o.id = c.org_id where c.id = p_company
$$;

create or replace function app.company_org(p_company uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select org_id from companies where id = p_company
$$;

-- ---------------------------------------------------------------- more standard ledger accounts
create or replace function app.ensure_account(p_company uuid, p_code text, p_name text, p_class text, p_category text, p_party boolean default false)
returns uuid language plpgsql as $$
declare v_id uuid; v_parent uuid;
begin
  select id into v_id from gl_accounts where company_id = p_company and code = p_code;
  if v_id is not null then return v_id; end if;
  select id into v_parent from gl_accounts where company_id = p_company and code = regexp_replace(p_code, '\.[^.]+$', '');
  insert into gl_accounts (company_id, code, name, account_class, category, parent_id, is_group, is_system, requires_party)
  values (p_company, p_code, p_name, p_class, p_category, v_parent, false, false, p_party) returning id into v_id;
  return v_id;
end $$;

create or replace function app.seed_extra_accounts(p_company uuid) returns void language plpgsql as $$
begin
  if not exists (select 1 from gl_accounts where company_id = p_company) then return; end if;
  perform app.ensure_account(p_company, '02.01.01.0004', 'Salaries & Wages Payable',  'liability', 'liability_payable', false);
  perform app.ensure_account(p_company, '02.01.01.0005', 'Contractor Retention Payable', 'liability', 'liability_payable', true);
  perform app.ensure_account(p_company, '02.01.01.0006', 'Contractors Payable',       'liability', 'liability_payable', true);
end $$;

create or replace function app.seed_company_defaults(p_company uuid) returns int
language plpgsql as $$
declare v_added int;
begin
  update companies set settings = settings || '{"marla_sqft": 272.25}'::jsonb
   where id = p_company and not (settings ? 'marla_sqft');

  insert into property_types (company_id, code, name, property_group)
  select p_company, t.code, t.name, t.grp
    from (values
      ('plot',            'Residential Plot', 'residential'),
      ('commercial_plot', 'Commercial Plot',  'commercial'),
      ('house',           'House',            'residential'),
      ('apartment',       'Apartment',        'residential'),
      ('shop',            'Shop',             'commercial'),
      ('office',          'Office',           'commercial'),
      ('farmhouse',       'Farmhouse',        'agricultural'),
      ('warehouse',       'Warehouse',        'industrial')) as t(code, name, grp)
  on conflict (company_id, code) do nothing;
  get diagnostics v_added = row_count;

  perform app.seed_chart_of_accounts(p_company);
  perform app.seed_extra_accounts(p_company);
  return v_added;
end $$;

select app.seed_extra_accounts(id) from companies;

-- two more permission areas: copy each role's grant for "staff" so existing roles keep working
insert into role_permissions (role_id, module, can_view, can_create, can_edit, can_delete, can_approve, data_scope)
select rp.role_id, m.module, rp.can_view, rp.can_create, rp.can_edit, rp.can_delete, rp.can_approve, rp.data_scope
  from role_permissions rp cross join (values ('contractors'), ('leave')) as m(module)
 where rp.module = 'staff'
on conflict (role_id, module) do nothing;

-- ---------------------------------------------------------------- inviting colleagues
-- The invited person creates their own sign-in (sign-up page). The first time they sign in with that email, every
-- pending invite for it turns into a membership. Nothing else is needed from the administrator.
create table company_invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  email       text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id     uuid not null references roles(id),
  status      text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  accepted_by uuid references users(id),
  accepted_at timestamptz
);
create unique index company_invites_pending_uq on company_invites (company_id, email) where status = 'pending';
select app.enable_tenant_rls('company_invites');

create or replace function app.accept_invites(p_user uuid, p_email text) returns int
language plpgsql security definer set search_path = public, app as $$
declare r record; n int := 0;
begin
  for r in select * from company_invites where email = lower(btrim(p_email)) and status = 'pending' for update loop
    insert into company_members (company_id, user_id, role_id, status) values (r.company_id, p_user, r.role_id, 'active')
    on conflict (company_id, user_id) do nothing;
    update company_invites set status = 'accepted', accepted_by = p_user, accepted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- CRM leads
create table leads (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id),
  lead_no             text not null,
  name                text not null check (btrim(name) <> ''),
  phone               text,
  email               text,
  city                text,
  source              text not null default 'walk_in' check (source in ('walk_in','phone','website','social_media','referral','dealer','exhibition','other')),
  stage               text not null default 'new' check (stage in ('new','contacted','site_visit','negotiation','won','lost')),
  interest_project_id uuid references projects(id),
  interest_type       text,
  budget_min          numeric(18,2) check (budget_min >= 0),
  budget_max          numeric(18,2) check (budget_max >= 0),
  assigned_to         uuid references users(id),
  dealer_id           uuid references parties(id),
  next_followup       date,
  notes               text,
  lost_reason         text,
  party_id            uuid references parties(id),             -- the customer this lead became
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  version             int not null default 1,
  unique (company_id, lead_no),
  check (budget_max is null or budget_min is null or budget_max >= budget_min),
  check (stage <> 'lost' or lost_reason is not null)
);
create index leads_stage_idx on leads (company_id, stage);
create index leads_followup_idx on leads (company_id, next_followup) where stage not in ('won','lost');
create trigger leads_touch before update on leads for each row execute function app.touch_updated_at();
select app.enable_tenant_rls('leads');
select app.add_tenant_fk('leads', 'interest_project_id', 'projects');
select app.add_tenant_fk('leads', 'dealer_id', 'parties');
select app.add_tenant_fk('leads', 'party_id', 'parties');
select app.attach_audit('leads');

create table lead_activities (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id),
  lead_id      uuid not null references leads(id),
  kind         text not null check (kind in ('call','whatsapp','meeting','site_visit','note','stage_change')),
  note         text,
  activity_at  timestamptz not null default now(),
  created_by   uuid references users(id)
);
create index lead_activities_lead_idx on lead_activities (lead_id, activity_at desc);
select app.enable_tenant_rls('lead_activities');
select app.add_tenant_fk('lead_activities', 'lead_id', 'leads');

-- A lead becomes a customer in the address book (once). The lead is marked won.
create or replace function app.convert_lead(p_lead uuid, p_by uuid) returns uuid
language plpgsql as $$
declare l leads; v_party uuid; v_phone text;
begin
  select * into l from leads where id = p_lead for update;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  if l.party_id is not null then return l.party_id; end if;
  v_phone := case when l.phone ~ '^\+92[0-9]{10}$' then l.phone else null end;
  insert into parties (company_id, display_name, phone_e164, email, city, notes, created_by)
  values (l.company_id, l.name, v_phone, l.email, l.city, l.notes, p_by) returning id into v_party;
  insert into party_roles (company_id, party_id, role) values (l.company_id, v_party, 'customer');
  update leads set party_id = v_party, stage = 'won' where id = p_lead;
  insert into lead_activities (company_id, lead_id, kind, note, created_by) values (l.company_id, p_lead, 'stage_change', 'Became a customer', p_by);
  return v_party;
end $$;

-- ---------------------------------------------------------------- quotations
create table quotations (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  quote_no        text not null,
  lead_id         uuid references leads(id),
  party_id        uuid references parties(id),
  property_id     uuid not null references properties(id),
  quote_date      date not null default current_date,
  valid_until     date not null,
  list_price      numeric(18,2) not null check (list_price >= 0),
  discount        numeric(18,2) not null default 0 check (discount >= 0),
  net_price       numeric(18,2) generated always as (list_price - discount) stored,
  down_payment    numeric(18,2) not null default 0 check (down_payment >= 0),
  installments    int not null default 0 check (installments between 0 and 600),
  interval_months int not null default 1 check (interval_months between 1 and 24),
  first_due       date,
  status          text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  booking_id      uuid references bookings(id),
  notes           text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         int not null default 1,
  unique (company_id, quote_no),
  check (lead_id is not null or party_id is not null),
  check (valid_until >= quote_date),
  check (discount <= list_price),
  check (down_payment <= list_price - discount),
  check (installments = 0 or first_due is not null)
);
create index quotations_status_idx on quotations (company_id, status);
create trigger quotations_touch before update on quotations for each row execute function app.touch_updated_at();
select app.enable_tenant_rls('quotations');
select app.add_tenant_fk('quotations', 'lead_id', 'leads');
select app.add_tenant_fk('quotations', 'party_id', 'parties');
select app.add_tenant_fk('quotations', 'property_id', 'properties');
select app.add_tenant_fk('quotations', 'booking_id', 'bookings');
select app.attach_audit('quotations');

-- Accepting a quotation books the property for the customer (turning the lead into a customer first when needed)
-- and builds the payment plan that was quoted. One transaction: either all of it happens or none.
create or replace function app.accept_quotation(p_quote uuid, p_by uuid, p_date date default current_date) returns uuid
language plpgsql as $$
declare q quotations; v_customer uuid; v_booking uuid;
begin
  select * into q from quotations where id = p_quote for update;
  if not found then raise exception 'Quotation not found' using errcode = 'P0002'; end if;
  if q.status = 'accepted' then return q.booking_id; end if;
  if q.status = 'rejected' then raise exception 'This quotation was rejected; make a new one' using errcode = '55000'; end if;
  if q.valid_until < p_date then raise exception 'This quotation expired on %; make a new one', q.valid_until using errcode = '55000'; end if;

  v_customer := q.party_id;
  if v_customer is null then v_customer := app.convert_lead(q.lead_id, p_by); end if;
  v_booking := app.create_booking(q.property_id, v_customer, case when q.installments > 0 then 'installment' else 'cash' end, p_by,
                                  q.list_price, q.discount, p_date);
  if q.installments > 0 or q.down_payment > 0 then
    perform app.build_schedule(v_booking, q.down_payment, q.installments, q.first_due, q.interval_months, 0, null);
  end if;
  update quotations set status = 'accepted', booking_id = v_booking, party_id = v_customer where id = p_quote;
  return v_booking;
end $$;

-- ---------------------------------------------------------------- post-dated cheque register
-- received: cheques customers gave us.  issued: cheques we gave suppliers or contractors.
-- Clearing a RECEIVED cheque records the receipt (so the books and the booking's installments move together).
create table cheques (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  direction       text not null check (direction in ('received','issued')),
  cheque_no       text not null check (btrim(cheque_no) <> ''),
  bank_name       text not null check (btrim(bank_name) <> ''),
  party_id        uuid not null references parties(id),
  booking_id      uuid references bookings(id),
  amount          numeric(18,2) not null check (amount > 0),
  cheque_date     date not null,
  received_on     date not null default current_date,
  status          text not null default 'in_hand' check (status in ('in_hand','deposited','cleared','bounced','returned','cancelled')),
  bank_account_id uuid references bank_accounts(id),
  deposited_on    date,
  cleared_on      date,
  bounced_on      date,
  bounce_reason   text,
  receipt_id      uuid references receipts(id),
  notes           text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         int not null default 1,
  check (direction = 'received' or booking_id is null)
);
create index cheques_due_idx on cheques (company_id, cheque_date) where status in ('in_hand','deposited');
create trigger cheques_touch before update on cheques for each row execute function app.touch_updated_at();
select app.enable_tenant_rls('cheques');
select app.add_tenant_fk('cheques', 'party_id', 'parties');
select app.add_tenant_fk('cheques', 'booking_id', 'bookings');
select app.add_tenant_fk('cheques', 'bank_account_id', 'bank_accounts');
select app.add_tenant_fk('cheques', 'receipt_id', 'receipts');
select app.attach_audit('cheques');

create or replace function app.deposit_cheque(p_cheque uuid, p_bank_account uuid, p_date date, p_by uuid) returns void
language plpgsql as $$
declare c cheques;
begin
  select * into c from cheques where id = p_cheque for update;
  if not found then raise exception 'Cheque not found' using errcode = 'P0002'; end if;
  if c.direction <> 'received' then raise exception 'Only a cheque received from a customer is deposited' using errcode = '55000'; end if;
  if c.status <> 'in_hand' then raise exception 'This cheque is % and cannot be deposited', c.status using errcode = '55000'; end if;
  if not exists (select 1 from bank_accounts where id = p_bank_account and active) then raise exception 'Choose the bank account it is deposited into' using errcode = '23514'; end if;
  update cheques set status = 'deposited', bank_account_id = p_bank_account, deposited_on = coalesce(p_date, current_date) where id = p_cheque;
end $$;

create or replace function app.clear_cheque(p_cheque uuid, p_date date, p_by uuid) returns uuid
language plpgsql as $$
declare c cheques; v_receipt uuid; v_gl uuid;
begin
  select * into c from cheques where id = p_cheque for update;
  if not found then raise exception 'Cheque not found' using errcode = 'P0002'; end if;
  if c.direction = 'issued' then
    if c.status <> 'in_hand' then raise exception 'This cheque is already %', c.status using errcode = '55000'; end if;
    update cheques set status = 'cleared', cleared_on = coalesce(p_date, current_date) where id = p_cheque;
    return null;
  end if;
  if c.status <> 'deposited' then raise exception 'Deposit the cheque before it can clear (it is %)', c.status using errcode = '55000'; end if;
  select gl_account_id into v_gl from bank_accounts where id = c.bank_account_id;
  v_receipt := app.record_receipt(c.booking_id, c.amount, 'cheque', v_gl, coalesce(p_date, current_date), c.cheque_no, p_by, null, c.party_id);
  update cheques set status = 'cleared', cleared_on = coalesce(p_date, current_date), receipt_id = v_receipt where id = p_cheque;
  return v_receipt;
end $$;

create or replace function app.bounce_cheque(p_cheque uuid, p_date date, p_reason text, p_by uuid) returns void
language plpgsql as $$
declare c cheques;
begin
  select * into c from cheques where id = p_cheque for update;
  if not found then raise exception 'Cheque not found' using errcode = 'P0002'; end if;
  if c.status not in ('in_hand','deposited') then raise exception 'This cheque is already %', c.status using errcode = '55000'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Say why the cheque bounced' using errcode = '23514'; end if;
  update cheques set status = 'bounced', bounced_on = coalesce(p_date, current_date), bounce_reason = btrim(p_reason) where id = p_cheque;
end $$;

create or replace function app.return_cheque(p_cheque uuid, p_by uuid) returns void
language plpgsql as $$
declare c cheques;
begin
  select * into c from cheques where id = p_cheque for update;
  if not found then raise exception 'Cheque not found' using errcode = 'P0002'; end if;
  if c.status <> 'in_hand' then raise exception 'Only a cheque still in hand can be returned or cancelled (this one is %)', c.status using errcode = '55000'; end if;
  update cheques set status = case when c.direction = 'issued' then 'cancelled' else 'returned' end where id = p_cheque;
end $$;

-- ---------------------------------------------------------------- service invoices (maintenance, transfer fees, …)
alter table service_invoices
  add column issue_date date not null default current_date,
  add column description text,
  add column revenue_account_id uuid references gl_accounts(id),
  add column journal_entry_id uuid references journal_entries(id),
  add column updated_at timestamptz not null default now();
select app.add_tenant_fk('service_invoices', 'revenue_account_id', 'gl_accounts');
select app.add_tenant_fk('service_invoices', 'journal_entry_id', 'journal_entries');
select app.attach_audit('service_invoices');

create or replace function app.issue_service_invoice(
  p_customer uuid, p_property uuid, p_period text, p_issue date, p_due date, p_amount numeric,
  p_revenue uuid, p_description text, p_by uuid) returns uuid
language plpgsql as $$
declare v_company uuid; v_ar uuid; v_rev uuid; v_id uuid := gen_random_uuid(); v_no text; v_entry uuid := gen_random_uuid();
begin
  if p_amount is null or p_amount <= 0 then raise exception 'The invoice amount must be more than zero' using errcode = '23514'; end if;
  if p_due < p_issue then raise exception 'The due date cannot be before the invoice date' using errcode = '23514'; end if;
  select company_id into v_company from parties where id = p_customer;
  if v_company is null then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  select id into v_ar from gl_accounts where company_id = v_company and code = '03.01.02.0001' and not is_group;
  if p_revenue is not null then
    select id into v_rev from gl_accounts where id = p_revenue and company_id = v_company and account_class = 'income' and not is_group;
    if v_rev is null then raise exception 'Choose an income account for this invoice' using errcode = '23514'; end if;
  else
    select id into v_rev from gl_accounts where company_id = v_company and code = '04.01.03.0001';
  end if;
  if v_ar is null or v_rev is null then raise exception 'The standard receivable and service income accounts are missing' using errcode = '23514'; end if;

  v_no := app.next_doc_no(v_company, 'SINV');
  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, v_company, v_no, p_issue, app.ensure_period(v_company, p_issue), 'invoice', v_id, coalesce(nullif(btrim(p_description), ''), 'Service invoice ' || v_no), p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
  values (v_company, v_entry, 1, v_ar, p_customer, p_amount, 0, p_period), (v_company, v_entry, 2, v_rev, p_customer, 0, p_amount, p_period);
  insert into service_invoices (id, company_id, number, customer_id, property_id, period_label, due_date, amount, issue_date, description, revenue_account_id, journal_entry_id, created_by)
  values (v_id, v_company, v_no, p_customer, p_property, nullif(btrim(coalesce(p_period, '')), ''), p_due, p_amount, p_issue, nullif(btrim(coalesce(p_description, '')), ''), v_rev, v_entry, p_by);
  return v_id;
end $$;

-- Money received for a service invoice: a receipt whose ledger entry clears the customer's receivable.
create or replace function app.pay_service_invoice(
  p_invoice uuid, p_amount numeric, p_method text, p_deposit uuid, p_date date, p_ref text, p_by uuid) returns uuid
language plpgsql as $$
declare s service_invoices; acct gl_accounts; v_ar uuid; v_id uuid := gen_random_uuid(); v_entry uuid := gen_random_uuid(); v_no text;
begin
  select * into s from service_invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if s.status = 'void' then raise exception 'This invoice is void' using errcode = '55000'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'The amount received must be more than zero' using errcode = '23514'; end if;
  if p_amount > s.amount - s.paid_amount then raise exception 'Only % is still unpaid on this invoice', s.amount - s.paid_amount using errcode = '23514'; end if;
  if p_method not in ('cash','cheque','bank_transfer','online','pay_order') then raise exception 'Choose how the money was received' using errcode = '23514'; end if;
  select * into acct from gl_accounts where id = p_deposit and company_id = s.company_id;
  if not found or acct.is_group or acct.category not in ('asset_cash','asset_bank') then raise exception 'Money can only be received into a cash or bank account' using errcode = '23514'; end if;
  select id into v_ar from gl_accounts where company_id = s.company_id and code = '03.01.02.0001' and not is_group;

  v_no := app.next_doc_no(s.company_id, 'RCT');
  insert into receipts (id, company_id, receipt_no, customer_id, received_on, amount, method, deposit_account, instrument_ref, created_by)
  values (v_id, s.company_id, v_no, s.customer_id, coalesce(p_date, current_date), p_amount, p_method, p_deposit, nullif(btrim(coalesce(p_ref, '')), ''), p_by);
  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, s.company_id, v_no, coalesce(p_date, current_date), app.ensure_period(s.company_id, coalesce(p_date, current_date)), 'receipt', v_id, 'Receipt ' || v_no || ' against ' || s.number, p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
  values (s.company_id, v_entry, 1, p_deposit, s.customer_id, p_amount, 0, p_method), (s.company_id, v_entry, 2, v_ar, s.customer_id, 0, p_amount, s.number);
  update receipts set journal_entry_id = v_entry where id = v_id;
  insert into receipt_allocations (company_id, receipt_id, service_invoice_id, amount) values (s.company_id, v_id, p_invoice, p_amount);
  return v_id;
end $$;

-- Cancelling an invoice nobody has paid reverses its ledger entry.
create or replace function app.void_service_invoice(p_invoice uuid, p_by uuid, p_reason text, p_date date default current_date) returns void
language plpgsql as $$
declare s service_invoices;
begin
  select * into s from service_invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if s.status = 'void' then raise exception 'This invoice is already void' using errcode = '55000'; end if;
  if s.paid_amount <> 0 then raise exception 'Money has been received against this invoice; void those receipts first' using errcode = '55000'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required to void an invoice' using errcode = '23514'; end if;
  if s.journal_entry_id is not null then perform app.reverse_entry(s.journal_entry_id, p_date, 'Invoice ' || s.number || ' voided: ' || p_reason, p_by); end if;
  update service_invoices set status = 'void' where id = p_invoice;
end $$;

create or replace view v_service_invoices as
select s.id, s.company_id, s.number, s.customer_id, p.display_name as customer_name, s.property_id, pr.code as property_code, pr.title as property_title,
       s.period_label, s.issue_date, s.due_date, s.amount, s.paid_amount, (s.amount - s.paid_amount) as balance, s.status, s.description,
       s.revenue_account_id, s.journal_entry_id, s.created_at,
       (s.status in ('unpaid','partial') and s.due_date < current_date) as overdue
  from service_invoices s join parties p on p.id = s.customer_id left join properties pr on pr.id = s.property_id;

-- ---------------------------------------------------------------- contracts
create table contracts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id),
  contract_no        text not null,
  kind               text not null check (kind in ('sale_agreement','rent','service','construction','employment','other')),
  title              text not null check (btrim(title) <> ''),
  party_id           uuid references parties(id),
  booking_id         uuid references bookings(id),
  property_id        uuid references properties(id),
  project_id         uuid references projects(id),
  start_date         date not null,
  end_date           date,
  value              numeric(18,2) not null default 0 check (value >= 0),
  status             text not null default 'draft' check (status in ('draft','active','terminated')),
  signed_on          date,
  terms              text,
  terminated_on      date,
  termination_reason text,
  renewal_of         uuid references contracts(id),
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            int not null default 1,
  unique (company_id, contract_no),
  check (end_date is null or end_date >= start_date),
  check (status <> 'active' or signed_on is not null),
  check (status <> 'terminated' or (terminated_on is not null and termination_reason is not null))
);
create trigger contracts_touch before update on contracts for each row execute function app.touch_updated_at();
select app.enable_tenant_rls('contracts');
select app.add_tenant_fk('contracts', 'party_id', 'parties');
select app.add_tenant_fk('contracts', 'booking_id', 'bookings');
select app.add_tenant_fk('contracts', 'property_id', 'properties');
select app.add_tenant_fk('contracts', 'project_id', 'projects');
select app.add_tenant_fk('contracts', 'renewal_of', 'contracts');
select app.attach_audit('contracts');

-- "expired" is not stored: an active contract past its end date simply reads as expired.
create or replace view v_contracts as
select c.*, p.display_name as party_name, b.booking_no, pr.code as property_code,
       case when c.status = 'active' and c.end_date is not null and c.end_date < current_date then 'expired' else c.status end as effective_status,
       case when c.end_date is null then null else c.end_date - current_date end as days_left
  from contracts c left join parties p on p.id = c.party_id left join bookings b on b.id = c.booking_id left join properties pr on pr.id = c.property_id;

select app.secure_views();
