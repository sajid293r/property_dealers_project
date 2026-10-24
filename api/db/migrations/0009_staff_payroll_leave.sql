-- 0009: staff, leave and payroll.
-- Payroll posts to the ledger in two steps: APPROVING a month books the salary expense and what is owed (to staff and to
-- the tax authority); PAYING it moves the money out of cash or a bank account. Both steps are reversible only by new entries.

create table employees (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id),
  emp_no             text not null,
  full_name          text not null check (btrim(full_name) <> ''),
  phone              text,
  email              text,
  cnic_last4         text check (cnic_last4 ~ '^[0-9]{4}$'),
  designation        text,
  department         text,
  join_date          date not null,
  status             text not null default 'active' check (status in ('active','resigned','terminated')),
  left_on            date,
  basic_salary       numeric(18,2) not null default 0 check (basic_salary >= 0),
  house_allowance    numeric(18,2) not null default 0 check (house_allowance >= 0),
  transport_allowance numeric(18,2) not null default 0 check (transport_allowance >= 0),
  other_allowance    numeric(18,2) not null default 0 check (other_allowance >= 0),
  income_tax         numeric(18,2) not null default 0 check (income_tax >= 0),   -- fixed monthly deduction; the accountant sets it
  bank_account_no    text,
  user_id            uuid references users(id),
  notes              text,
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            int not null default 1,
  unique (company_id, emp_no),
  check (status = 'active' or left_on is not null),
  check (left_on is null or left_on >= join_date)
);
create trigger employees_touch before update on employees for each row execute function app.touch_updated_at();
select app.enable_tenant_rls('employees');
select app.attach_audit('employees');

-- ---------------------------------------------------------------- leave
create table leave_types (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  code        text not null,
  name        text not null,
  annual_days numeric(5,1) not null default 0 check (annual_days >= 0),
  paid        boolean not null default true,
  active      boolean not null default true,
  unique (company_id, code)
);
select app.enable_tenant_rls('leave_types');

create or replace function app.seed_leave_types(p_company uuid) returns void language plpgsql as $$
begin
  insert into leave_types (company_id, code, name, annual_days, paid) values
    (p_company, 'annual', 'Annual leave', 14, true), (p_company, 'casual', 'Casual leave', 10, true),
    (p_company, 'sick', 'Sick leave', 8, true), (p_company, 'unpaid', 'Unpaid leave', 0, false)
  on conflict (company_id, code) do nothing;
end $$;
select app.seed_leave_types(id) from companies;

create table leave_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  employee_id   uuid not null references employees(id),
  leave_type_id uuid not null references leave_types(id),
  from_date     date not null,
  to_date       date not null,
  days          numeric(5,1) not null check (days > 0),
  reason        text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by    uuid references users(id),
  decided_at    timestamptz,
  decision_note text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  check (to_date >= from_date),
  check (days <= (to_date - from_date) + 1)
);
create index leave_requests_emp_idx on leave_requests (employee_id, from_date);
select app.enable_tenant_rls('leave_requests');
select app.add_tenant_fk('leave_requests', 'employee_id', 'employees');
select app.add_tenant_fk('leave_requests', 'leave_type_id', 'leave_types');
select app.attach_audit('leave_requests');

create or replace function app.request_leave(p_employee uuid, p_type uuid, p_from date, p_to date, p_days numeric, p_reason text, p_by uuid) returns uuid
language plpgsql as $$
declare e employees; v_id uuid := gen_random_uuid(); v_days numeric;
begin
  select * into e from employees where id = p_employee;
  if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  if e.status <> 'active' then raise exception '% is no longer an active employee', e.full_name using errcode = '55000'; end if;
  if not exists (select 1 from leave_types where id = p_type and company_id = e.company_id and active) then raise exception 'Choose a leave type' using errcode = '23514'; end if;
  if p_to < p_from then raise exception 'The last day cannot be before the first day' using errcode = '23514'; end if;
  v_days := coalesce(p_days, (p_to - p_from) + 1);
  if exists (select 1 from leave_requests where employee_id = p_employee and status in ('pending','approved') and from_date <= p_to and to_date >= p_from) then
    raise exception '% already has leave on some of these days', e.full_name using errcode = '23P01';
  end if;
  insert into leave_requests (id, company_id, employee_id, leave_type_id, from_date, to_date, days, reason, created_by)
  values (v_id, e.company_id, p_employee, p_type, p_from, p_to, v_days, nullif(btrim(coalesce(p_reason, '')), ''), p_by);
  return v_id;
end $$;

-- days already taken or waiting, per employee, leave type and calendar year (by the day the leave starts)
create or replace view v_leave_balances as
select e.company_id, e.id as employee_id, e.full_name, t.id as leave_type_id, t.code, t.name as leave_type, t.paid,
       y.yr as year, t.annual_days as entitled,
       coalesce(sum(r.days) filter (where r.status = 'approved'), 0) as taken,
       coalesce(sum(r.days) filter (where r.status = 'pending'), 0) as pending,
       case when t.paid then t.annual_days - coalesce(sum(r.days) filter (where r.status = 'approved'), 0) else null end as remaining
  from employees e
  cross join leave_types t
  cross join (select extract(year from current_date)::int as yr) y
  left join leave_requests r on r.employee_id = e.id and r.leave_type_id = t.id and extract(year from r.from_date)::int = y.yr
 where e.company_id = t.company_id and e.status = 'active' and t.active
 group by e.company_id, e.id, e.full_name, t.id, t.code, t.name, t.paid, y.yr, t.annual_days;

create or replace function app.decide_leave(p_request uuid, p_approve boolean, p_note text, p_by uuid) returns void
language plpgsql as $$
declare r leave_requests; t leave_types; v_taken numeric;
begin
  select * into r from leave_requests where id = p_request for update;
  if not found then raise exception 'Leave request not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'This request is already %', r.status using errcode = '55000'; end if;
  if p_approve then
    select * into t from leave_types where id = r.leave_type_id;
    if t.paid then
      select coalesce(sum(days), 0) into v_taken from leave_requests
       where employee_id = r.employee_id and leave_type_id = r.leave_type_id and status = 'approved' and extract(year from from_date) = extract(year from r.from_date);
      if v_taken + r.days > t.annual_days then
        raise exception '% allows % days a year and % are already used; approving % more would go over', t.name, t.annual_days, v_taken, r.days using errcode = '23514';
      end if;
    end if;
  elsif nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Say why the leave is being refused' using errcode = '23514';
  end if;
  update leave_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = p_by, decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_request;
end $$;

-- ---------------------------------------------------------------- payroll
create table payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  run_no         text not null,
  month          text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status         text not null default 'draft' check (status in ('draft','approved','paid')),
  total_gross    numeric(18,2) not null default 0,
  total_tax      numeric(18,2) not null default 0,
  total_net      numeric(18,2) not null default 0,
  journal_entry_id uuid references journal_entries(id),
  paid_entry_id  uuid references journal_entries(id),
  paid_from      uuid references gl_accounts(id),
  paid_on        date,
  approved_by    uuid references users(id),
  approved_at    timestamptz,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  unique (company_id, run_no),
  unique (company_id, month)
);
select app.enable_tenant_rls('payroll_runs');
select app.add_tenant_fk('payroll_runs', 'paid_from', 'gl_accounts');
select app.add_tenant_fk('payroll_runs', 'journal_entry_id', 'journal_entries');
select app.add_tenant_fk('payroll_runs', 'paid_entry_id', 'journal_entries');
select app.attach_audit('payroll_runs');

create table payroll_lines (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id),
  run_id            uuid not null references payroll_runs(id),
  employee_id       uuid not null references employees(id),
  basic             numeric(18,2) not null default 0,
  allowances        numeric(18,2) not null default 0,
  bonus             numeric(18,2) not null default 0 check (bonus >= 0),
  unpaid_leave_days numeric(5,1) not null default 0,
  unpaid_deduction  numeric(18,2) not null default 0 check (unpaid_deduction >= 0),
  tax               numeric(18,2) not null default 0 check (tax >= 0),
  net               numeric(18,2) generated always as (basic + allowances + bonus - unpaid_deduction - tax) stored,
  unique (run_id, employee_id)
);
select app.enable_tenant_rls('payroll_lines');
select app.add_tenant_fk('payroll_lines', 'run_id', 'payroll_runs');
select app.add_tenant_fk('payroll_lines', 'employee_id', 'employees');

-- Start a month: one line per employee who worked in it. Unpaid leave is taken off pro rata (salary / 30 per day).
create or replace function app.create_payroll_run(p_company uuid, p_month text, p_by uuid) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v_from date; v_to date; e record; v_unpaid numeric; v_gross numeric;
begin
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Choose a month like 2026-10' using errcode = '23514'; end if;
  v_from := (p_month || '-01')::date; v_to := (v_from + interval '1 month - 1 day')::date;
  if exists (select 1 from payroll_runs where company_id = p_company and month = p_month) then raise exception 'Payroll for % already exists', p_month using errcode = '23505'; end if;
  if not exists (select 1 from employees where company_id = p_company and join_date <= v_to and (left_on is null or left_on >= v_from)) then
    raise exception 'There are no employees to pay for %', p_month using errcode = '23514';
  end if;
  insert into payroll_runs (id, company_id, run_no, month, created_by) values (v_id, p_company, app.next_doc_no(p_company, 'PAY'), p_month, p_by);
  for e in select * from employees where company_id = p_company and join_date <= v_to and (left_on is null or left_on >= v_from) loop
    select coalesce(sum(least(r.to_date, v_to) - greatest(r.from_date, v_from) + 1), 0) into v_unpaid
      from leave_requests r join leave_types t on t.id = r.leave_type_id
     where r.employee_id = e.id and r.status = 'approved' and not t.paid and r.from_date <= v_to and r.to_date >= v_from;
    v_gross := e.basic_salary + e.house_allowance + e.transport_allowance + e.other_allowance;
    insert into payroll_lines (company_id, run_id, employee_id, basic, allowances, unpaid_leave_days, unpaid_deduction, tax)
    values (p_company, v_id, e.id, e.basic_salary, e.house_allowance + e.transport_allowance + e.other_allowance, v_unpaid,
            round(v_gross / 30 * v_unpaid, 2), least(e.income_tax, v_gross));
  end loop;
  return v_id;
end $$;

create or replace function app.approve_payroll(p_run uuid, p_by uuid) returns uuid
language plpgsql as $$
declare r payroll_runs; v_gross numeric; v_tax numeric; v_net numeric; v_exp uuid; v_pay uuid; v_taxacc uuid; v_entry uuid := gen_random_uuid(); n int := 1;
begin
  select * into r from payroll_runs where id = p_run for update;
  if not found then raise exception 'Payroll run not found' using errcode = 'P0002'; end if;
  if r.status <> 'draft' then raise exception 'This payroll is already %', r.status using errcode = '55000'; end if;
  select coalesce(sum(basic + allowances + bonus - unpaid_deduction), 0), coalesce(sum(tax), 0), coalesce(sum(net), 0)
    into v_gross, v_tax, v_net from payroll_lines where run_id = p_run;
  if v_net < 0 then raise exception 'A deduction is larger than the pay for someone in this payroll' using errcode = '23514'; end if;
  if v_gross <= 0 then raise exception 'There is nothing to pay in this payroll' using errcode = '23514'; end if;
  if exists (select 1 from payroll_lines where run_id = p_run and net < 0) then raise exception 'Someone''s deductions are more than their pay' using errcode = '23514'; end if;
  perform app.seed_extra_accounts(r.company_id);
  select id into v_exp from gl_accounts where company_id = r.company_id and code = '05.02.04.0001';
  select id into v_pay from gl_accounts where company_id = r.company_id and code = '02.01.01.0004';
  select id into v_taxacc from gl_accounts where company_id = r.company_id and code = '02.01.03.0003';
  if v_exp is null or v_pay is null or v_taxacc is null then raise exception 'The payroll accounts are missing from the chart of accounts' using errcode = '23514'; end if;

  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, r.company_id, r.run_no, (r.month || '-01')::date + interval '1 month - 1 day', app.ensure_period(r.company_id, ((r.month || '-01')::date + interval '1 month - 1 day')::date),
          'payroll', r.id, 'Payroll for ' || r.month, p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, debit, credit, memo) values (r.company_id, v_entry, 1, v_exp, v_gross, 0, 'Salaries ' || r.month);
  if v_tax > 0 then n := n + 1; insert into journal_lines (company_id, entry_id, line_no, account_id, debit, credit, memo) values (r.company_id, v_entry, n, v_taxacc, 0, v_tax, 'Income tax withheld ' || r.month); end if;
  n := n + 1; insert into journal_lines (company_id, entry_id, line_no, account_id, debit, credit, memo) values (r.company_id, v_entry, n, v_pay, 0, v_net, 'Net salaries ' || r.month);
  update payroll_runs set status = 'approved', total_gross = v_gross, total_tax = v_tax, total_net = v_net, journal_entry_id = v_entry, approved_by = p_by, approved_at = now() where id = p_run;
  return v_entry;
end $$;

create or replace function app.pay_payroll(p_run uuid, p_from uuid, p_date date, p_by uuid) returns uuid
language plpgsql as $$
declare r payroll_runs; acct gl_accounts; v_pay uuid; v_entry uuid := gen_random_uuid();
begin
  select * into r from payroll_runs where id = p_run for update;
  if not found then raise exception 'Payroll run not found' using errcode = 'P0002'; end if;
  if r.status <> 'approved' then raise exception 'Only an approved payroll can be paid (this one is %)', r.status using errcode = '55000'; end if;
  select * into acct from gl_accounts where id = p_from and company_id = r.company_id;
  if not found or acct.is_group or acct.category not in ('asset_cash','asset_bank') then raise exception 'Choose the cash or bank account the salaries are paid from' using errcode = '23514'; end if;
  select id into v_pay from gl_accounts where company_id = r.company_id and code = '02.01.01.0004';
  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, r.company_id, app.next_doc_no(r.company_id, 'PAYP'), coalesce(p_date, current_date), app.ensure_period(r.company_id, coalesce(p_date, current_date)), 'system', r.id, 'Salaries paid for ' || r.month, p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, debit, credit, memo) values
    (r.company_id, v_entry, 1, v_pay, r.total_net, 0, 'Salaries ' || r.month), (r.company_id, v_entry, 2, p_from, 0, r.total_net, 'Salaries ' || r.month);
  update payroll_runs set status = 'paid', paid_entry_id = v_entry, paid_from = p_from, paid_on = coalesce(p_date, current_date) where id = p_run;
  return v_entry;
end $$;

-- a payroll that is still a draft can be thrown away; once approved it is part of the books
create or replace function app.discard_payroll(p_run uuid) returns void language plpgsql as $$
declare r payroll_runs;
begin
  select * into r from payroll_runs where id = p_run for update;
  if not found then raise exception 'Payroll run not found' using errcode = 'P0002'; end if;
  if r.status <> 'draft' then raise exception 'An approved payroll is part of the books and cannot be deleted' using errcode = '55000'; end if;
  delete from payroll_lines where run_id = p_run;
  delete from payroll_runs where id = p_run;
end $$;

select app.secure_views();
