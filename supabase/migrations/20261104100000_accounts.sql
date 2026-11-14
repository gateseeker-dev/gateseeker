-- Sprint 7: accounts (last access) and the admin overview.
-- One row per account that used the service: login, first and last access
-- (granularity of 5 minutes, written by touch_account), nothing else. No IP,
-- user agent or page. Written and read only by the service with the
-- service_role key; RLS on, no policies, like every other table.

create table public.accounts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  login      text not null,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create index accounts_last_seen_idx on public.accounts (last_seen desc);
alter table public.accounts enable row level security;

-- Records an access; the row is updated at most once every 5 minutes.
create or replace function public.touch_account(p_user uuid, p_login text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.accounts (user_id, login, first_seen, last_seen)
    values (p_user, p_login, now(), now())
    on conflict (user_id) do update
      set login = excluded.login, last_seen = now()
      where public.accounts.last_seen < now() - interval '5 minutes';
$$;
revoke all on function public.touch_account(uuid, text) from public, anon, authenticated;

-- Totals for the admin overview.
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
    'shared_reports', (select count(*) from public.reports  where public)
  );
$$;
revoke all on function public.admin_overview() from public, anon, authenticated;

-- Accounts newest access first, with their counts; p_before pages by last_seen.
create or replace function public.admin_accounts(p_limit integer, p_before timestamptz)
returns table (user_id uuid, login text, first_seen timestamptz, last_seen timestamptz, scans bigint, follows bigint)
language sql
security definer
set search_path = public
as $$
  select a.user_id, a.login, a.first_seen, a.last_seen,
         (select count(*) from public.scans   s where s.user_id = a.user_id) as scans,
         (select count(*) from public.follows f where f.user_id = a.user_id and f.paused_reason is null) as follows
    from public.accounts a
   where p_before is null or a.last_seen < p_before
   order by a.last_seen desc
   limit least(greatest(p_limit, 1), 200);
$$;
revoke all on function public.admin_accounts(integer, timestamptz) from public, anon, authenticated;

-- Two counters for the update notice.
alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'login_view', 'login_start', 'signin_complete',
  'rescan_complete', 'rescan_incomplete', 'rescan_failed',
  'email_follow_confirm', 'email_alert', 'email_paused', 'email_capped', 'email_failed',
  'email_click', 'unsubscribe',
  'example_view', 'public_report_view',
  'update_banner_shown', 'update_banner_reload'
));
