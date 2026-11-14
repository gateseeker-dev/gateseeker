-- Optional public link for a saved report (growth round, 2026-11-04).
-- The owner shares a report from its page; anyone with /p/<id> then reads
-- the stored body, which was redacted before it was saved (secrets never
-- reach the store). Still written and read only by the service with the
-- service_role key; RLS on, no policies, like every other table.

alter table public.reports add column if not exists public boolean not null default false;
create index if not exists reports_public_idx on public.reports (id) where public;

-- Two more aggregate counters for the page: the live example opened by a
-- signed-out visitor, and a shared report opened by its link.
alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'login_view', 'login_start', 'signin_complete',
  'rescan_complete', 'rescan_incomplete', 'rescan_failed',
  'email_follow_confirm', 'email_alert', 'email_paused', 'email_capped', 'email_failed',
  'email_click', 'unsubscribe',
  'example_view', 'public_report_view'
));
