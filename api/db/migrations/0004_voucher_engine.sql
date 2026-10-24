-- 0004: the voucher engine. Ten voucher types, validation, approval that posts to the ledger, locking, voiding.
--
-- Every voucher except a Journal has the same shape: ONE control account (cash, bank, a customer's receivable, a
-- supplier's payable) on one side, and detail lines on the other. The people filling it in never type the control
-- side twice; the database derives it from the lines when the voucher is approved.
--
--   type  name                         control account (side)            detail lines
--   CPV   Cash Payment                 cash account            (credit)  debit: expenses, payables, advances
--   CRV   Cash Receipt                 cash account            (debit)   credit: customers, income, other
--   BPV   Bank Payment                 bank account            (credit)  debit: what was paid for
--   BRV   Bank Receipt                 bank account            (debit)   credit: who paid / what for
--   CV    Contra (cash <-> bank)       from-account            (credit)  debit: to-account(s)
--   SV    Sales Voucher                customer receivable     (debit)   credit: income, sales tax
--   CN    Credit Note (sales return)   customer receivable     (credit)  debit: sales returns, tax reversed
--   PIV   Purchase Invoice Voucher     supplier payable        (credit)  debit: expense, asset, input tax
--   DN    Debit Note (purchase return) supplier payable        (debit)   credit: purchase returns
--   JV    Journal                      none: free debit and credit sections that must balance

alter table vouchers drop constraint vouchers_voucher_type_check;
alter table vouchers add constraint vouchers_voucher_type_check
  check (voucher_type in ('CPV','CRV','BPV','BRV','JV','CV','SV','PIV','CN','DN'));

alter table vouchers
  add column control_account_id uuid,                       -- cash / bank / receivable / payable (see the table above)
  add column bank_account_id    uuid,                       -- the company's bank account, for BPV / BRV
  add column instrument_type    text check (instrument_type in ('cheque','online_transfer','pay_order','demand_draft','cash_deposit','other')),
  add column instrument_no      text,                       -- cheque / pay order / draft number
  add column instrument_bank    text,                       -- the bank the cheque is drawn on / was received from
  add column reference          text,                       -- transfer reference, deposit slip no.
  add column invoice_no         text,                       -- the supplier's own invoice number (PIV)
  add column due_date           date;                       -- when a sales / purchase invoice is due
alter table voucher_lines add column party_id uuid;

select app.add_tenant_fk('vouchers', 'control_account_id', 'gl_accounts');
select app.add_tenant_fk('vouchers', 'bank_account_id', 'bank_accounts');
select app.add_tenant_fk('voucher_lines', 'party_id', 'parties');

-- a draft can be taken back from approval
insert into state_transitions (entity, from_state, to_state, required_permission, description)
values ('voucher', 'pending', 'draft', 'accounts.create', 'Take back a voucher submitted for approval'),
       ('voucher', 'rejected', 'void', 'accounts.edit', 'Discard a rejected voucher');

-- ---------------------------------------------------------------- which side do the detail lines take?
create or replace function app.voucher_detail_side(p_type text) returns text
language sql immutable as $$
  select case p_type when 'CPV' then 'debit' when 'BPV' then 'debit' when 'CV' then 'debit' when 'CN' then 'debit' when 'PIV' then 'debit'
                     when 'CRV' then 'credit' when 'BRV' then 'credit' when 'SV' then 'credit' when 'DN' then 'credit'
                     else null end                       -- JV: both sides
$$;

-- ---------------------------------------------------------------- is this voucher complete and correct?
create or replace function app.validate_voucher(p_voucher uuid) returns void
language plpgsql as $$
declare v vouchers; side text; n int; dsum numeric; csum numeric; r record; ctrl gl_accounts; bank_gl uuid; bad int;
begin
  select * into v from vouchers where id = p_voucher;
  if not found then raise exception 'Voucher not found' using errcode = 'P0002'; end if;
  side := app.voucher_detail_side(v.voucher_type);

  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0) into n, dsum, csum from voucher_lines where voucher_id = v.id;
  if n = 0 then raise exception 'Add at least one line' using errcode = '23514'; end if;

  for r in
    select l.line_no, l.debit, l.credit, l.party_id, a.is_group, a.active, a.requires_party, a.code, a.name
      from voucher_lines l join gl_accounts a on a.id = l.account_id where l.voucher_id = v.id order by l.line_no
  loop
    if r.is_group then raise exception 'Line %: % is a heading and cannot be posted to', r.line_no, r.name using errcode = '23514'; end if;
    if not r.active then raise exception 'Line %: % is switched off', r.line_no, r.name using errcode = '23514'; end if;
    if (r.debit > 0) = (r.credit > 0) then raise exception 'Line %: enter either a debit or a credit amount', r.line_no using errcode = '23514'; end if;
    if side = 'debit' and r.credit > 0 then raise exception 'Line %: a % voucher takes debit lines only', r.line_no, v.voucher_type using errcode = '23514'; end if;
    if side = 'credit' and r.debit > 0 then raise exception 'Line %: a % voucher takes credit lines only', r.line_no, v.voucher_type using errcode = '23514'; end if;
    if r.requires_party and r.party_id is null and v.party_id is null then
      raise exception 'Line %: % needs a customer / supplier', r.line_no, r.name using errcode = '23514';
    end if;
  end loop;

  if side is null then                                                   -- Journal
    if dsum <> csum then raise exception 'Debits (%) and credits (%) must be equal', dsum, csum using errcode = '23514'; end if;
    if dsum = 0 then raise exception 'A journal needs an amount' using errcode = '23514'; end if;
    return;
  end if;

  -- everything else: a control account on the opposite side
  if v.control_account_id is null then
    raise exception 'Choose the % account', case v.voucher_type when 'CPV' then 'cash' when 'CRV' then 'cash' when 'BPV' then 'bank' when 'BRV' then 'bank'
                                              when 'CV' then 'cash / bank (from)' when 'SV' then 'receivable' when 'CN' then 'receivable' else 'payable' end using errcode = '23514';
  end if;
  select * into ctrl from gl_accounts where id = v.control_account_id;
  if ctrl.is_group or not ctrl.active then raise exception 'The % account cannot be used', ctrl.name using errcode = '23514'; end if;

  if v.voucher_type in ('CPV','CRV') and ctrl.category <> 'asset_cash' then
    raise exception 'A cash voucher must use a cash account' using errcode = '23514';
  elsif v.voucher_type in ('BPV','BRV') then
    if v.bank_account_id is null then raise exception 'Choose the bank account' using errcode = '23514'; end if;
    select gl_account_id into bank_gl from bank_accounts where id = v.bank_account_id;
    if bank_gl is distinct from v.control_account_id then raise exception 'The bank account does not match the voucher''s account' using errcode = '23514'; end if;
    if v.instrument_type = 'cheque' and nullif(btrim(coalesce(v.instrument_no, '')), '') is null then
      raise exception 'Enter the cheque number' using errcode = '23514';
    end if;
  elsif v.voucher_type = 'CV' then
    if ctrl.category not in ('asset_cash', 'asset_bank') then raise exception 'A contra voucher moves money between cash and bank accounts' using errcode = '23514'; end if;
    select count(*) into bad from voucher_lines l join gl_accounts a on a.id = l.account_id
     where l.voucher_id = v.id and a.category not in ('asset_cash', 'asset_bank');
    if bad > 0 then raise exception 'A contra voucher moves money between cash and bank accounts only' using errcode = '23514'; end if;
    select count(*) into bad from voucher_lines l where l.voucher_id = v.id and l.account_id = v.control_account_id;
    if bad > 0 then raise exception 'A contra voucher moves money between two different accounts' using errcode = '23514'; end if;
  elsif v.voucher_type in ('SV','CN') then
    if ctrl.category <> 'asset_receivable' then raise exception 'A % uses a receivable account' , v.voucher_type using errcode = '23514'; end if;
    if v.party_id is null then raise exception 'Choose the customer' using errcode = '23514'; end if;
  elsif v.voucher_type in ('PIV','DN') then
    if ctrl.category <> 'liability_payable' then raise exception 'A % uses a payable account', v.voucher_type using errcode = '23514'; end if;
    if v.party_id is null then raise exception 'Choose the supplier' using errcode = '23514'; end if;
  end if;
  if ctrl.requires_party and v.party_id is null then raise exception '% needs a customer / supplier', ctrl.name using errcode = '23514'; end if;
end $$;

-- A voucher is checked the moment it is submitted (and again at approval).
create or replace function app.check_voucher_on_submit() returns trigger
language plpgsql as $$
begin
  if new.status in ('pending', 'approved') and old.status is distinct from new.status then
    perform app.validate_voucher(new.id);
  end if;
  -- approving IS posting: the status cannot be flipped by hand, only by app.approve_voucher (which sets the entry)
  if new.status = 'approved' and new.journal_entry_id is null then
    raise exception 'A voucher is approved by posting it (app.approve_voucher), not by changing its status' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger vouchers_validate before update of status on vouchers
  for each row execute function app.check_voucher_on_submit();

-- ---------------------------------------------------------------- an approved voucher is frozen
create or replace function app.guard_voucher_edit() returns trigger
language plpgsql as $$
begin
  if old.status not in ('draft', 'rejected') then
    if (new.voucher_type, new.number, new.voucher_date, new.party_id, new.control_account_id, new.bank_account_id, new.description,
        new.instrument_type, new.instrument_no, new.instrument_bank, new.reference, new.invoice_no, new.due_date, new.cheque_date)
       is distinct from
       (old.voucher_type, old.number, old.voucher_date, old.party_id, old.control_account_id, old.bank_account_id, old.description,
        old.instrument_type, old.instrument_no, old.instrument_bank, old.reference, old.invoice_no, old.due_date, old.cheque_date) then
      raise exception 'A voucher that has been submitted or approved cannot be edited; take it back, or void it' using errcode = '55000';
    end if;
  elsif new.voucher_type <> old.voucher_type or new.number <> old.number then
    raise exception 'A voucher''s type and number cannot be changed' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger vouchers_edit_guard before update on vouchers for each row execute function app.guard_voucher_edit();

create or replace function app.guard_voucher_lines() returns trigger
language plpgsql as $$
declare v_status text;
begin
  select status into v_status from vouchers where id = coalesce(new.voucher_id, old.voucher_id);
  if v_status is not null and v_status not in ('draft', 'rejected') then
    raise exception 'The lines of a submitted or approved voucher cannot be changed' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
create trigger voucher_lines_guard before insert or update or delete on voucher_lines
  for each row execute function app.guard_voucher_lines();

-- ---------------------------------------------------------------- approval = posting to the ledger
-- One transaction: validate, find (or create) the period, write the journal entry (detail lines + the derived control
-- line), mark the voucher approved. The ledger's own rules (balanced entry, open period, postable accounts) apply.
create or replace function app.approve_voucher(p_voucher uuid, p_by uuid, p_note text default null) returns uuid
language plpgsql as $$
declare v vouchers; side text; period uuid; entry uuid := gen_random_uuid(); total numeric; ctrl_side text; self_ok boolean;
begin
  select * into v from vouchers where id = p_voucher for update;
  if not found then raise exception 'Voucher not found' using errcode = 'P0002'; end if;
  if v.status <> 'pending' then raise exception 'Only a voucher that has been submitted can be approved (this one is %)', v.status using errcode = '55000'; end if;

  select coalesce((settings ->> 'voucher_self_approval')::boolean, true) into self_ok from companies where id = v.company_id;
  if not self_ok and p_by is not distinct from v.created_by then
    raise exception 'The person who prepared a voucher cannot approve it' using errcode = '42501';
  end if;

  perform app.validate_voucher(p_voucher);
  side := app.voucher_detail_side(v.voucher_type);
  period := app.ensure_period(v.company_id, v.voucher_date);

  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (entry, v.company_id, v.number, v.voucher_date, period, 'voucher', v.id,
          coalesce(nullif(btrim(v.description), ''), v.voucher_type || ' ' || v.number), p_by);

  insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, project_id, cost_center_id, debit, credit, memo)
  select l.company_id, entry, l.line_no, l.account_id, coalesce(l.party_id, case when a.requires_party then v.party_id end),
         l.project_id, l.cost_center_id, l.debit, l.credit, l.remarks
    from voucher_lines l join gl_accounts a on a.id = l.account_id where l.voucher_id = v.id;

  if side is not null then
    select coalesce(sum(debit + credit), 0) into total from voucher_lines where voucher_id = v.id;
    ctrl_side := case side when 'debit' then 'credit' else 'debit' end;
    insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
    values (v.company_id, entry, (select coalesce(max(line_no), 0) + 1 from voucher_lines where voucher_id = v.id), v.control_account_id, v.party_id,
            case when ctrl_side = 'debit' then total else 0 end, case when ctrl_side = 'credit' then total else 0 end,
            coalesce(v.instrument_type, '') || coalesce(' ' || v.instrument_no, ''));
  end if;

  update vouchers set status = 'approved', approved_by = p_by, approved_at = now(), approval_note = p_note, journal_entry_id = entry
   where id = v.id;
  return entry;
end $$;

-- ---------------------------------------------------------------- voiding an approved voucher reverses its entry
create or replace function app.void_voucher(p_voucher uuid, p_by uuid, p_reason text, p_date date default current_date) returns void
language plpgsql as $$
declare v vouchers;
begin
  select * into v from vouchers where id = p_voucher for update;
  if not found then raise exception 'Voucher not found' using errcode = 'P0002'; end if;
  if v.status <> 'approved' then raise exception 'Only an approved voucher can be voided (this one is %)', v.status using errcode = '55000'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'A reason is required to void a voucher' using errcode = '23514'; end if;
  perform app.reverse_entry(v.journal_entry_id, p_date, 'Voucher ' || v.number || ' voided: ' || p_reason, p_by);
  update vouchers set status = 'void', approval_note = p_reason where id = v.id;
end $$;

-- ---------------------------------------------------------------- the voucher list: header + total + who/what
create or replace view v_vouchers as
select v.*,
       t.line_count,
       t.total_amount,
       p.display_name as party_name,
       ba.bank_name as bank_name,
       ba.account_no as bank_account_no
  from vouchers v
  left join lateral (
    select count(*)::int as line_count,
           case when app.voucher_detail_side(v.voucher_type) is null then coalesce(sum(debit), 0) else coalesce(sum(debit + credit), 0) end as total_amount
      from voucher_lines l where l.voucher_id = v.id) t on true
  left join parties p on p.id = v.party_id
  left join bank_accounts ba on ba.id = v.bank_account_id;

-- ---------------------------------------------------------------- views must run with the CALLER's rights
-- A view normally runs with its owner's privileges. On a hosted database the owner can bypass row-level security,
-- so a plain view would show every company's rows. security_invoker makes the view obey the policies of whoever
-- queries it. Every migration that creates a view ends with:  select app.secure_views();
create or replace function app.secure_views() returns int language plpgsql as $$
declare r record; n int := 0;
begin
  for r in select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
            where ns.nspname = current_schema() and c.relkind = 'v' loop
    execute format('alter view %I set (security_invoker = true)', r.relname);
    n := n + 1;
  end loop;
  return n;
end $$;
select app.secure_views();
