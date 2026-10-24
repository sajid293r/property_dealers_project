-- 0007: customer receipts — money received against a booking.
--
-- A receipt is posted the moment it is recorded (it is the proof that money came in), and does three things in ONE
-- transaction:
--   1. the receipt row (numbered RCT-00001, …)
--   2. the ledger entry:  Dr the cash / bank account it was paid into,  Cr Customer Advances & Deposits (the customer)
--   3. the allocation to the booking's installments, oldest first (or exactly as the person chose)
-- Money that is not allocated stays on the customer's account as an advance. Revenue recognition is a policy the
-- client's accountant still has to confirm (BACKEND_DESIGN §14), so nothing here books revenue.
-- Voiding goes through app.void_receipt (core): it reverses the allocations and the ledger entry.

create or replace function app.record_receipt(
  p_booking uuid,
  p_amount numeric,
  p_method text,
  p_deposit_account uuid,
  p_received_on date,
  p_instrument_ref text,
  p_by uuid,
  p_allocations jsonb default null,
  p_customer uuid default null)
returns uuid language plpgsql as $$
declare
  b bookings; v_company uuid; v_customer uuid; acct gl_accounts; advance uuid; v_id uuid := gen_random_uuid();
  v_entry uuid := gen_random_uuid(); v_no text; v_left numeric; a jsonb; inst installments; v_take numeric; v_sum numeric := 0;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'The amount received must be more than zero' using errcode = '23514'; end if;
  if p_method not in ('cash','cheque','bank_transfer','online','pay_order') then
    raise exception 'Choose how the money was received' using errcode = '23514';
  end if;

  if p_booking is not null then
    select * into b from bookings where id = p_booking for update;
    if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
    if b.status = 'cancelled' then raise exception 'This booking is cancelled; money cannot be received against it' using errcode = '55000'; end if;
    v_company := b.company_id; v_customer := b.customer_id;
  else
    if p_customer is null then raise exception 'Choose the customer or the booking this money is for' using errcode = '23514'; end if;
    select company_id into v_company from parties where id = p_customer;
    if v_company is null then raise exception 'Customer not found' using errcode = 'P0002'; end if;
    v_customer := p_customer;
  end if;

  select * into acct from gl_accounts where id = p_deposit_account and company_id = v_company;
  if not found then raise exception 'Choose the cash or bank account the money went into' using errcode = '23514'; end if;
  if acct.is_group or acct.category not in ('asset_cash','asset_bank') then
    raise exception 'Money can only be received into a cash or bank account' using errcode = '23514';
  end if;

  select id into advance from gl_accounts where company_id = v_company and code = '02.01.02.0001' and not is_group;
  if advance is null then raise exception 'The Customer Advances account is missing from the chart of accounts' using errcode = '23514'; end if;

  v_no := app.next_doc_no(v_company, 'RCT');
  insert into receipts (id, company_id, receipt_no, customer_id, booking_id, received_on, amount, method, deposit_account, instrument_ref, created_by)
  values (v_id, v_company, v_no, v_customer, p_booking, coalesce(p_received_on, current_date), p_amount, p_method, p_deposit_account,
          nullif(btrim(p_instrument_ref), ''), p_by);

  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, v_company, v_no, coalesce(p_received_on, current_date), app.ensure_period(v_company, coalesce(p_received_on, current_date)),
          'receipt', v_id, 'Receipt ' || v_no || coalesce(' against ' || b.booking_no, ''), p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
  values (v_company, v_entry, 1, p_deposit_account, v_customer, p_amount, 0, coalesce(p_method || ' ' || nullif(btrim(p_instrument_ref), ''), p_method)),
         (v_company, v_entry, 2, advance, v_customer, 0, p_amount, 'Received from customer');
  update receipts set journal_entry_id = v_entry where id = v_id;

  -- allocation: exactly what the person chose, or the oldest unpaid installments first
  if p_booking is not null then
    if p_allocations is not null and jsonb_typeof(p_allocations) = 'array' and jsonb_array_length(p_allocations) > 0 then
      for a in select * from jsonb_array_elements(p_allocations) loop
        select * into inst from installments where id = (a ->> 'installmentId')::uuid and booking_id = p_booking for update;
        if not found then raise exception 'That installment does not belong to this booking' using errcode = '23514'; end if;
        v_take := (a ->> 'amount')::numeric;
        if v_take is null or v_take <= 0 then raise exception 'Each allocated amount must be more than zero' using errcode = '23514'; end if;
        if v_take > inst.amount - inst.paid_amount then
          raise exception 'Installment % has only % left to pay', inst.seq, inst.amount - inst.paid_amount using errcode = '23514';
        end if;
        insert into receipt_allocations (company_id, receipt_id, installment_id, amount) values (v_company, v_id, inst.id, v_take);
        v_sum := v_sum + v_take;
      end loop;
    else
      v_left := p_amount;
      for inst in select * from installments where booking_id = p_booking and status in ('due','partial') order by seq for update loop
        exit when v_left <= 0;
        v_take := least(v_left, inst.amount - inst.paid_amount);
        continue when v_take <= 0;
        insert into receipt_allocations (company_id, receipt_id, installment_id, amount) values (v_company, v_id, inst.id, v_take);
        v_left := v_left - v_take;
      end loop;
    end if;
  end if;
  return v_id;
end $$;

-- the receipts list: who paid, for which booking, into which account, how much is applied
create or replace view v_receipts as
select r.id, r.company_id, r.receipt_no, r.received_on, r.amount, r.method, r.instrument_ref, r.status,
       r.customer_id, p.display_name as customer_name,
       r.booking_id, b.booking_no, r.deposit_account, a.code as deposit_account_code, a.name as deposit_account_name,
       r.journal_entry_id, r.created_by, r.created_at, r.void_reason, r.voided_at,
       coalesce((select sum(x.amount) from receipt_allocations x where x.receipt_id = r.id), 0) as allocated_amount
  from receipts r
  join parties p on p.id = r.customer_id
  left join bookings b on b.id = r.booking_id
  left join gl_accounts a on a.id = r.deposit_account;

select app.secure_views();
