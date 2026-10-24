-- 0012: extra user seats. Every plan includes some seats; more are bought as monthly packs (3, 5 or 10 seats) and
-- recorded here by PropIQ support. The API reads the number through a small definer function (it may not read
-- organizations directly), and adds it to the plan's included seats.

alter table organizations add column extra_seats int not null default 0 check (extra_seats >= 0);

create or replace function app.company_extra_seats(p_company uuid) returns int
language sql stable security definer set search_path = public, app as $$
  select o.extra_seats from companies c join organizations o on o.id = c.org_id where c.id = p_company
$$;
