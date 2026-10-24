-- The login the running API uses. It owns nothing and cannot bypass row-level security, so every query it runs is
-- confined to the company the request named. Applied after every migration; safe to run repeatedly.
--
-- Supabase: this role is created without a login. Give it one (and a long random password) once, in the SQL editor:
--     alter role propiq_app login password '<generated>';
-- then point DATABASE_URL at the pooler (transaction mode) with that user. Never use the `postgres` owner login
-- for the API: it can see every company.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'propiq_app') then
    create role propiq_app nologin noinherit nobypassrls;
  end if;
end $$;

grant usage on schema public, app to propiq_app;
grant select, insert, update, delete on all tables in schema public to propiq_app;
grant usage, select on all sequences in schema public to propiq_app;
grant execute on all functions in schema app to propiq_app;

-- rule tables the API reads but must never rewrite
revoke insert, update, delete on state_transitions from propiq_app;
revoke insert, update, delete on banks from propiq_app;                 -- the bank catalog is shared by every company
-- the migration ledger belongs to the owner alone: the API must not read or alter it
revoke all on schema_migrations from propiq_app;

-- Supabase publishes the `public` schema through its own REST API to the `anon` and `authenticated` roles.
-- PropIQ is reached only through our API, so close that door completely (row-level security would also say "no",
-- but a second lock is cheap). In the dashboard also turn the Data API off for this project if you do not use it.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all functions in schema public from anon;
    revoke all on all functions in schema app from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all functions in schema public from authenticated;
    revoke all on all functions in schema app from authenticated;
  end if;
end $$;
