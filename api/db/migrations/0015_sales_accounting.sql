-- 0015: the money side of selling plots that goes beyond "a booking and its installments":
--   late-payment charges (assessed, paid like any other dues, or waived),
--   refunds when a booking is cancelled (with an optional cancellation deduction),
--   transfer of a booking to another customer,
--   dealer commission (accrued when a dealer's booking is made, paid with an ordinary payment voucher).
-- Everything posts to the ledger in the same transaction, and is reversed, never edited.

-- ---------------------------------------------------------------- late-payment charges
alter table penalty_charges
  add column assessed_on date not null default current_date,
  add column assessed_through date not null default current_date,
  add column reason text,
  add column journal_entry_id uuid references journal_entries(id),
  add column created_by uuid references users(id),
  add column created_at timestamptz not null default now();
select app.add_tenant_fk('penalty_charges', 'journal_entry_id', 'journal_entries');
select app.attach_audit('penalty_charges');

-- what the company's own rule says an overdue installment owes now (rate is per month, pro rata by day, after a grace period)
create or replace function app.suggested_penalty(p_installment uuid) returns numeric
language plpgsql stable as $$
declare i installments; v_rate numeric; v_grace int; v_from date; v_days int; v_through date;
begin
  select * into i from installments where id = p_installment;
  if not found or i.status not in ('due','partial') then return 0; end if;
  select coalesce((c.settings ->> 'penalty_rate_pct_month')::numeric, 0), coalesce((c.settings ->> 'penalty_grace_days')::int, 0)
    into v_rate, v_grace from companies c where c.id = i.company_id;
  if v_rate <= 0 then return 0; end if;
  select max(assessed_through) into v_through from penalty_charges where installment_id = p_installment and status <> 'waived';
  v_from := greatest(i.due_date + v_grace, coalesce(v_through, i.due_date + v_grace));
  v_days := current_date - v_from;
  if v_days <= 0 then return 0; end if;
  return round((i.amount - i.paid_amount) * v_rate / 100 * v_days / 30.0, 2);
end $$;

create or replace function app.assess_penalty(p_installment uuid, p_amount numeric, p_reason text, p_by uuid) returns uuid
language plpgsql as $$
declare i installments; b bookings; v_ar uuid; v_inc uuid; v_id uuid := gen_random_uuid(); v_entry uuid := gen_random_uuid(); v_no text;
begin
  select * into i from installments where id = p_installment for update;
  if not found then raise exception 'Installment not found' using errcode = 'P0002'; end if;
  if i.status not in ('due','partial') then raise exception 'This installment is already %; no late charge applies', i.status using errcode = '55000'; end if;
  if i.due_date >= current_date then raise exception 'This installment is not late yet' using errcode = '55000'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'The late charge must be more than zero' using errcode = '23514'; end if;
  select * into b from bookings where id = i.booking_id;
  if b.status = 'cancelled' then raise exception 'This booking is cancelled' using errcode = '55000'; end if;
  select id into v_ar from gl_accounts where company_id = i.company_id and code = '03.01.02.0001' and not is_group;
  select id into v_inc from gl_accounts where company_id = i.company_id and code = '04.01.03.0003';
  if v_ar is null or v_inc is null then raise exception 'The receivable and late-charge income accounts are missing' using errcode = '23514'; end if;

  v_no := app.next_doc_no(i.company_id, 'LATE');
  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, i.company_id, v_no, current_date, app.ensure_period(i.company_id, current_date), 'adjustment', v_id,
          'Late charge on installment ' || i.seq || ' of ' || b.booking_no || coalesce(' — ' || nullif(btrim(p_reason), ''), ''), p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
  values (i.company_id, v_entry, 1, v_ar, b.customer_id, p_amount, 0, v_no), (i.company_id, v_entry, 2, v_inc, b.customer_id, 0, p_amount, v_no);
  insert into penalty_charges (id, company_id, installment_id, amount, reason, journal_entry_id, created_by, assessed_through)
  values (v_id, i.company_id, p_installment, p_amount, nullif(btrim(coalesce(p_reason, '')), ''), v_entry, p_by, current_date);
  return v_id;
end $$;

create or replace function app.waive_penalty(p_penalty uuid, p_by uuid, p_reason text) returns void
language plpgsql as $$
declare c penalty_charges;
begin
  select * into c from penalty_charges where id = p_penalty for update;
  if not found then raise exception 'Late charge not found' using errcode = 'P0002'; end if;
  if c.status = 'waived' then raise exception 'This late charge is already waived' using errcode = '55000'; end if;
  if c.paid_amount > 0 then raise exception 'Money has been received against this late charge; void that receipt first' using errcode = '55000'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Say why the late charge is waived' using errcode = '23514'; end if;
  if c.journal_entry_id is not null then perform app.reverse_entry(c.journal_entry_id, current_date, 'Late charge waived: ' || p_reason, p_by); end if;
  update penalty_charges set status = 'waived' where id = p_penalty;
end $$;

-- A receipt now settles open late charges first (they are the oldest debt), then installments, then stays as an advance.
-- The part that pays a late charge clears the customer's receivable; the rest is an advance, as before.
create or replace function app.record_receipt(
  p_booking uuid, p_amount numeric, p_method text, p_deposit_account uuid, p_received_on date, p_instrument_ref text, p_by uuid,
  p_allocations jsonb default null, p_customer uuid default null)
returns uuid language plpgsql as $$
declare
  b bookings; v_company uuid; v_customer uuid; acct gl_accounts; advance uuid; v_ar uuid; v_id uuid := gen_random_uuid();
  v_entry uuid := gen_random_uuid(); v_no text; v_left numeric; a jsonb; inst installments; pen penalty_charges; v_take numeric; v_pen numeric := 0;
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
  select id into v_ar from gl_accounts where company_id = v_company and code = '03.01.02.0001' and not is_group;
  if advance is null then raise exception 'The Customer Advances account is missing from the chart of accounts' using errcode = '23514'; end if;

  v_no := app.next_doc_no(v_company, 'RCT');
  insert into receipts (id, company_id, receipt_no, customer_id, booking_id, received_on, amount, method, deposit_account, instrument_ref, created_by)
  values (v_id, v_company, v_no, v_customer, p_booking, coalesce(p_received_on, current_date), p_amount, p_method, p_deposit_account,
          nullif(btrim(p_instrument_ref), ''), p_by);

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
      end loop;
    else
      v_left := p_amount;
      -- 1. open late charges on this booking, oldest first
      for pen in select p.* from penalty_charges p join installments i on i.id = p.installment_id
                  where i.booking_id = p_booking and p.status in ('open','partial') order by p.created_at for update of p loop
        exit when v_left <= 0;
        v_take := least(v_left, pen.amount - pen.paid_amount);
        continue when v_take <= 0;
        insert into receipt_allocations (company_id, receipt_id, penalty_id, amount) values (v_company, v_id, pen.id, v_take);
        v_left := v_left - v_take;
        v_pen := v_pen + v_take;
      end loop;
      -- 2. installments, oldest first
      for inst in select * from installments where booking_id = p_booking and status in ('due','partial') order by seq for update loop
        exit when v_left <= 0;
        v_take := least(v_left, inst.amount - inst.paid_amount);
        continue when v_take <= 0;
        insert into receipt_allocations (company_id, receipt_id, installment_id, amount) values (v_company, v_id, inst.id, v_take);
        v_left := v_left - v_take;
      end loop;
    end if;
  end if;

  -- the ledger entry: what was received, split between the part that paid late charges (clears the receivable)
  -- and the rest (an advance on the customer's account)
  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, v_company, v_no, coalesce(p_received_on, current_date), app.ensure_period(v_company, coalesce(p_received_on, current_date)),
          'receipt', v_id, 'Receipt ' || v_no || coalesce(' against ' || b.booking_no, ''), p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
  values (v_company, v_entry, 1, p_deposit_account, v_customer, p_amount, 0, coalesce(p_method || ' ' || nullif(btrim(p_instrument_ref), ''), p_method));
  if p_amount - v_pen > 0 then
    insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
    values (v_company, v_entry, 2, advance, v_customer, 0, p_amount - v_pen, 'Received from customer');
  end if;
  if v_pen > 0 then
    insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
    values (v_company, v_entry, 3, v_ar, v_customer, 0, v_pen, 'Late charges paid');
  end if;
  update receipts set journal_entry_id = v_entry where id = v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------- refunds on a cancelled booking
create table booking_refunds (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  refund_no        text not null,
  booking_id       uuid not null references bookings(id),
  refund_amount    numeric(18,2) not null check (refund_amount >= 0),
  deduction_amount numeric(18,2) not null default 0 check (deduction_amount >= 0),
  method           text not null check (method in ('cash','cheque','bank_transfer','online','pay_order')),
  paid_from        uuid references gl_accounts(id),
  refund_date      date not null,
  note             text,
  journal_entry_id uuid references journal_entries(id),
  status           text not null default 'posted' check (status in ('posted','void')),
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  unique (company_id, refund_no),
  check (refund_amount + deduction_amount > 0)
);
select app.enable_tenant_rls('booking_refunds');
select app.add_tenant_fk('booking_refunds', 'booking_id', 'bookings');
select app.add_tenant_fk('booking_refunds', 'paid_from', 'gl_accounts');
select app.add_tenant_fk('booking_refunds', 'journal_entry_id', 'journal_entries');
select app.attach_audit('booking_refunds');

-- money received on a booking that has not yet been refunded or kept as a cancellation charge
create or replace function app.booking_refundable(p_booking uuid) returns numeric language sql stable as $$
  select coalesce((select sum(amount) from receipts where booking_id = p_booking and status = 'posted'), 0)
       - coalesce((select sum(refund_amount + deduction_amount) from booking_refunds where booking_id = p_booking and status = 'posted'), 0)
$$;

create or replace function app.refund_booking(
  p_booking uuid, p_refund numeric, p_deduction numeric, p_method text, p_from uuid, p_date date, p_note text, p_by uuid) returns uuid
language plpgsql as $$
declare b bookings; acct gl_accounts; v_adv uuid; v_inc uuid; v_id uuid := gen_random_uuid(); v_entry uuid := gen_random_uuid(); v_no text; v_avail numeric; n int := 1;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if b.status <> 'cancelled' then raise exception 'Cancel the booking before refunding the customer' using errcode = '55000'; end if;
  p_refund := coalesce(p_refund, 0); p_deduction := coalesce(p_deduction, 0);
  if p_refund < 0 or p_deduction < 0 or p_refund + p_deduction <= 0 then raise exception 'Enter the amount to refund and/or the cancellation charge' using errcode = '23514'; end if;
  v_avail := app.booking_refundable(p_booking);
  if p_refund + p_deduction > v_avail then raise exception 'Only % was received on this booking and not yet returned', v_avail using errcode = '23514'; end if;
  if p_refund > 0 then
    if p_method not in ('cash','cheque','bank_transfer','online','pay_order') then raise exception 'Choose how the refund is paid' using errcode = '23514'; end if;
    select * into acct from gl_accounts where id = p_from and company_id = b.company_id;
    if not found or acct.is_group or acct.category not in ('asset_cash','asset_bank') then raise exception 'Choose the cash or bank account the refund is paid from' using errcode = '23514'; end if;
  end if;
  select id into v_adv from gl_accounts where company_id = b.company_id and code = '02.01.02.0001' and not is_group;
  select id into v_inc from gl_accounts where company_id = b.company_id and code = '04.02.01.0001';
  if v_adv is null or v_inc is null then raise exception 'The advances and other-income accounts are missing' using errcode = '23514'; end if;

  v_no := app.next_doc_no(b.company_id, 'REF');
  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, b.company_id, v_no, coalesce(p_date, current_date), app.ensure_period(b.company_id, coalesce(p_date, current_date)), 'adjustment', v_id,
          'Refund on cancelled booking ' || b.booking_no || coalesce(' — ' || nullif(btrim(p_note), ''), ''), p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
  values (b.company_id, v_entry, 1, v_adv, b.customer_id, p_refund + p_deduction, 0, 'Returned / retained on cancellation');
  if p_refund > 0 then n := n + 1; insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo) values (b.company_id, v_entry, n, p_from, b.customer_id, 0, p_refund, 'Refund ' || v_no); end if;
  if p_deduction > 0 then n := n + 1; insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo) values (b.company_id, v_entry, n, v_inc, b.customer_id, 0, p_deduction, 'Cancellation charges ' || b.booking_no); end if;
  insert into booking_refunds (id, company_id, refund_no, booking_id, refund_amount, deduction_amount, method, paid_from, refund_date, note, journal_entry_id, created_by)
  values (v_id, b.company_id, v_no, p_booking, p_refund, p_deduction, coalesce(p_method, 'cash'), case when p_refund > 0 then p_from end, coalesce(p_date, current_date), nullif(btrim(coalesce(p_note, '')), ''), v_entry, p_by);
  return v_id;
end $$;

create or replace function app.void_refund(p_refund uuid, p_by uuid, p_reason text) returns void
language plpgsql as $$
declare r booking_refunds;
begin
  select * into r from booking_refunds where id = p_refund for update;
  if not found then raise exception 'Refund not found' using errcode = 'P0002'; end if;
  if r.status = 'void' then raise exception 'This refund is already void' using errcode = '55000'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required to void a refund' using errcode = '23514'; end if;
  perform app.reverse_entry(r.journal_entry_id, current_date, 'Refund ' || r.refund_no || ' voided: ' || p_reason, p_by);
  update booking_refunds set status = 'void' where id = p_refund;
end $$;

-- ---------------------------------------------------------------- transfer a booking to another customer
create table booking_transfers (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  transfer_no      text not null,
  booking_id       uuid not null references bookings(id),
  from_party_id    uuid not null references parties(id),
  to_party_id      uuid not null references parties(id),
  transfer_date    date not null,
  amount_moved     numeric(18,2) not null check (amount_moved >= 0),
  fee_invoice_id   uuid references service_invoices(id),
  note             text,
  journal_entry_id uuid references journal_entries(id),
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  unique (company_id, transfer_no),
  check (from_party_id <> to_party_id)
);
select app.enable_tenant_rls('booking_transfers');
select app.add_tenant_fk('booking_transfers', 'booking_id', 'bookings');
select app.add_tenant_fk('booking_transfers', 'from_party_id', 'parties');
select app.add_tenant_fk('booking_transfers', 'to_party_id', 'parties');
select app.add_tenant_fk('booking_transfers', 'fee_invoice_id', 'service_invoices');
select app.add_tenant_fk('booking_transfers', 'journal_entry_id', 'journal_entries');
select app.attach_audit('booking_transfers');

-- The booking, and the money already paid on it, move to the new customer. Receipts keep naming who actually paid.
create or replace function app.transfer_booking(p_booking uuid, p_to uuid, p_fee numeric, p_date date, p_note text, p_by uuid) returns uuid
language plpgsql as $$
declare b bookings; v_adv uuid; v_moved numeric; v_id uuid := gen_random_uuid(); v_entry uuid; v_inv uuid; v_no text; v_to_company uuid; prop properties;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if b.status = 'cancelled' then raise exception 'A cancelled booking cannot be transferred' using errcode = '55000'; end if;
  select company_id into v_to_company from parties where id = p_to;
  if v_to_company is distinct from b.company_id then raise exception 'Choose the customer the booking is transferred to' using errcode = '23514'; end if;
  if p_to = b.customer_id then raise exception 'The booking already belongs to this customer' using errcode = '23514'; end if;
  select id into v_adv from gl_accounts where company_id = b.company_id and code = '02.01.02.0001' and not is_group;
  v_moved := app.booking_refundable(p_booking);
  v_no := app.next_doc_no(b.company_id, 'TRF');

  if v_moved > 0 then
    v_entry := gen_random_uuid();
    insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
    values (v_entry, b.company_id, v_no, coalesce(p_date, current_date), app.ensure_period(b.company_id, coalesce(p_date, current_date)), 'adjustment', v_id,
            'Transfer of ' || b.booking_no || ' to a new customer', p_by);
    insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
    values (b.company_id, v_entry, 1, v_adv, b.customer_id, v_moved, 0, v_no), (b.company_id, v_entry, 2, v_adv, p_to, 0, v_moved, v_no);
  end if;
  if coalesce(p_fee, 0) > 0 then
    v_inv := app.issue_service_invoice(p_to, b.property_id, 'Transfer fee ' || b.booking_no, coalesce(p_date, current_date), coalesce(p_date, current_date) + 15, p_fee,
                                       (select id from gl_accounts where company_id = b.company_id and code = '04.01.03.0002'), 'Booking transfer fee', p_by);
  end if;

  insert into booking_transfers (id, company_id, transfer_no, booking_id, from_party_id, to_party_id, transfer_date, amount_moved, fee_invoice_id, note, journal_entry_id, created_by)
  values (v_id, b.company_id, v_no, p_booking, b.customer_id, p_to, coalesce(p_date, current_date), v_moved, v_inv, nullif(btrim(coalesce(p_note, '')), ''), v_entry, p_by);
  update bookings set customer_id = p_to where id = p_booking;

  -- a property already handed over (completed) also changes its recorded owner
  select * into prop from properties where id = b.property_id;
  if b.status = 'completed' then
    update property_ownership_history set to_date = coalesce(p_date, current_date) where property_id = b.property_id and to_date is null;
    insert into property_ownership_history (company_id, property_id, owner_party_id, acquisition_type, from_date, booking_id) values (b.company_id, b.property_id, p_to, 'transfer', coalesce(p_date, current_date), p_booking);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------- dealer commission
create table dealer_commissions (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  commission_no    text not null,
  booking_id       uuid not null references bookings(id),
  dealer_id        uuid not null references parties(id),
  rate_pct         numeric(6,3) not null check (rate_pct > 0 and rate_pct <= 100),
  base_amount      numeric(18,2) not null check (base_amount > 0),
  amount           numeric(18,2) not null check (amount > 0),
  status           text not null default 'accrued' check (status in ('accrued','void')),
  accrued_on       date not null default current_date,
  journal_entry_id uuid references journal_entries(id),
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  unique (company_id, commission_no)
);
-- one live commission per booking
create unique index dealer_commissions_one_live on dealer_commissions (booking_id) where status = 'accrued';
select app.enable_tenant_rls('dealer_commissions');
select app.add_tenant_fk('dealer_commissions', 'booking_id', 'bookings');
select app.add_tenant_fk('dealer_commissions', 'dealer_id', 'parties');
select app.add_tenant_fk('dealer_commissions', 'journal_entry_id', 'journal_entries');
select app.attach_audit('dealer_commissions');

create or replace function app.accrue_commission(p_booking uuid, p_rate numeric, p_by uuid) returns uuid
language plpgsql as $$
declare b bookings; v_exp uuid; v_pay uuid; v_amount numeric; v_id uuid := gen_random_uuid(); v_entry uuid := gen_random_uuid(); v_no text;
begin
  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if b.dealer_id is null then raise exception 'This booking has no dealer' using errcode = '23514'; end if;
  if b.status = 'cancelled' then raise exception 'This booking is cancelled' using errcode = '55000'; end if;
  if p_rate is null or p_rate <= 0 or p_rate > 100 then raise exception 'Enter a commission rate between 0 and 100 percent' using errcode = '23514'; end if;
  if exists (select 1 from dealer_commissions where booking_id = p_booking and status = 'accrued') then raise exception 'Commission has already been recorded for this booking' using errcode = '23505'; end if;
  v_amount := round(b.net_price * p_rate / 100, 2);
  if v_amount <= 0 then raise exception 'The commission works out to nothing' using errcode = '23514'; end if;
  select id into v_exp from gl_accounts where company_id = b.company_id and code = '05.02.03.0003';
  select id into v_pay from gl_accounts where company_id = b.company_id and code = '02.01.01.0002';
  if v_exp is null or v_pay is null then raise exception 'The dealer commission accounts are missing' using errcode = '23514'; end if;

  v_no := app.next_doc_no(b.company_id, 'COM');
  insert into journal_entries (id, company_id, entry_no, entry_date, period_id, source_type, source_id, description, posted_by)
  values (v_entry, b.company_id, v_no, current_date, app.ensure_period(b.company_id, current_date), 'adjustment', v_id, 'Dealer commission on ' || b.booking_no, p_by);
  insert into journal_lines (company_id, entry_id, line_no, account_id, party_id, debit, credit, memo)
  values (b.company_id, v_entry, 1, v_exp, b.dealer_id, v_amount, 0, b.booking_no), (b.company_id, v_entry, 2, v_pay, b.dealer_id, 0, v_amount, b.booking_no);
  insert into dealer_commissions (id, company_id, commission_no, booking_id, dealer_id, rate_pct, base_amount, amount, journal_entry_id, created_by)
  values (v_id, b.company_id, v_no, p_booking, b.dealer_id, p_rate, b.net_price, v_amount, v_entry, p_by);
  return v_id;
end $$;

create or replace function app.void_commission(p_commission uuid, p_by uuid, p_reason text) returns void
language plpgsql as $$
declare c dealer_commissions;
begin
  select * into c from dealer_commissions where id = p_commission for update;
  if not found then raise exception 'Commission not found' using errcode = 'P0002'; end if;
  if c.status = 'void' then raise exception 'This commission is already void' using errcode = '55000'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required to void a commission' using errcode = '23514'; end if;
  perform app.reverse_entry(c.journal_entry_id, current_date, 'Commission ' || c.commission_no || ' voided: ' || p_reason, p_by);
  update dealer_commissions set status = 'void' where id = p_commission;
end $$;

select app.secure_views();
