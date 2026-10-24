-- 0011: a small company has one person who prepares AND approves. Like vouchers (0004), budget and revision approval
-- honours a company setting. It is ON by default (so an owner is never locked out); a company that wants a second pair of
-- eyes turns "budget_self_approval" off in its settings, and the rule then applies exactly as before.

do $$
declare r record;
begin
  for r in select conrelid::regclass as tbl, conname from pg_constraint
            where contype = 'c' and conrelid in ('budgets'::regclass, 'budget_revisions'::regclass)
              and (pg_get_constraintdef(oid) like '%approved_by <> created_by%' or pg_get_constraintdef(oid) like '%approved_by <> requested_by%') loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

create or replace function app.self_approval_allowed(p_company uuid) returns boolean language sql stable as $$
  select coalesce((select (settings ->> 'budget_self_approval')::boolean from companies where id = p_company), true)
$$;

-- the same rule, now also at the table level so no path can skip it
create or replace function app.guard_budget_approver() returns trigger language plpgsql as $$
begin
  if new.approved_by is not null and new.approved_by is not distinct from new.created_by and not app.self_approval_allowed(new.company_id) then
    raise exception 'Maker-checker: the creator cannot approve their own budget' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger budgets_approver_guard before insert or update on budgets for each row execute function app.guard_budget_approver();

create or replace function app.guard_revision_approver() returns trigger language plpgsql as $$
begin
  if new.approved_by is not null and new.approved_by is not distinct from new.requested_by and not app.self_approval_allowed(new.company_id) then
    raise exception 'Maker-checker: the requester cannot approve their own revision' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger budget_revisions_approver_guard before insert or update on budget_revisions for each row execute function app.guard_revision_approver();

create or replace function app.approve_budget(p_budget uuid, p_approver uuid) returns void
language plpgsql as $$
declare b budgets;
begin
  select * into b from budgets where id = p_budget for update;
  if not found then raise exception 'Budget not found'; end if;
  if b.status <> 'submitted' then raise exception 'Only a submitted budget can be approved (this one is %)', b.status using errcode = '55000'; end if;
  if b.total_amount <= 0 then raise exception 'A budget needs at least one line with an amount before approval' using errcode = '23514'; end if;
  if p_approver = b.created_by and not app.self_approval_allowed(b.company_id) then raise exception 'Maker-checker: the creator cannot approve their own budget' using errcode = '42501'; end if;
  update budgets set status = 'approved', approved_by = p_approver, approved_at = now() where id = p_budget;
  insert into budget_snapshots (company_id, budget_id, version_no, reason, data)
  select b.company_id, b.id, b.version_no, 'Approved',
         (select jsonb_agg(jsonb_build_object('line_no', line_no, 'category', category, 'amount', budget_amount) order by line_no) from budget_lines where budget_id = p_budget);
end $$;

create or replace function app.approve_budget_revision(p_revision uuid, p_approver uuid) returns void
language plpgsql as $$
declare r budget_revisions; v_sum numeric; l record; v_old numeric; v_new numeric; v_diff numeric;
begin
  select * into r from budget_revisions where id = p_revision for update;
  if not found then raise exception 'Revision not found'; end if;
  if r.status <> 'pending' then raise exception 'Revision is already %', r.status using errcode = '55000'; end if;
  if r.requested_by is not null and r.requested_by = p_approver and not app.self_approval_allowed(r.company_id) then
    raise exception 'Maker-checker: the requester cannot approve their own revision' using errcode = '42501';
  end if;
  select coalesce(sum(delta_amount), 0) into v_sum from budget_revision_lines where revision_id = p_revision;
  if r.type = 'reallocation' and v_sum <> 0 then raise exception 'A reallocation must net to zero (net %)', v_sum using errcode = '23514'; end if;
  if r.type = 'supplementary' and v_sum <= 0 then raise exception 'A supplementary revision must add budget' using errcode = '23514'; end if;

  perform set_config('app.budget_revision', 'on', true);
  for l in select rl.budget_line_id, rl.delta_amount from budget_revision_lines rl where rl.revision_id = p_revision loop
    select budget_amount into v_old from budget_lines where id = l.budget_line_id;
    v_new := v_old + l.delta_amount;
    if v_new < 0 then raise exception 'A revision cannot take a line below zero' using errcode = '23514'; end if;
    update budget_lines set budget_amount = v_new where id = l.budget_line_id;
    if v_old > 0 and exists (select 1 from budget_line_periods where budget_line_id = l.budget_line_id) then
      update budget_line_periods set amount = round(amount * v_new / v_old, 2) where budget_line_id = l.budget_line_id;
      select v_new - sum(amount) into v_diff from budget_line_periods where budget_line_id = l.budget_line_id;
      update budget_line_periods set amount = amount + v_diff
       where id = (select id from budget_line_periods where budget_line_id = l.budget_line_id order by amount desc, id limit 1);
    end if;
  end loop;
  perform set_config('app.budget_revision', 'off', true);

  update budget_revisions set status = 'approved', approved_by = p_approver, approved_at = now(), delta_amount = v_sum where id = p_revision;
  update budgets set version_no = version_no + 1 where id = r.budget_id;
  insert into budget_snapshots (company_id, budget_id, version_no, reason, data)
  select r.company_id, r.budget_id, b.version_no, r.type || ': ' || r.reason,
         (select jsonb_agg(jsonb_build_object('line_no', line_no, 'category', category, 'amount', budget_amount) order by line_no) from budget_lines where budget_id = r.budget_id)
    from budgets b where b.id = r.budget_id;
end $$;
