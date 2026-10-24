-- 0010: contractors — work agreements on a project, and the bills they raise.
-- Approving a bill books the construction cost against the project, what is owed to the contractor, and the retention held
-- back. Paying the contractor is an ordinary payment voucher (it clears the Contractors Payable account), so the cash book,
-- bank reconciliation and the contractor's statement all see it.

create table construction_contracts (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  contract_no    text not null,
  contractor_id  uuid not null references parties(id),
  project_id     uuid not null references projects(id),
  title          text not null check (btrim(title) <> ''),
  scope          text,
  contract_value numeric(18,2) not null check (contract_value > 0),
  retention_pct  numeric(5,2) not null default 5 check (retention_pct between 0 and 30),
  start_date     date not null,
  end_date       date,
  status         text not null default 'active' check (status in ('active','completed','terminated')),
  closed_on      date,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        int not null default 1,
  unique (company_id, contract_no),
  check (end_date is null or end_date >= start_date),
  check (status = 'active' or closed_on is not null)
);
create trigger construction_contracts_touch before update on construction_contracts for each row execute function app.touch_updated_at();
select app.enable_tenant_rls('construction_contracts');
select app.add_tenant_fk('construction_contracts', 'contractor_id', 'parties');
select app.add_tenant_fk('construction_contracts', 'project_id', 'projects');
select app.attach_audit('construction_contracts');

create table contractor_bills (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  bill_no          text not null,
  contract_id      uuid not null references construction_contracts(id),
  bill_date        date not null,
  description      text,
  gross_amount     numeric(18,2) not null check (gross_amount > 0),
  retention_amount numeric(18,2) not null default 0 check (retention_amount >= 0),
  net_amount       numeric(18,2) generated always as (gross_amount - retention_amount) stored,
  status           text not null default 'draft' check (status in ('draft','approved','void')),
  journal_entry_id uuid references journal_entries(id),
  approved_by      uuid references users(id),
  approved_at      timestamptz,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  unique (company_id, bill_no),
  check (retention_amount <= gross_amount)
);
select app.enable_tenant_rls('contractor_bills');
select app.add_tenant_fk('contractor_bills', 'contract_id', 'construction_contracts');
select app.add_tenant_fk('contractor_bills', 'journal_entry_id', 'journal_entries');
select app.attach_audit('contractor_bills');

-- a new bill takes the contract's retention rate unless the person types another amount
create or replace function app.create_contractor_bill(p_contract uuid, p_date date, p_gross numeric, p_description text, p_retention numeric, p_by uuid) returns uuid
language plpgsql as $$
declare c construction_contracts; v_id uuid := gen_random_uuid(); v_ret numeric;
begin
  select * into c from construction_contracts where id = p_contract for update;
  if not found then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  if c.status <> 'active' then raise exception 'This contract is %; no new bills can be added', c.status using errcode = '55000'; end if;
  if p_gross is null or p_gross <= 0 then raise exception 'The bill amount must be more than zero' using errcode = '23514'; end if;
  v_ret := coalesce(p_retention, round(p_gross * c.retention_pct / 100, 2));
  insert into contractor_bills (id, company_id, bill_no, contract_id, bill_date, description, gross_amount, retention_amount, created_by)
  values (v_id, c.company_id, app.next_doc_no(c.company_id, 'CBILL'), p_contract, p_date, nullif(btrim(coalesce(p_description, '')), ''), p_gross, v_ret, p_by);
  return v_id;
end $$;

create or replace function app.approve_contractor_bill(p_bill uuid, p_by uuid) returns uuid
language plpgsql as $$
declare b contractor_bills; c construction_contracts; v_billed numeric; v_cost uuid; v_pay uuid; v_ret uuid; v_entry uuid := gen_random_uuid(); n int := 2;
begin
  select * into b from contractor_bills where id = p_bill for update;
  if not found then raise exception 'Bill not found' using errcode = 'P0002'; end if;
  if b.status <> 'draft' then raise exception 'This bill is already %', b.status using errcode = '55000'; end if;
  select * into c from construction_contracts where id = b.contract_id for update;
  select coalesce(sum(gross_amount), 0) into v_billed from contractor_bills where contract_id = b.contract_id and status = 'approved';
  if v_billed + b.gross_amount > c.contract_value then
    raise exception 'Approving this bill would take the total billed to % — more than the contract value of %', v_billed + b.gross_amount, c.contract_value using errcode = '23514';
  end if;
  perform app.seed_extra_accounts(b.company_id);
  select id into v_cost from gl_accounts where company_id = b.company_id and code = '05.01.01.0002';
  select id into v_pay  from gl_accounts where company_id = b.company_id and code = '02.01.01.0006';
  select id into v_ret  from gl_accounts where company_id = b.company_id and code = '02.01.01.0005';
  if v_cost is null or v_pay is null or v_ret is null then raise exception 'The contractor accounts are missing from the chart of accounts' using errcode = '23514'; end if;

  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, b.company_id, b.bill_no, b.bill_date, app.ensure_period(b.company_id, b.bill_date), 'bill', b.id, 'Contractor bill ' || b.bill_no || ' — ' || c.title, p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, project_id, debit, credit, memo) values (b.company_id, v_entry, 1, v_cost, c.project_id, b.gross_amount, 0, c.title);
  insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo) values (b.company_id, v_entry, n, v_pay, c.contractor_id, 0, b.net_amount, b.bill_no);
  if b.retention_amount > 0 then
    n := n + 1;
    insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo) values (b.company_id, v_entry, n, v_ret, c.contractor_id, 0, b.retention_amount, 'Retention ' || b.bill_no);
  end if;
  update contractor_bills set status = 'approved', journal_entry_id = v_entry, approved_by = p_by, approved_at = now() where id = p_bill;
  return v_entry;
end $$;

create or replace function app.void_contractor_bill(p_bill uuid, p_by uuid, p_reason text, p_date date default current_date) returns void
language plpgsql as $$
declare b contractor_bills;
begin
  select * into b from contractor_bills where id = p_bill for update;
  if not found then raise exception 'Bill not found' using errcode = 'P0002'; end if;
  if b.status = 'void' then raise exception 'This bill is already void' using errcode = '55000'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required to void a bill' using errcode = '23514'; end if;
  if b.journal_entry_id is not null then perform app.reverse_entry(b.journal_entry_id, p_date, 'Bill ' || b.bill_no || ' voided: ' || p_reason, p_by); end if;
  update contractor_bills set status = 'void' where id = p_bill;
end $$;

-- one row per contract with what has been billed, held back and paid (paid = billed net - still owed)
create or replace view v_construction_contracts as
select c.*, p.display_name as contractor_name, pr.name as project_name,
       coalesce(b.billed, 0) as billed, coalesce(b.retention, 0) as retention_held, coalesce(b.net, 0) as billed_net,
       c.contract_value - coalesce(b.billed, 0) as remaining
  from construction_contracts c
  join parties p on p.id = c.contractor_id
  join projects pr on pr.id = c.project_id
  left join lateral (select sum(gross_amount) as billed, sum(retention_amount) as retention, sum(net_amount) as net
                       from contractor_bills where contract_id = c.id and status = 'approved') b on true;

select app.secure_views();
