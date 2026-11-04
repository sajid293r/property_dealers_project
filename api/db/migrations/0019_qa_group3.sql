-- 0019: QA fixes, group 3 — small rules the database should keep (BUG-010, BUG-011, BUG-012, BUG-018).

-- BUG-010: a journal that debits and credits the very same account (same party, project and cost centre) cancels itself
-- out and is almost always a slip. Refused when the voucher is submitted, like every other voucher check.
create or replace function app.guard_voucher_sides() returns trigger language plpgsql as $$
declare r record;
begin
  if new.status = 'pending' and old.status is distinct from 'pending' then
    select a.code, a.name into r
      from voucher_lines d
      join voucher_lines c on c.voucher_id = d.voucher_id and c.account_id = d.account_id
                          and c.party_id is not distinct from d.party_id
                          and c.project_id is not distinct from d.project_id
                          and c.cost_center_id is not distinct from d.cost_center_id
      join gl_accounts a on a.id = d.account_id
     where d.voucher_id = new.id and d.debit > 0 and c.credit > 0
     limit 1;
    if found then
      raise exception 'The account % % is on both the debit and the credit side, so it cancels itself out. Use a different account, or a different party, project or cost centre on one side.', r.code, r.name
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger vouchers_sides_guard before update of status on vouchers
  for each row execute function app.guard_voucher_sides();

-- BUG-011: assessing a late fee twice for the same installment charged it twice. One late fee at a time: a new one is
-- accepted once the earlier one is paid (and not on the same day) or waived.
create or replace function app.guard_penalty_duplicate() returns trigger language plpgsql as $$
declare o penalty_charges;
begin
  select * into o from penalty_charges
   where installment_id = new.installment_id and status in ('open', 'partial') limit 1;
  if found then
    raise exception 'A late fee of Rs % is already open on this installment. Waive it first if it is wrong, or wait until it is paid.', o.amount
      using errcode = '55000';
  end if;
  select * into o from penalty_charges
   where installment_id = new.installment_id and status = 'paid' and assessed_through = current_date limit 1;
  if found then
    raise exception 'A late fee was already charged and paid on this installment today.' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger penalty_charges_duplicate_guard before insert on penalty_charges
  for each row execute function app.guard_penalty_duplicate();

-- BUG-018: the same cheque number from the same bank for the same person is on the register once (a cancelled one
-- may be entered again).
create unique index cheques_no_uq on cheques (company_id, direction, party_id, lower(btrim(bank_name)), btrim(cheque_no))
  where status <> 'cancelled';

-- BUG-012: a statement that has already been imported (same account, period, balances and lines) cannot be imported
-- again. The API sends a fingerprint of the statement.
alter table bank_statements add column content_hash text;
create unique index bank_statements_content_uq on bank_statements (company_id, bank_account_id, content_hash)
  where content_hash is not null;
