-- 0014: file attachments (CNIC copies, registry papers, cheque images, signed agreements…).
-- Files up to 7 MB are kept in the database itself, next to the record they belong to: they are isolated per company by the
-- same row-level security, backed up with everything else, and need no extra service or key. The list queries read only
-- the small metadata table; the bytes are in a separate table that is read one file at a time.

create table attachments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  entity_type text not null check (entity_type in ('party','property','project','booking','voucher','contract','cheque','quotation','lead','employee','construction_contract')),
  entity_id   uuid not null,
  file_name   text not null check (btrim(file_name) <> ''),
  mime        text not null,
  size_bytes  int not null check (size_bytes between 1 and 7340032),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  category    text,
  note        text,
  uploaded_by uuid references users(id),
  created_at  timestamptz not null default now()
);
create index attachments_entity_idx on attachments (company_id, entity_type, entity_id, created_at desc);
select app.enable_tenant_rls('attachments');
select app.attach_audit('attachments');

create table attachment_blobs (
  attachment_id uuid primary key references attachments(id) on delete cascade,
  company_id    uuid not null references companies(id),
  content       bytea not null
);
select app.enable_tenant_rls('attachment_blobs');
select app.add_tenant_fk('attachment_blobs', 'attachment_id', 'attachments');

-- the bytes must be exactly as long as the metadata says
create or replace function app.check_blob_size() returns trigger language plpgsql as $$
declare v_size int;
begin
  select size_bytes into v_size from attachments where id = new.attachment_id;
  if octet_length(new.content) <> v_size then raise exception 'The file arrived incomplete' using errcode = '23514'; end if;
  return new;
end $$;
create trigger attachment_blobs_size before insert on attachment_blobs for each row execute function app.check_blob_size();
