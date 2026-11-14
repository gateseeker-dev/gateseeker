-- Sprint 9: where signed-out visits come from (docs/SPRINT_9.md).
-- Eight aggregate counters, one per kind of site in a closed list (direct,
-- search, github, hn, reddit, x, linkedin, other), counted at most once per
-- browser tab. Like every counter: one row per UTC day and kind, no user, IP,
-- user agent or address. Run once in the Supabase SQL editor.

alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'login_view', 'login_start', 'signin_complete',
  'rescan_complete', 'rescan_incomplete', 'rescan_failed',
  'email_follow_confirm', 'email_alert', 'email_paused', 'email_capped', 'email_failed',
  'email_click', 'unsubscribe',
  'example_view', 'public_report_view',
  'update_banner_shown', 'update_banner_reload',
  'github_install_start', 'github_install_done',
  'visit_direct', 'visit_search', 'visit_github', 'visit_hn', 'visit_reddit', 'visit_x', 'visit_linkedin', 'visit_other'
));
