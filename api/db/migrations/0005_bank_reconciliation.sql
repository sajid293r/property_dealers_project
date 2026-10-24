-- 0005: bank reconciliation.
--
-- The method (the one every accounting package uses): the bank statement's closing balance must equal the balance of
-- the ledger entries that have CLEARED the bank. Entries the bank has not yet seen stay outstanding:
--   deposits in transit   money booked as received, not yet on the statement
--   outstanding cheques   payments booked, not yet presented
-- and money the bank moved that the books do not know about (charges, profit) is booked first, with a voucher.
--
--   statement balance  = cleared ledger balance          -> difference 0 -> the reconciliation can be finished
--   report:  statement balance + deposits in transit - outstanding cheques = adjusted bank balance = book balance

-- ---------------------------------------------------------------- statements and their lines
create table bank_statements (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  bank_account_id uuid not null,
  label           text,
  period_from     date not null,
  period_to       date not null,
  opening_balance numeric(18,2) not null default 0,
  closing_balance numeric(18,2) not null,
  source          text not null default 'manual' check (source in ('manual','csv','pdf','api')),
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  check (period_to >= period_from)
);
create table bank_statement_lines (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  statement_id uuid not null,
  line_no     int not null,
  txn_date    date not null,
  description text,
  reference   text,                                    -- cheque number, transfer reference
  deposit     numeric(18,2) not null default 0 check (deposit >= 0),      -- money in
  withdrawal  numeric(18,2) not null default 0 check (withdrawal >= 0),   -- money out
  balance     numeric(18,2),                           -- the running balance the bank printed, if given
  unique (statement_id, line_no),
  check ((deposit > 0) <> (withdrawal > 0))
);

-- ---------------------------------------------------------------- reconciliations and the clearing marks
create table bank_reconciliations (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id),
  bank_account_id   uuid not null,
  statement_id      uuid,
  as_of             date not null,
  statement_balance numeric(18,2) not null,
  status            text not null default 'draft' check (status in ('draft','finalized')),
  difference        numeric(18,2),                      -- recorded when finished (always 0)
  finalized_by      uuid references users(id),
  finalized_at      timestamptz,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now()
);
create unique index bank_recon_one_draft on bank_reconciliations (bank_account_id) where status = 'draft';

-- One row per ledger entry that has cleared the bank. Matched to a statement line, or cleared by hand.
create table bank_clearings (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id),
  bank_account_id   uuid not null,
  journal_line_id   uuid not null unique,
  cleared_on        date not null,
  statement_line_id uuid,
  reconciliation_id uuid,                               -- set when a reconciliation is finished: then it is locked
  created_by        uuid references users(id),
  created_at        timestamptz not null default now()
);

-- a voucher drafted from a statement line remembers it, so approving it matches the line automatically
alter table vouchers add column statement_line_id uuid;

do $$
declare t text;
begin
  foreach t in array array['bank_statements','bank_statement_lines','bank_reconciliations','bank_clearings'] loop
    perform app.enable_tenant_rls(t);
    perform app.attach_audit(t);
  end loop;
end $$;
select app.add_tenant_fk('bank_statements', 'bank_account_id', 'bank_accounts');
select app.add_tenant_fk('bank_statement_lines', 'statement_id', 'bank_statements');
select app.add_tenant_fk('bank_reconciliations', 'bank_account_id', 'bank_accounts');
select app.add_tenant_fk('bank_reconciliations', 'statement_id', 'bank_statements');
select app.add_tenant_fk('bank_clearings', 'bank_account_id', 'bank_accounts');
select app.add_tenant_fk('bank_clearings', 'journal_line_id', 'journal_lines');
select app.add_tenant_fk('bank_clearings', 'statement_line_id', 'bank_statement_lines');
select app.add_tenant_fk('bank_clearings', 'reconciliation_id', 'bank_reconciliations');
select app.add_tenant_fk('vouchers', 'statement_line_id', 'bank_statement_lines');

-- ---------------------------------------------------------------- guards
-- A clearing must be for an entry on THIS bank account's ledger account, and cannot predate the entry.
create or replace function app.guard_clearing() returns trigger language plpgsql as $$
declare v_gl uuid; v_acc uuid; v_date date;
begin
  if tg_op = 'INSERT' then
    select gl_account_id into v_gl from bank_accounts where id = new.bank_account_id;
    select l.account_id, e.entry_date into v_acc, v_date from journal_lines l join journal_entries e on e.id = l.entry_id where l.id = new.journal_line_id;
    if v_acc is distinct from v_gl then raise exception 'That ledger entry is not on this bank account' using errcode = '23514'; end if;
    if new.cleared_on < v_date then raise exception 'An entry cannot clear the bank before its own date (%)', v_date using errcode = '23514'; end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.reconciliation_id is not null then raise exception 'This entry belongs to a finished reconciliation and cannot be un-cleared' using errcode = '55000'; end if;
    return old;
  else  -- UPDATE
    if old.reconciliation_id is not null and coalesce(current_setting('app.reopening', true), '') <> 'on' then
      raise exception 'This entry belongs to a finished reconciliation and cannot be changed' using errcode = '55000';
    end if;
    return new;
  end if;
end $$;
create trigger bank_clearings_guard before insert or update or delete on bank_clearings for each row execute function app.guard_clearing();

-- A statement line that has been matched cannot be edited or deleted until it is un-matched.
create or replace function app.guard_statement_line() returns trigger language plpgsql as $$
begin
  if exists (select 1 from bank_clearings where statement_line_id = old.id) then
    raise exception 'This statement line is matched; un-match it first' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
create trigger bank_statement_lines_guard before update or delete on bank_statement_lines for each row execute function app.guard_statement_line();

-- ---------------------------------------------------------------- the bank's ledger, entry by entry
create or replace view v_bank_ledger as
select ba.id as bank_account_id, ba.company_id, l.id as journal_line_id, e.id as entry_id, e.entry_date, e.entry_no,
       coalesce(nullif(l.memo, ''), e.description) as description, e.description as entry_description,
       l.party_id, p.display_name as party_name, l.debit, l.credit, (l.debit - l.credit) as amount,
       (e.status = 'reversed') as was_reversed, (e.reversal_of is not null) as is_reversal,
       c.cleared_on, c.statement_line_id, c.reconciliation_id, (c.id is not null) as cleared
  from bank_accounts ba
  join journal_lines l on l.account_id = ba.gl_account_id and l.company_id = ba.company_id
  join journal_entries e on e.id = l.entry_id
  left join bank_clearings c on c.journal_line_id = l.id
  left join parties p on p.id = l.party_id;

-- statement lines with how much of each is matched
create or replace view v_bank_statement_lines as
select sl.*, s.bank_account_id, (sl.deposit - sl.withdrawal) as amount,
       coalesce(m.matched, 0) as matched_amount,
       case when coalesce(m.n, 0) = 0 then 'unmatched' when abs(coalesce(m.matched, 0)) = (sl.deposit + sl.withdrawal) then 'matched' else 'partial' end as match_status
  from bank_statement_lines sl
  join bank_statements s on s.id = sl.statement_id
  left join lateral (
    select count(*) as n, sum(vl.debit - vl.credit) as matched
      from bank_clearings c join journal_lines vl on vl.id = c.journal_line_id where c.statement_line_id = sl.id) m on true;

-- ---------------------------------------------------------------- clearing and matching
create or replace function app.bank_account_of_line(p_line uuid) returns uuid language sql stable as $$
  select ba.id from journal_lines l join bank_accounts ba on ba.gl_account_id = l.account_id and ba.company_id = l.company_id where l.id = p_line
$$;

-- Mark a ledger entry as cleared (seen by the bank), without a statement line.
create or replace function app.clear_ledger_line(p_line uuid, p_cleared_on date, p_by uuid) returns uuid
language plpgsql as $$
declare v_ba uuid; v_id uuid; v_company uuid;
begin
  v_ba := app.bank_account_of_line(p_line);
  if v_ba is null then raise exception 'That ledger entry is not on a bank account' using errcode = '23514'; end if;
  select company_id into v_company from journal_lines where id = p_line;
  if exists (select 1 from bank_clearings where journal_line_id = p_line) then raise exception 'That entry has already cleared the bank' using errcode = '55000'; end if;
  insert into bank_clearings (company_id, bank_account_id, journal_line_id, cleared_on, created_by)
  values (v_company, v_ba, p_line, p_cleared_on, p_by) returning id into v_id;
  return v_id;
end $$;

create or replace function app.unclear_ledger_line(p_line uuid) returns void language plpgsql as $$
begin
  delete from bank_clearings where journal_line_id = p_line;
  if not found then raise exception 'That entry has not cleared the bank' using errcode = 'P0002'; end if;
end $$;

-- Match a statement line to one or more ledger entries. The amounts must agree to the paisa.
create or replace function app.match_statement_line(p_stmt_line uuid, p_journal_lines uuid[], p_by uuid) returns int
language plpgsql as $$
declare sl bank_statement_lines; s bank_statements; v_ledger numeric; v_stmt numeric; jl uuid; n int := 0;
begin
  select * into sl from bank_statement_lines where id = p_stmt_line;
  if not found then raise exception 'Statement line not found' using errcode = 'P0002'; end if;
  select * into s from bank_statements where id = sl.statement_id;
  if exists (select 1 from bank_clearings where statement_line_id = p_stmt_line) then raise exception 'That statement line is already matched' using errcode = '55000'; end if;
  if p_journal_lines is null or cardinality(p_journal_lines) = 0 then raise exception 'Choose the ledger entries it matches' using errcode = '23514'; end if;

  select coalesce(sum(debit - credit), 0) into v_ledger from journal_lines where id = any (p_journal_lines);
  v_stmt := sl.deposit - sl.withdrawal;
  if v_ledger <> v_stmt then
    raise exception 'The amounts do not agree: the ledger entries total % but the statement line is %', v_ledger, v_stmt using errcode = '23514';
  end if;
  foreach jl in array p_journal_lines loop
    if app.bank_account_of_line(jl) is distinct from s.bank_account_id then raise exception 'A chosen entry is not on this statement''s bank account' using errcode = '23514'; end if;
    insert into bank_clearings (company_id, bank_account_id, journal_line_id, cleared_on, statement_line_id, created_by)
    values (sl.company_id, s.bank_account_id, jl, sl.txn_date, p_stmt_line, p_by);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function app.unmatch_statement_line(p_stmt_line uuid) returns int language plpgsql as $$
declare n int;
begin
  delete from bank_clearings where statement_line_id = p_stmt_line;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'That statement line is not matched' using errcode = 'P0002'; end if;
  return n;
end $$;

-- Suggest matches for the unmatched lines of a statement: the same amount, a date within reach, and a bonus when the
-- cheque / reference agrees. One suggestion per statement line and per ledger entry, best score first.
create or replace function app.suggest_matches(p_statement uuid)
returns table (statement_line_id uuid, journal_line_id uuid, score int, reason text)
language sql stable as $$
  with cand as (
    select sl.id as sl_id, bl.journal_line_id as jl_id,
           50
           + case when sl.reference is not null and bl.description ilike '%' || sl.reference || '%' then 40 else 0 end
           + case when abs(sl.txn_date - bl.entry_date) <= 3 then 10 when abs(sl.txn_date - bl.entry_date) <= 10 then 5 else 0 end as sc,
           case when sl.reference is not null and bl.description ilike '%' || sl.reference || '%' then 'same amount and reference'
                when abs(sl.txn_date - bl.entry_date) <= 3 then 'same amount, within 3 days' else 'same amount' end as why
      from v_bank_statement_lines sl
      join bank_statements s on s.id = sl.statement_id
      join v_bank_ledger bl on bl.bank_account_id = s.bank_account_id and not bl.cleared
                           and bl.amount = (sl.deposit - sl.withdrawal)
                           and bl.entry_date <= sl.txn_date + 3 and bl.entry_date >= sl.txn_date - 60
     where sl.statement_id = p_statement and sl.match_status = 'unmatched'),
  ranked as (
    select c.*, row_number() over (partition by c.sl_id order by c.sc desc, c.jl_id) as r_line,
                row_number() over (partition by c.jl_id order by c.sc desc, c.sl_id) as r_entry
      from cand c)
  select sl_id, jl_id, sc, why from ranked where r_line = 1 and r_entry = 1 order by sc desc, sl_id
$$;

-- Reversed entries and their reversals cancel out; clear such pairs automatically so they never clutter the list.
create or replace function app.auto_clear_reversed_pairs(p_bank_account uuid, p_by uuid) returns int
language plpgsql as $$
declare r record; n int := 0;
begin
  for r in
    select o.journal_line_id as orig, rv.journal_line_id as rev, rv.entry_date as rev_date
      from v_bank_ledger o
      join journal_entries re on re.reversal_of = o.entry_id
      join v_bank_ledger rv on rv.entry_id = re.id and rv.bank_account_id = o.bank_account_id and rv.amount = -o.amount
     where o.bank_account_id = p_bank_account and not o.cleared and not rv.cleared
  loop
    perform app.clear_ledger_line(r.orig, r.rev_date, p_by);
    perform app.clear_ledger_line(r.rev, r.rev_date, p_by);
    n := n + 2;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- the reconciliation statement
-- statement balance + deposits in transit - outstanding cheques = adjusted bank balance, compared with the books.
create or replace function app.reconciliation_report(p_bank_account uuid, p_as_of date, p_statement_balance numeric)
returns table (statement_balance numeric, deposits_in_transit numeric, outstanding_payments numeric, adjusted_bank_balance numeric,
               book_balance numeric, cleared_balance numeric, difference numeric)
language sql stable as $$
  with l as (
    select amount, entry_date, cleared, cleared_on from v_bank_ledger where bank_account_id = p_bank_account and entry_date <= p_as_of),
  agg as (
    select coalesce(sum(amount), 0) as book,
           coalesce(sum(amount) filter (where cleared and cleared_on <= p_as_of), 0) as cleared_net,
           coalesce(sum(amount) filter (where not (cleared and cleared_on <= p_as_of) and amount > 0), 0) as dit,
           coalesce(-sum(amount) filter (where not (cleared and cleared_on <= p_as_of) and amount < 0), 0) as osp
      from l)
  select p_statement_balance, agg.dit, agg.osp, p_statement_balance + agg.dit - agg.osp, agg.book, agg.cleared_net,
         p_statement_balance - agg.cleared_net
    from agg
$$;

-- one open reconciliation per bank account at a time
create or replace function app.start_reconciliation(p_bank_account uuid, p_statement uuid, p_as_of date, p_statement_balance numeric, p_by uuid) returns uuid
language plpgsql as $$
declare v_company uuid; v_id uuid; s bank_statements; v_net numeric;
begin
  select company_id into v_company from bank_accounts where id = p_bank_account;
  if v_company is null then raise exception 'Bank account not found' using errcode = 'P0002'; end if;
  if p_statement is not null then
    select * into s from bank_statements where id = p_statement;
    if s.bank_account_id is distinct from p_bank_account then raise exception 'That statement belongs to a different bank account' using errcode = '23514'; end if;
    select s.opening_balance + coalesce(sum(deposit - withdrawal), 0) into v_net from bank_statement_lines where statement_id = p_statement;
    if v_net <> s.closing_balance then
      raise exception 'The statement''s lines do not add up to its closing balance (lines give %, statement says %)', v_net, s.closing_balance using errcode = '23514';
    end if;
  end if;
  perform app.auto_clear_reversed_pairs(p_bank_account, p_by);
  insert into bank_reconciliations (company_id, bank_account_id, statement_id, as_of, statement_balance, created_by)
  values (v_company, p_bank_account, p_statement, p_as_of, p_statement_balance, p_by) returning id into v_id;
  return v_id;
end $$;

-- Finish: only when the statement balance equals the cleared ledger balance. Locks the cleared entries.
create or replace function app.finalize_reconciliation(p_recon uuid, p_by uuid) returns void language plpgsql as $$
declare r bank_reconciliations; rep record;
begin
  select * into r from bank_reconciliations where id = p_recon for update;
  if not found then raise exception 'Reconciliation not found' using errcode = 'P0002'; end if;
  if r.status <> 'draft' then raise exception 'This reconciliation is already finished' using errcode = '55000'; end if;
  select * into rep from app.reconciliation_report(r.bank_account_id, r.as_of, r.statement_balance);
  if rep.difference <> 0 then
    raise exception 'The reconciliation does not balance: the statement says % but the cleared entries total % (difference %)',
      r.statement_balance, rep.cleared_balance, rep.difference using errcode = '23514';
  end if;
  update bank_clearings set reconciliation_id = r.id
   where bank_account_id = r.bank_account_id and reconciliation_id is null and cleared_on <= r.as_of;
  update bank_reconciliations set status = 'finalized', difference = 0, finalized_by = p_by, finalized_at = now() where id = r.id;
end $$;

-- Re-open the MOST RECENT finished reconciliation of an account (to correct a mistake).
create or replace function app.reopen_reconciliation(p_recon uuid, p_by uuid) returns void language plpgsql as $$
declare r bank_reconciliations; v_latest uuid;
begin
  select * into r from bank_reconciliations where id = p_recon for update;
  if not found then raise exception 'Reconciliation not found' using errcode = 'P0002'; end if;
  if r.status <> 'finalized' then raise exception 'Only a finished reconciliation can be re-opened' using errcode = '55000'; end if;
  select id into v_latest from bank_reconciliations where bank_account_id = r.bank_account_id and status = 'finalized' order by as_of desc, finalized_at desc limit 1;
  if v_latest <> r.id then raise exception 'Only the most recent reconciliation of this account can be re-opened' using errcode = '55000'; end if;
  if exists (select 1 from bank_reconciliations where bank_account_id = r.bank_account_id and status = 'draft') then
    raise exception 'Finish or delete the open reconciliation of this account first' using errcode = '55000';
  end if;
  perform set_config('app.reopening', 'on', true);
  update bank_clearings set reconciliation_id = null where reconciliation_id = r.id;
  perform set_config('app.reopening', 'off', true);
  update bank_reconciliations set status = 'draft', difference = null, finalized_by = null, finalized_at = null where id = r.id;
end $$;

-- ---------------------------------------------------------------- a bank charge the books do not know about
-- Draft the voucher for an unmatched statement line (a payment for a withdrawal, a receipt for a deposit). Approving it
-- matches the statement line automatically.
create or replace function app.draft_voucher_from_statement_line(p_stmt_line uuid, p_account uuid, p_by uuid) returns uuid
language plpgsql as $$
declare sl bank_statement_lines; s bank_statements; ba bank_accounts; v_type text; v_id uuid := gen_random_uuid();
begin
  select * into sl from bank_statement_lines where id = p_stmt_line;
  if not found then raise exception 'Statement line not found' using errcode = 'P0002'; end if;
  if exists (select 1 from bank_clearings where statement_line_id = p_stmt_line) then raise exception 'That statement line is already matched' using errcode = '55000'; end if;
  if exists (select 1 from vouchers where statement_line_id = p_stmt_line and status in ('draft','pending','approved')) then
    raise exception 'A voucher has already been drafted for this statement line' using errcode = '55000';
  end if;
  select * into s from bank_statements where id = sl.statement_id;
  select * into ba from bank_accounts where id = s.bank_account_id;
  v_type := case when sl.withdrawal > 0 then 'BPV' else 'BRV' end;

  insert into vouchers (id, company_id, voucher_type, number, voucher_date, description, status, control_account_id, bank_account_id,
                        instrument_type, reference, statement_line_id, created_by)
  values (v_id, sl.company_id, v_type, app.next_doc_no(sl.company_id, v_type), sl.txn_date,
          coalesce(nullif(btrim(sl.description), ''), 'Bank statement line'), 'draft', ba.gl_account_id, ba.id,
          'online_transfer', sl.reference, p_stmt_line, p_by);
  insert into voucher_lines (company_id, voucher_id, line_no, account_id, debit, credit, remarks)
  values (sl.company_id, v_id, 1, p_account, sl.withdrawal, sl.deposit, sl.description);
  return v_id;
end $$;

-- When such a voucher is approved its bank entry matches the statement line it came from.
create or replace function app.auto_match_after_approval() returns trigger language plpgsql as $$
declare v_jl uuid;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.statement_line_id is not null then
    select id into v_jl from journal_lines where entry_id = new.journal_entry_id and account_id = new.control_account_id limit 1;
    if v_jl is not null and not exists (select 1 from bank_clearings where statement_line_id = new.statement_line_id) then
      perform app.match_statement_line(new.statement_line_id, array[v_jl], new.approved_by);
    end if;
  end if;
  return null;
end $$;
create trigger vouchers_auto_match after update of status on vouchers for each row execute function app.auto_match_after_approval();

select app.secure_views();
