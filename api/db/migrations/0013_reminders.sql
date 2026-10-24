-- 0013: collection reminders (a log of who was chased, how and when) and an activity trail for team changes.

create table reminder_log (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  booking_id     uuid not null references bookings(id),
  installment_id uuid references installments(id),
  party_id       uuid not null references parties(id),
  channel        text not null check (channel in ('whatsapp','sms','call','email','visit')),
  message        text,
  sent_by        uuid references users(id),
  sent_at        timestamptz not null default now()
);
create index reminder_log_booking_idx on reminder_log (booking_id, sent_at desc);
select app.enable_tenant_rls('reminder_log');
select app.add_tenant_fk('reminder_log', 'booking_id', 'bookings');
select app.add_tenant_fk('reminder_log', 'installment_id', 'installments');
select app.add_tenant_fk('reminder_log', 'party_id', 'parties');

-- who was invited, who joined, whose role changed
select app.attach_audit('company_invites');
select app.attach_audit('company_members');
