-- 0003: bank catalog and company bank accounts, a standard chart of accounts for every company, and fiscal periods
-- that create themselves. Foundations for vouchers (0004) and bank reconciliation (0005).

-- ---------------------------------------------------------------- small helpers so every new table follows the rules
-- (tenant isolation, company-checked references, audit). Migrations call these instead of repeating the boilerplate.
create or replace function app.enable_tenant_rls(p_table text) returns void language plpgsql as $$
begin
  execute format('alter table %I enable row level security', p_table);
  execute format('alter table %I force row level security', p_table);
  execute format('create policy tenant_isolation on %I using (company_id = app.current_company()) with check (company_id = app.current_company())', p_table);
end $$;

create or replace function app.add_tenant_fk(p_child text, p_col text, p_parent text) returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_constraint where conname = p_parent || '_company_id_id_uq') then
    execute format('alter table %I add constraint %I unique (company_id, id)', p_parent, p_parent || '_company_id_id_uq');
  end if;
  execute format('alter table %I add constraint %I foreign key (company_id, %I) references %I (company_id, id)',
                 p_child, p_child || '_' || p_col || '_tenant_fk', p_col, p_parent);
end $$;

create or replace function app.attach_audit(p_table text) returns void language plpgsql as $$
begin
  execute format('create trigger %I after insert or update or delete on %I for each row execute function app.audit_row()', p_table || '_audit', p_table);
end $$;

-- ---------------------------------------------------------------- the bank catalog (shared by every company; read-only to the API)
create table banks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  short_name  text not null,
  kind        text not null check (kind in ('public','private','islamic','foreign','microfinance','digital')),
  sort_order  int not null default 100,
  active      boolean not null default true
);

-- Compiled from public sources (the State Bank of Pakistan's scheduled-bank list and the banks' own names). Banks
-- merge and rebrand: keep this list reviewed against the SBP list. A company can always type a bank that is missing.
insert into banks (name, short_name, kind, sort_order) values
  ('National Bank of Pakistan',                    'NBP',        'public', 10),
  ('The Bank of Punjab',                           'BOP',        'public', 11),
  ('The Bank of Khyber',                           'BOK',        'public', 12),
  ('Sindh Bank',                                   'Sindh Bank', 'public', 13),
  ('First Women Bank',                             'FWBL',       'public', 14),
  ('Zarai Taraqiati Bank (ZTBL)',                  'ZTBL',       'public', 15),
  ('Bank of Azad Jammu & Kashmir',                 'BAJK',       'public', 16),
  ('Habib Bank Limited',                           'HBL',        'private', 20),
  ('United Bank Limited',                          'UBL',        'private', 21),
  ('MCB Bank Limited',                             'MCB',        'private', 22),
  ('Allied Bank Limited',                          'ABL',        'private', 23),
  ('Bank Alfalah Limited',                         'Alfalah',    'private', 24),
  ('Askari Bank Limited',                          'Askari',     'private', 25),
  ('Bank AL Habib Limited',                        'BAHL',       'private', 26),
  ('Faysal Bank Limited',                          'Faysal',     'private', 27),
  ('Habib Metropolitan Bank',                      'HabibMetro', 'private', 28),
  ('JS Bank Limited',                              'JS Bank',    'private', 29),
  ('Soneri Bank Limited',                          'Soneri',     'private', 30),
  ('Standard Chartered Bank (Pakistan)',           'SCB',        'private', 31),
  ('Meezan Bank Limited',                          'Meezan',     'islamic', 40),
  ('BankIslami Pakistan Limited',                  'BankIslami', 'islamic', 41),
  ('Dubai Islamic Bank Pakistan',                  'DIB',        'islamic', 42),
  ('Al Baraka Bank (Pakistan)',                    'Al Baraka',  'islamic', 43),
  ('MCB Islamic Bank',                             'MCB Islamic','islamic', 44),
  ('Citibank N.A. (Pakistan)',                     'Citi',       'foreign', 50),
  ('Deutsche Bank AG (Pakistan)',                  'Deutsche',   'foreign', 51),
  ('HSBC Bank Middle East (Pakistan)',             'HSBC',       'foreign', 52),
  ('Industrial and Commercial Bank of China',      'ICBC',       'foreign', 53),
  ('Bank of China (Pakistan)',                     'BOC',        'foreign', 54),
  ('MUFG Bank (Pakistan)',                         'MUFG',       'foreign', 55),
  ('Khushhali Microfinance Bank',                  'Khushhali',  'microfinance', 60),
  ('HBL Microfinance Bank',                        'HBL MFB',    'microfinance', 61),
  ('U Microfinance Bank (U Bank)',                 'U Bank',     'microfinance', 62),
  ('Mobilink Microfinance Bank (JazzCash)',        'Mobilink MFB','microfinance', 63),
  ('Telenor Microfinance Bank (Easypaisa)',        'Telenor MFB','microfinance', 64),
  ('NRSP Microfinance Bank',                       'NRSP MFB',   'microfinance', 65),
  ('FINCA Microfinance Bank',                      'FINCA',      'microfinance', 66),
  ('Apna Microfinance Bank',                       'Apna MFB',   'microfinance', 67),
  ('Advans Pakistan Microfinance Bank',            'Advans',     'microfinance', 68),
  ('JazzCash (wallet)',                            'JazzCash',   'digital', 70),
  ('Easypaisa (wallet)',                           'Easypaisa',  'digital', 71),
  ('SadaPay',                                      'SadaPay',    'digital', 72),
  ('NayaPay',                                      'NayaPay',    'digital', 73);

-- ---------------------------------------------------------------- the company's own bank accounts
-- Each one is also a ledger account (under Cash & Bank), so a bank payment/receipt voucher posts to it and the
-- bank reconciliation (0005) can match its entries against the statement.
create table bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  gl_account_id uuid not null unique,
  bank_id       uuid references banks(id),                  -- null when the bank is typed in by hand
  bank_name     text not null,
  branch_name   text,
  branch_code   text,
  account_title text not null,
  account_no    text not null,
  iban          text check (iban is null or iban ~ '^PK[0-9]{2}[A-Z]{4}[0-9]{16}$'),
  currency      char(3) not null default 'PKR',
  active        boolean not null default true,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       int not null default 1,
  unique (company_id, bank_name, account_no)
);
create trigger bank_accounts_touch before update on bank_accounts for each row execute function app.touch_updated_at();
select app.enable_tenant_rls('bank_accounts');
select app.add_tenant_fk('bank_accounts', 'gl_account_id', 'gl_accounts');
select app.attach_audit('bank_accounts');

-- ---------------------------------------------------------------- a standard chart of accounts for a property developer
-- Segmented codes (class . group . sub-group . account), the same layout the screens already use.
-- Idempotent: adds only the accounts a company is missing; never touches ones it has renamed or added.
create or replace function app.seed_chart_of_accounts(p_company uuid) returns int
language plpgsql as $$
declare v_added int;
begin
  insert into gl_accounts (company_id, code, name, account_class, category, is_group, is_system, requires_party)
  select p_company, c.code, c.name, c.cls, c.cat, c.grp, c.sys, c.party
    from (values
      -- code,            name,                                   class,       category,              group, system, party
      ('01',            'Capital',                               'equity',    'equity',              true,  false, false),
      ('01.01',         'Owner''s Equity',                       'equity',    'equity',              true,  false, false),
      ('01.01.01',      'Capital Account',                       'equity',    'equity',              true,  false, false),
      ('01.01.01.0001', 'Owner''s Capital',                      'equity',    'equity',              false, false, false),
      ('01.01.01.0002', 'Owner''s Drawings',                     'equity',    'equity',              false, false, false),
      ('01.01.02',      'Accumulated Profit & Loss',             'equity',    'equity_unaffected',   true,  false, false),
      ('01.01.02.0001', 'Retained Earnings',                     'equity',    'equity_unaffected',   false, true,  false),

      ('02',            'Liabilities',                           'liability', 'liability',           true,  false, false),
      ('02.01',         'Current Liabilities',                   'liability', 'liability_current',   true,  false, false),
      ('02.01.01',      'Accounts Payable',                      'liability', 'liability_payable',   true,  false, false),
      ('02.01.01.0001', 'Trade Payables - Suppliers',            'liability', 'liability_payable',   false, true,  true),
      ('02.01.01.0002', 'Dealer Commission Payable',             'liability', 'liability_payable',   false, false, true),
      ('02.01.01.0003', 'Accrued Expenses Payable',              'liability', 'liability_payable',   false, false, false),
      ('02.01.02',      'Customer Advances',                     'liability', 'liability_current',   true,  false, false),
      ('02.01.02.0001', 'Customer Advances & Deposits',          'liability', 'liability_current',   false, true,  true),
      ('02.01.03',      'Taxes Payable',                         'liability', 'liability_tax',       true,  false, false),
      ('02.01.03.0001', 'Sales Tax Payable',                     'liability', 'liability_tax',       false, true,  false),
      ('02.01.03.0002', 'Withholding Tax Payable',               'liability', 'liability_tax',       false, false, false),
      ('02.01.03.0003', 'Income Tax Payable',                    'liability', 'liability_tax',       false, false, false),
      ('02.02',         'Long Term Liabilities',                 'liability', 'liability_non_current', true, false, false),
      ('02.02.01',      'Long Term Loans',                       'liability', 'liability_non_current', true, false, false),
      ('02.02.01.0001', 'Bank Loan Payable',                     'liability', 'liability_non_current', false, false, false),

      ('03',            'Assets',                                'asset',     'asset',               true,  false, false),
      ('03.01',         'Current Assets',                        'asset',     'asset_current',       true,  false, false),
      ('03.01.01',      'Cash & Bank',                           'asset',     'asset_cash',          true,  false, false),
      ('03.01.01.0001', 'Cash in Hand',                          'asset',     'asset_cash',          false, true,  false),
      ('03.01.02',      'Receivables',                           'asset',     'asset_receivable',    true,  false, false),
      ('03.01.02.0001', 'Trade Receivables - Customers',         'asset',     'asset_receivable',    false, true,  true),
      ('03.01.02.0002', 'Staff Advances Receivable',             'asset',     'asset_receivable',    false, false, true),
      ('03.01.02.0003', 'Other Receivables',                     'asset',     'asset_receivable',    false, false, false),
      ('03.01.03',      'Stock In Hand',                         'asset',     'asset_current',       true,  false, false),
      ('03.01.03.0001', 'Unsold Properties Inventory',           'asset',     'asset_current',       false, false, false),
      ('03.01.04',      'Prepayments',                           'asset',     'asset_prepayments',   true,  false, false),
      ('03.01.04.0001', 'Prepaid Expenses',                      'asset',     'asset_prepayments',   false, false, false),
      ('03.01.05',      'Taxes Receivable',                      'asset',     'asset_tax',           true,  false, false),
      ('03.01.05.0001', 'Input Sales Tax',                       'asset',     'asset_tax',           false, true,  false),
      ('03.01.05.0002', 'Advance Income Tax / Withholding Tax',  'asset',     'asset_tax',           false, false, false),
      ('03.02',         'Fixed Assets',                          'asset',     'asset_fixed',         true,  false, false),
      ('03.02.01',      'Property & Equipment',                  'asset',     'asset_fixed',         true,  false, false),
      ('03.02.01.0001', 'Office Equipment & Furniture',          'asset',     'asset_fixed',         false, false, false),
      ('03.02.01.0002', 'Vehicles',                              'asset',     'asset_fixed',         false, false, false),

      ('04',            'Income',                                'income',    'income',              true,  false, false),
      ('04.01',         'Operating Revenue',                     'income',    'income',              true,  false, false),
      ('04.01.01',      'Sales Revenue',                         'income',    'income',              true,  false, false),
      ('04.01.01.0001', 'Property Sales Revenue',                'income',    'income',              false, true,  false),
      ('04.01.01.0002', 'Sales Returns & Discounts',             'income',    'income',              false, false, false),
      ('04.01.02',      'Commission Revenue',                    'income',    'income',              true,  false, false),
      ('04.01.02.0001', 'Commission Income',                     'income',    'income',              false, false, false),
      ('04.01.03',      'Service Revenue',                       'income',    'income',              true,  false, false),
      ('04.01.03.0001', 'Maintenance & Service Charges',         'income',    'income',              false, false, false),
      ('04.01.03.0002', 'Transfer & Documentation Fees',         'income',    'income',              false, false, false),
      ('04.01.03.0003', 'Late Payment Surcharge',                'income',    'income',              false, false, false),
      ('04.02',         'Other Income',                          'income',    'income_other',        true,  false, false),
      ('04.02.01',      'Miscellaneous Income',                  'income',    'income_other',        true,  false, false),
      ('04.02.01.0001', 'Other Income',                          'income',    'income_other',        false, false, false),
      ('04.02.01.0002', 'Bank Profit / Interest Income',         'income',    'income_other',        false, false, false),

      ('05',            'Expenses',                              'expense',   'expense',             true,  false, false),
      ('05.01',         'Cost of Revenue',                       'expense',   'expense_direct_cost', true,  false, false),
      ('05.01.01',      'Direct Costs',                          'expense',   'expense_direct_cost', true,  false, false),
      ('05.01.01.0001', 'Land Acquisition Cost',                 'expense',   'expense_direct_cost', false, false, false),
      ('05.01.01.0002', 'Contractor & Construction Cost',        'expense',   'expense_direct_cost', false, false, false),
      ('05.01.01.0003', 'Development & Infrastructure Cost',     'expense',   'expense_direct_cost', false, false, false),
      ('05.01.01.0004', 'Purchases Returns & Discounts',         'expense',   'expense_direct_cost', false, false, false),
      ('05.02',         'Operating Expenses',                    'expense',   'expense',             true,  false, false),
      ('05.02.01',      'Administrative Expenses',               'expense',   'expense',             true,  false, false),
      ('05.02.01.0001', 'Utility Expense',                       'expense',   'expense',             false, false, false),
      ('05.02.01.0002', 'Office Supplies Expense',               'expense',   'expense',             false, false, false),
      ('05.02.01.0003', 'Printing & Stationery',                 'expense',   'expense',             false, false, false),
      ('05.02.01.0004', 'Communication Expense',                 'expense',   'expense',             false, false, false),
      ('05.02.01.0005', 'Professional & Legal Fees',             'expense',   'expense',             false, false, false),
      ('05.02.02',      'Occupancy Expenses',                    'expense',   'expense',             true,  false, false),
      ('05.02.02.0001', 'Rent Expense',                          'expense',   'expense',             false, false, false),
      ('05.02.02.0002', 'Maintenance Expense',                   'expense',   'expense',             false, false, false),
      ('05.02.03',      'Selling & Marketing',                   'expense',   'expense',             true,  false, false),
      ('05.02.03.0001', 'Marketing Expense',                     'expense',   'expense',             false, false, false),
      ('05.02.03.0002', 'Travel Expense',                        'expense',   'expense',             false, false, false),
      ('05.02.03.0003', 'Dealer Commission Expense',             'expense',   'expense',             false, false, false),
      ('05.02.04',      'Payroll Expenses',                      'expense',   'expense',             true,  false, false),
      ('05.02.04.0001', 'Salaries & Wages',                      'expense',   'expense',             false, false, false),
      ('05.02.05',      'Financial Expenses',                    'expense',   'expense',             true,  false, false),
      ('05.02.05.0001', 'Bank Charges',                          'expense',   'expense',             false, false, false),
      ('05.02.05.0002', 'Markup / Interest Expense',             'expense',   'expense',             false, false, false),
      ('05.03',         'Other Expenses',                        'expense',   'expense_other',       true,  false, false),
      ('05.03.01',      'Miscellaneous Expenses',                'expense',   'expense_other',       true,  false, false),
      ('05.03.01.0001', 'Other Expenses',                        'expense',   'expense_other',       false, false, false)
    ) as c(code, name, cls, cat, grp, sys, party)
  on conflict (company_id, code) do nothing;
  get diagnostics v_added = row_count;

  -- link each account to its parent by code ("03.01.01.0002" belongs to "03.01.01")
  update gl_accounts a set parent_id = p.id
    from gl_accounts p
   where a.company_id = p_company and p.company_id = p_company and a.parent_id is null
     and position('.' in a.code) > 0 and p.code = regexp_replace(a.code, '\.[^.]+$', '');
  return v_added;
end $$;

-- A new company starts with everything it needs to begin: property types, size setting AND a chart of accounts.
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
  return v_added;
end $$;

-- Add a bank account and its ledger account in one step. The bank is chosen from the catalog, or typed in.
create or replace function app.create_bank_account(
  p_company uuid, p_bank_id uuid, p_bank_name text, p_branch_name text, p_branch_code text,
  p_title text, p_account_no text, p_iban text, p_by uuid) returns uuid
language plpgsql as $$
declare v_bank text; v_group uuid; v_next int; v_gl uuid; v_id uuid; v_short text;
begin
  if p_bank_id is not null then
    select name, short_name into v_bank, v_short from banks where id = p_bank_id and active;
    if v_bank is null then raise exception 'Unknown bank' using errcode = '23514'; end if;
  else
    v_bank := nullif(btrim(coalesce(p_bank_name, '')), '');
    if v_bank is null then raise exception 'Choose a bank or type its name' using errcode = '23514'; end if;
    v_short := v_bank;
  end if;
  if nullif(btrim(coalesce(p_account_no, '')), '') is null then raise exception 'The account number is required' using errcode = '23514'; end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then raise exception 'The account title is required' using errcode = '23514'; end if;

  perform app.seed_chart_of_accounts(p_company);       -- no-op when the company already has its chart
  select id into v_group from gl_accounts where company_id = p_company and code = '03.01.01';

  select coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 into v_next
    from gl_accounts where company_id = p_company and parent_id = v_group;
  insert into gl_accounts (company_id, code, name, account_class, category, parent_id, is_group)
  values (p_company, '03.01.01.' || lpad(v_next::text, 4, '0'), v_short || ' - ' || btrim(p_account_no), 'asset', 'asset_bank', v_group, false)
  returning id into v_gl;

  insert into bank_accounts (company_id, gl_account_id, bank_id, bank_name, branch_name, branch_code, account_title, account_no, iban, created_by)
  values (p_company, v_gl, p_bank_id, v_bank, nullif(btrim(coalesce(p_branch_name, '')), ''), nullif(btrim(coalesce(p_branch_code, '')), ''),
          btrim(p_title), btrim(p_account_no), nullif(upper(btrim(coalesce(p_iban, ''))), ''), p_by)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- fiscal periods that create themselves
-- A voucher dated in a year that has no periods yet gets them (12 monthly periods in the company's financial year,
-- July to June by default). Idempotent. Never touches an existing, possibly locked, period.
create or replace function app.ensure_period(p_company uuid, p_date date) returns uuid
language plpgsql as $$
declare v_id uuid; v_m int; v_year int; v_start date; v_fy uuid; v_existing date; i int;
begin
  select id into v_id from accounting_periods where company_id = p_company and p_date between start_date and end_date;
  if v_id is not null then return v_id; end if;

  select fiscal_year_start into v_m from companies where id = p_company;
  if v_m is null then raise exception 'Company not found' using errcode = 'P0002'; end if;
  v_year := case when extract(month from p_date)::int >= v_m then extract(year from p_date)::int else extract(year from p_date)::int - 1 end;
  v_start := make_date(v_year, v_m, 1);

  insert into fiscal_years (company_id, name, start_date, end_date)
  values (p_company,
          case when v_m = 1 then 'FY' || v_year else 'FY' || v_year || '-' || lpad(((v_year + 1) % 100)::text, 2, '0') end,
          v_start, (v_start + interval '1 year' - interval '1 day')::date)
  on conflict (company_id, name) do nothing;
  select id, start_date into v_fy, v_existing from fiscal_years
   where company_id = p_company and name = case when v_m = 1 then 'FY' || v_year else 'FY' || v_year || '-' || lpad(((v_year + 1) % 100)::text, 2, '0') end;
  if v_existing is distinct from v_start then
    raise exception 'A financial year with this name already exists with different dates; set up its periods by hand' using errcode = '23514';
  end if;

  for i in 0 .. 11 loop
    insert into accounting_periods (company_id, fiscal_year_id, start_date, end_date)
    values (p_company, v_fy, (v_start + make_interval(months => i))::date,
            (v_start + make_interval(months => i + 1) - interval '1 day')::date)
    on conflict (company_id, start_date) do nothing;
  end loop;

  select id into v_id from accounting_periods where company_id = p_company and p_date between start_date and end_date;
  if v_id is null then raise exception 'No accounting period covers %', p_date using errcode = '23514'; end if;
  return v_id;
end $$;
