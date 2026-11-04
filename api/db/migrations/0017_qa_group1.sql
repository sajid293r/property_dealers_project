-- 0017: QA fixes, group 1 — BUG-001 (a posted voucher can only leave through a void that reverses its entry).
--
-- Before: DELETE /v1/vouchers/:id ran `update vouchers set status = 'void'` for any status. The state machine allows
-- approved -> void for accounts.approve, so an approved voucher became "void" while its ledger entry stayed posted,
-- and app.void_voucher then refused it (it is no longer approved). The amount could never be cancelled.
-- Now the database itself refuses: approved -> void is only accepted once the entry has been reversed (which
-- app.void_voucher does first), and a voucher that is not a draft or rejected can never be physically deleted.

create or replace function app.guard_voucher_void() returns trigger language plpgsql as $$
begin
  if old.status = 'approved' and new.status = 'void'
     and not exists (select 1 from journal_entries r where r.reversal_of = old.journal_entry_id) then
    raise exception 'An approved voucher is part of the books. Void it with a reason so that its entry is reversed.' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger vouchers_void_guard before update of status on vouchers
  for each row execute function app.guard_voucher_void();

create or replace function app.guard_voucher_delete() returns trigger language plpgsql as $$
begin
  if old.status not in ('draft', 'rejected') then
    raise exception 'A voucher that has been submitted, approved or voided is part of the records and cannot be deleted.' using errcode = '55000';
  end if;
  return old;
end $$;
create trigger vouchers_delete_guard before delete on vouchers
  for each row execute function app.guard_voucher_delete();

-- the self-check view: two new checks (9, 10) on top of the eight in core.sql
create or replace view v_reconciliation as
  -- 1. every journal entry balances
  select e.company_id, 'ledger_unbalanced'::text as check_name, 'journal_entries'::text as entity_type, e.id as entity_id,
         'debits ' || sum(l.debit) || ' vs credits ' || sum(l.credit) as detail
    from journal_entries e join journal_lines l on l.entry_id = e.id
   group by e.company_id, e.id having sum(l.debit) <> sum(l.credit)
  union all
  -- 2. the rolled-up balances equal the journal they summarise
  select coalesce(a.company_id, j.company_id), 'ledger_balance_drift', 'account_balances', coalesce(a.account_id, j.account_id),
         'stored ' || coalesce(a.debit_total, 0) || '/' || coalesce(a.credit_total, 0) || ' vs journal ' || coalesce(j.d, 0) || '/' || coalesce(j.c, 0)
    from account_balances a
    full join (select l.company_id, l.account_id, e.period_id, sum(l.debit) d, sum(l.credit) c
                 from journal_lines l join journal_entries e on e.id = l.entry_id group by 1, 2, 3) j
      on j.company_id = a.company_id and j.account_id = a.account_id and j.period_id = a.period_id
   where coalesce(a.debit_total, 0) <> coalesce(j.d, 0) or coalesce(a.credit_total, 0) <> coalesce(j.c, 0)
  union all
  -- 3. a receipt never allocates more than it received; a void receipt allocates nothing
  select r.company_id, 'receipt_over_allocated', 'receipts', r.id, 'allocated ' || sum(a.amount) || ' of ' || r.amount
    from receipts r join receipt_allocations a on a.receipt_id = r.id
   group by r.company_id, r.id having sum(a.amount) > r.amount
  union all
  select r.company_id, 'void_receipt_still_allocated', 'receipts', r.id, 'void but net allocation is ' || sum(a.amount)
    from receipts r join receipt_allocations a on a.receipt_id = r.id
   where r.status = 'void' group by r.company_id, r.id having sum(a.amount) <> 0
  union all
  -- 4. what a target says it has been paid equals what the allocations say
  select t.company_id, 'paid_amount_drift', 'installments', t.id, 'stored ' || t.paid_amount || ' vs allocations ' || coalesce(s.n, 0)
    from installments t left join (select installment_id, sum(amount) n from receipt_allocations where installment_id is not null group by 1) s on s.installment_id = t.id
   where t.paid_amount <> coalesce(s.n, 0)
  union all
  select t.company_id, 'paid_amount_drift', 'penalty_charges', t.id, 'stored ' || t.paid_amount || ' vs allocations ' || coalesce(s.n, 0)
    from penalty_charges t left join (select penalty_id, sum(amount) n from receipt_allocations where penalty_id is not null group by 1) s on s.penalty_id = t.id
   where t.paid_amount <> coalesce(s.n, 0)
  union all
  select t.company_id, 'paid_amount_drift', 'sales_invoices', t.id, 'stored ' || t.paid_amount || ' vs allocations ' || coalesce(s.n, 0)
    from sales_invoices t left join (select sales_invoice_id, sum(amount) n from receipt_allocations where sales_invoice_id is not null group by 1) s on s.sales_invoice_id = t.id
   where t.paid_amount <> coalesce(s.n, 0)
  union all
  select t.company_id, 'paid_amount_drift', 'service_invoices', t.id, 'stored ' || t.paid_amount || ' vs allocations ' || coalesce(s.n, 0)
    from service_invoices t left join (select service_invoice_id, sum(amount) n from receipt_allocations where service_invoice_id is not null group by 1) s on s.service_invoice_id = t.id
   where t.paid_amount <> coalesce(s.n, 0)
  union all
  -- 5. the plot map and the booking screen agree: stored status equals what holds and bookings imply
  select p.company_id, 'property_status_drift', 'properties', p.id, 'status is ' || p.status || ' but holds/bookings say ' || d.derived
    from properties p
   cross join lateral (select case
        when exists (select 1 from bookings b where b.property_id = p.id and b.status = 'completed') then 'sold'
        when exists (select 1 from bookings b where b.property_id = p.id and b.status in ('pending','confirmed'))
          or exists (select 1 from property_holds h where h.property_id = p.id and h.released_at is null and h.expires_at > now()) then 'reserved'
        else 'available' end as derived) d
   where p.status in ('available','reserved','sold') and p.status <> d.derived
     and not exists (select 1 from property_holds h where h.property_id = p.id and h.released_at is null and h.expires_at > now() - interval '1 hour')
  union all
  -- 6. the hold-expiry job is running (an expired hold should be released within the hour)
  select h.company_id, 'stale_hold', 'property_holds', h.id, 'expired ' || h.expires_at || ' and still not released'
    from property_holds h where h.released_at is null and h.expires_at < now() - interval '1 hour'
  union all
  -- 7. a confirmed installment booking's schedule adds up to its price
  select b.company_id, 'booking_schedule_mismatch', 'bookings', b.id,
         'schedule ' || coalesce(s.total, 0) || ' vs price ' || b.net_price
    from bookings b left join (select booking_id, sum(amount) total from installments group by 1) s on s.booking_id = b.id
   where b.payment_type = 'installment' and b.status in ('confirmed','completed') and coalesce(s.total, 0) <> b.net_price
  union all
  -- 8. no journal entry claims a document that does not exist
  select e.company_id, 'orphan_journal_source', 'journal_entries', e.id, e.source_type || ' ' || e.source_id || ' not found'
    from journal_entries e
   where e.source_id is not null and e.reversal_of is null and (
         (e.source_type = 'receipt' and not exists (select 1 from receipts r where r.id = e.source_id))
      or (e.source_type = 'voucher' and not exists (select 1 from vouchers v where v.id = e.source_id)))
  union all
  -- 9. a voided voucher has been reversed in the books (void_voucher does both; nothing else may void a posted one)
  select v.company_id, 'void_voucher_not_reversed', 'vouchers', v.id, v.number || ' is void but its entry was never reversed'
    from vouchers v
   where v.status = 'void' and v.journal_entry_id is not null
     and not exists (select 1 from journal_entries r where r.reversal_of = v.journal_entry_id)
  union all
  -- 10. an approved voucher has posted its entry
  select v.company_id, 'approved_voucher_without_entry', 'vouchers', v.id, v.number || ' is approved but has no ledger entry'
    from vouchers v where v.status = 'approved' and v.journal_entry_id is null;

create or replace function app.reconciliation_summary() returns table (check_name text, problems bigint)
language sql stable as $$
  select c.name, count(r.check_name)
    from unnest(array['ledger_unbalanced','ledger_balance_drift','receipt_over_allocated','void_receipt_still_allocated',
                      'paid_amount_drift','property_status_drift','stale_hold','booking_schedule_mismatch','orphan_journal_source',
                      'void_voucher_not_reversed','approved_voucher_without_entry']) as c(name)
    left join v_reconciliation r on r.check_name = c.name
   group by c.name order by c.name
$$;


-- ---------------------------------------------------------------- BUG-002: company-checked references everywhere
-- A single-column foreign key is checked by Postgres as the table owner, so row-level security does not stop company A's
-- row from pointing at company B's row (found in QA: a budget could name another company's project). Every reference the
-- view v_tenant_fk_gaps still lists gets its company-scoped twin: (company_id, column) -> parent (company_id, id).
-- The delete rule of the old key (cascade / set null) is carried over so nothing behaves differently. After this
-- the view is empty; a new table that forgets the rule shows up there again (and the smoke test fails).
do $$
declare g record; v_del "char"; v_rule text; v_parent_uq text;
begin
  for g in select child_table, child_column, parent_table from v_tenant_fk_gaps order by 1, 2 loop
    select c.confdeltype into v_del
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and array_length(c.conkey, 1) = 1 and c.conrelid = g.child_table::regclass
       and c.confrelid = g.parent_table::regclass and a.attname = g.child_column
     limit 1;
    v_rule := case v_del when 'c' then ' on delete cascade' when 'n' then format(' on delete set null (%I)', g.child_column) else '' end;
    v_parent_uq := g.parent_table || '_company_id_id_uq';
    if not exists (select 1 from pg_constraint where conname = v_parent_uq) then
      execute format('alter table %s add constraint %I unique (company_id, id)', g.parent_table, v_parent_uq);
    end if;
    execute format('alter table %s add constraint %I foreign key (company_id, %I) references %s (company_id, id)%s',
                   g.child_table, left(g.child_table || '_' || g.child_column, 50) || '_tenant_fk', g.child_column, g.parent_table, v_rule);
  end loop;
end $$;

select app.secure_views();
