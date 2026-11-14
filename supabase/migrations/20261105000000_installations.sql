-- Sprint 8: GitHub App installations bound to accounts (docs/SPRINT_8.md 3.3).
-- One row per (account, installation): the installation number and whose
-- GitHub account or organization it is. Nothing here grants access by itself;
-- the service asks GitHub for a one-hour token per analysis and never stores
-- it. Written and read only by the service with the service_role key; RLS on,
-- no policies, like every other table.

create table public.installations (
  user_id         uuid not null references auth.users (id) on delete cascade,
  installation_id bigint not null,
  account_login   text not null,
  account_type    text not null check (account_type in ('User', 'Organization')),
  created_at      timestamptz not null default now(),
  primary key (user_id, installation_id)
);
create index installations_user_idx on public.installations (user_id);
alter table public.installations enable row level security;

-- The overview gains the number of bound installations.
create or replace function public.admin_overview()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'accounts',       (select count(*) from public.accounts),
    'active_7',       (select count(*) from public.accounts where last_seen  >= now() - interval '7 days'),
    'active_30',      (select count(*) from public.accounts where last_seen  >= now() - interval '30 days'),
    'new_7',          (select count(*) from public.accounts where first_seen >= now() - interval '7 days'),
    'new_30',         (select count(*) from public.accounts where first_seen >= now() - interval '30 days'),
    'scans_7',        (select count(*) from public.scans    where created_at >= now() - interval '7 days'),
    'scans_30',       (select count(*) from public.scans    where created_at >= now() - interval '30 days'),
    'follows',        (select count(*) from public.follows  where paused_reason is null),
    'shared_reports', (select count(*) from public.reports  where public),
    'installations',  (select count(*) from public.installations)
  );
$$;
revoke all on function public.admin_overview() from public, anon, authenticated;

-- Two counters for the authorization flow.
alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'login_view', 'login_start', 'signin_complete',
  'rescan_complete', 'rescan_incomplete', 'rescan_failed',
  'email_follow_confirm', 'email_alert', 'email_paused', 'email_capped', 'email_failed',
  'email_click', 'unsubscribe',
  'example_view', 'public_report_view',
  'update_banner_shown', 'update_banner_reload',
  'github_install_start', 'github_install_done'
));
