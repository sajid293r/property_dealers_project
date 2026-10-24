-- 0006: the ledger queries behind the Accounts and Reports screens.
-- Plain functions (not security definer): they run with the caller's rights, so each company sees only its own books.
-- Reversed entries and their reversals both appear and net to zero, which is how a correction should look.

-- Every posting account with its balance before the period, its movement in it, and its closing balance.
-- Groups are not returned: they are rolled up from the leaf accounts by code prefix ("03.01" covers "03.01.01.0001").
create or replace function app.trial_balance(p_from date, p_to date)
returns table (account_id uuid, code text, name text, account_class text, category text, parent_id uuid,
               opening numeric, debit numeric, credit numeric, closing numeric)
language sql stable as $$
  select a.id, a.code, a.name, a.account_class, a.category, a.parent_id,
         coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0),
         coalesce(sum(l.debit)            filter (where e.entry_date between p_from and p_to), 0),
         coalesce(sum(l.credit)           filter (where e.entry_date between p_from and p_to), 0),
         coalesce(sum(l.debit - l.credit) filter (where e.entry_date <= p_to), 0)
    from gl_accounts a
    left join journal_lines l on l.account_id = a.id
    left join journal_entries e on e.id = l.entry_id
   where not a.is_group
   group by a.id
   order by a.code
$$;

-- One account's entries with a running balance (debit minus credit), starting from its balance before p_from.
create or replace function app.account_ledger(p_account uuid, p_from date, p_to date)
returns table (entry_date date, entry_no text, entry_id uuid, source_type text, source_id uuid, description text, memo text,
               party_id uuid, party_name text, debit numeric, credit numeric, running_balance numeric)
language sql stable as $$
  with opening as (
    select coalesce(sum(l.debit - l.credit), 0) as bal
      from journal_lines l join journal_entries e on e.id = l.entry_id
     where l.account_id = p_account and e.entry_date < p_from)
  select e.entry_date, e.entry_no, e.id, e.source_type, e.source_id, e.description, l.memo, l.party_id, p.display_name,
         l.debit, l.credit,
         (select bal from opening) + sum(l.debit - l.credit) over (order by e.entry_date, e.entry_no, l.line_no rows between unbounded preceding and current row)
    from journal_lines l
    join journal_entries e on e.id = l.entry_id
    left join parties p on p.id = l.party_id
   where l.account_id = p_account and e.entry_date between p_from and p_to
   order by e.entry_date, e.entry_no, l.line_no
$$;

create or replace function app.account_opening(p_account uuid, p_from date) returns numeric
language sql stable as $$
  select coalesce(sum(l.debit - l.credit), 0)
    from journal_lines l join journal_entries e on e.id = l.entry_id
   where l.account_id = p_account and e.entry_date < p_from
$$;

-- A customer's or supplier's statement: every entry on their receivable / payable / advance accounts, with a running
-- balance (positive = they owe us, negative = we owe them).
create or replace function app.party_ledger(p_party uuid, p_from date, p_to date)
returns table (entry_date date, entry_no text, source_type text, source_id uuid, account_code text, account_name text,
               description text, debit numeric, credit numeric, running_balance numeric)
language sql stable as $$
  with scope as (
    select l.*, e.entry_date, e.entry_no, e.source_type, e.source_id, e.description as entry_description, a.code, a.name
      from journal_lines l join journal_entries e on e.id = l.entry_id join gl_accounts a on a.id = l.account_id
     where l.party_id = p_party and a.category in ('asset_receivable', 'liability_payable', 'liability_current')),
  opening as (select coalesce(sum(debit - credit), 0) as bal from scope where entry_date < p_from)
  select s.entry_date, s.entry_no, s.source_type, s.source_id, s.code, s.name, coalesce(nullif(s.memo, ''), s.entry_description),
         s.debit, s.credit,
         (select bal from opening) + sum(s.debit - s.credit) over (order by s.entry_date, s.entry_no, s.line_no rows between unbounded preceding and current row)
    from scope s
   where s.entry_date between p_from and p_to
   order by s.entry_date, s.entry_no, s.line_no
$$;

create or replace function app.party_opening(p_party uuid, p_from date) returns numeric
language sql stable as $$
  select coalesce(sum(l.debit - l.credit), 0)
    from journal_lines l join journal_entries e on e.id = l.entry_id join gl_accounts a on a.id = l.account_id
   where l.party_id = p_party and e.entry_date < p_from and a.category in ('asset_receivable', 'liability_payable', 'liability_current')
$$;
