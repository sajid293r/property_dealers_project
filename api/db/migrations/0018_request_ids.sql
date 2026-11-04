-- 0018: QA fixes, group 2 — BUG-006 (a very fast double-click, or a retry after a slow answer, created two receipts).
--
-- Every money-creating screen now sends a request id (Idempotency-Key header). The first request with an id does the work
-- and remembers which record it made, in the same transaction; a repeat with the same id returns that record and does
-- nothing. Same id with different details is refused (a form was changed and re-sent, which is a new request and needs
-- a new id). A request that fails leaves nothing behind, so it can simply be sent again. Ids older than 14 days are
-- swept away as new ones arrive. (Bookings keep their own idempotency column; see app.create_booking.)

create table idempotency_keys (
  company_id   uuid not null references companies(id),
  key          text not null check (length(key) between 8 and 120),
  scope        text not null,                  -- what kind of request: 'receipt', 'voucher', 'refund:<booking>' ...
  request_hash text not null,                  -- fingerprint of the request body: the same id must mean the same request
  resource_id  uuid,                           -- the record the first request made (or acted on)
  created_at   timestamptz not null default now(),
  primary key (company_id, key)
);
create index idempotency_keys_created_idx on idempotency_keys (created_at);
select app.enable_tenant_rls('idempotency_keys');

-- Claim a request id. replay = false: first time, go ahead (and call finish_idempotency with the record you made).
-- replay = true: this request already ran; resource_id is what it made.
create or replace function app.claim_idempotency(p_key text, p_scope text, p_hash text)
returns table (replay boolean, resource_id uuid) language plpgsql as $$
declare v_co uuid := app.current_company(); r idempotency_keys;
begin
  if p_key is null then return query select false, null::uuid; return; end if;
  if random() < 0.02 then
    delete from idempotency_keys k where k.company_id = v_co and k.created_at < now() - interval '14 days';
  end if;
  -- a second request with the same id waits here for the first one to commit, then sees its row
  insert into idempotency_keys as k (company_id, key, scope, request_hash) values (v_co, p_key, p_scope, p_hash)
    on conflict (company_id, key) do nothing;
  if found then return query select false, null::uuid; return; end if;
  select * into r from idempotency_keys k where k.company_id = v_co and k.key = p_key;
  if r.scope <> p_scope or r.request_hash <> p_hash then
    raise exception 'This request was already sent with different details. Close the form and start again.' using errcode = '55000';
  end if;
  if r.resource_id is null then
    raise exception 'This request is still being processed. Please wait a moment.' using errcode = '55000';
  end if;
  return query select true, r.resource_id;
end $$;

create or replace function app.finish_idempotency(p_key text, p_resource uuid) returns void language plpgsql as $$
begin
  if p_key is null then return; end if;
  update idempotency_keys set resource_id = p_resource where company_id = app.current_company() and key = p_key and resource_id is null;
end $$;
