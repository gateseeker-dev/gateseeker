-- Read-only check of the Gateseeker schema against supabase/migrations/.
-- Paste into the Supabase SQL editor and run. It changes nothing: only
-- SELECTs on the catalog. Problems come first; an all-"ok" result means the
-- database matches the six migrations (init .. email).
--
-- status values: ok | MISSING | RLS OFF | UNEXPECTED | CHANGED | EXPOSED

with
expected_tables(t) as (values
  ('reports'), ('scan_quota'), ('waitlist'), ('events'), ('scans'), ('follows'), ('feed_sets'), ('email_quota')
),
expected_columns(t, c) as (values
  ('reports','id'), ('reports','user_id'), ('reports','owner'), ('reports','repo'), ('reports','ref'), ('reports','sha'),
  ('reports','cached_from'), ('reports','body'), ('reports','created_at'), ('reports','expires_at'),
  ('scan_quota','user_id'), ('scan_quota','window_start'), ('scan_quota','used'),
  ('waitlist','id'), ('waitlist','email'), ('waitlist','wants'), ('waitlist','user_id'), ('waitlist','created_at'),
  ('events','day'), ('events','kind'), ('events','count'),
  ('scans','id'), ('scans','user_id'), ('scans','owner'), ('scans','repo'), ('scans','sha'), ('scans','verdict'),
  ('scans','p1'), ('scans','p2'), ('scans','p3'), ('scans','p4'), ('scans','report_id'), ('scans','created_at'),
  ('follows','id'), ('follows','user_id'), ('follows','owner'), ('follows','repo'), ('follows','created_at'),
  ('follows','last_scan_at'), ('follows','last_report_id'), ('follows','last_verdict'), ('follows','last_new_urgent'),
  ('follows','failures'), ('follows','paused_reason'), ('follows','ecosystems'), ('follows','queued_at'),
  ('follows','pending_alert'), ('follows','last_alert_at'),
  ('feed_sets','id'), ('feed_sets','published_at'), ('feed_sets','digest'), ('feed_sets','payload'),
  ('feed_sets','signature'), ('feed_sets','created_at'),
  ('email_quota','day'), ('email_quota','sent')
),
expected_indexes(i) as (values
  ('reports_cache_idx'), ('reports_user_idx'), ('reports_expires_idx'), ('waitlist_email_idx'),
  ('scans_user_idx'), ('scans_user_repo_idx'), ('scans_created_idx'),
  ('follows_due_idx'), ('follows_queued_idx'), ('feed_sets_latest_idx')
),
expected_functions(sig) as (values
  ('public.claim_scan(uuid,integer,integer)'),
  ('public.count_event(text)'),
  ('public.follow_repo(uuid,text,text,integer)'),
  ('public.claim_email(integer)')
),
checks(problem, item, status, detail) as (
  -- Tables exist with row level security on.
  select c.oid is null or not c.relrowsecurity, 'table ' || e.t,
         case when c.oid is null then 'MISSING' when c.relrowsecurity then 'ok' else 'RLS OFF' end,
         case when c.oid is null or c.reltuples < 0 then '' else c.reltuples::bigint || ' rows (estimate)' end
  from expected_tables e
  left join pg_class c on c.oid = to_regclass('public.' || e.t)

  union all
  -- Columns the code reads and writes.
  select true, 'column ' || e.t || '.' || e.c, 'MISSING', ''
  from expected_columns e
  where to_regclass('public.' || e.t) is not null
    and not exists (select 1 from information_schema.columns ic
                    where ic.table_schema = 'public' and ic.table_name = e.t and ic.column_name = e.c)

  union all
  -- Columns someone else's script added to our tables.
  select true, 'column ' || ic.table_name || '.' || ic.column_name, 'UNEXPECTED', ic.data_type
  from information_schema.columns ic
  join expected_tables e on e.t = ic.table_name
  where ic.table_schema = 'public'
    and not exists (select 1 from expected_columns x where x.t = ic.table_name and x.c = ic.column_name)

  union all
  -- The model is "RLS on, no policies": any policy opens a table to the browser roles.
  select true, 'policy ' || p.tablename || '.' || p.policyname, 'UNEXPECTED', p.cmd || ' to ' || array_to_string(p.roles, ',')
  from pg_policies p
  where p.schemaname = 'public'

  union all
  -- Tables, views and sequences in public that no migration created.
  select true, 'relation public.' || c.relname, 'UNEXPECTED',
         case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'materialized view' when 'p' then 'partitioned table' else c.relkind::text end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'v', 'm', 'p')
    and c.relname not in (select t from expected_tables)
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')

  union all
  select to_regclass('public.' || e.i) is null, 'index ' || e.i,
         case when to_regclass('public.' || e.i) is null then 'MISSING' else 'ok' end, ''
  from expected_indexes e

  union all
  -- Functions: present, security definer, and not callable by anon/authenticated.
  select f.oid is null or not f.prosecdef or has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute'),
         'function ' || e.sig,
         case when f.oid is null then 'MISSING'
              when has_function_privilege('anon', f.oid, 'execute') or has_function_privilege('authenticated', f.oid, 'execute') then 'EXPOSED'
              when not f.prosecdef then 'CHANGED'
              else 'ok' end,
         case when f.oid is null then '' when not f.prosecdef then 'not security definer' else '' end
  from expected_functions e
  left join pg_proc f on f.oid = to_regprocedure(e.sig)

  union all
  -- follow_repo must be the email-migration version (returns "created").
  select position('''created''' in pg_get_functiondef(f.oid)) = 0, 'function body follow_repo',
         case when position('''created''' in pg_get_functiondef(f.oid)) = 0 then 'CHANGED' else 'ok' end,
         'expects the version from 20261103000000_email.sql'
  from pg_proc f
  where f.oid = to_regprocedure('public.follow_repo(uuid,text,text,integer)')

  union all
  -- Supabase's "enable RLS automatically" option: rls_auto_enable() behind the
  -- event trigger ensure_rls, which turns RLS on for every new table. It agrees
  -- with our model, so it is expected when attached that way.
  select false, 'function public.rls_auto_enable()', 'ok', 'Supabase auto RLS (event trigger ensure_rls)'
  from pg_proc p
  join pg_event_trigger et on et.evtfoid = p.oid and et.evtname = 'ensure_rls'
  where p.oid = to_regprocedure('public.rls_auto_enable()')

  union all
  -- Other functions in public (another project's helpers, triggers, RPCs).
  select true, 'function ' || p.oid::regprocedure::text, 'UNEXPECTED',
         concat_ws('; ', case when p.prosecdef then 'security definer' end,
                   (select 'event trigger ' || string_agg(et.evtname || ' on ' || et.evtevent, ', ') from pg_event_trigger et where et.evtfoid = p.oid))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.oid not in (select to_regprocedure(sig)::oid from expected_functions where to_regprocedure(sig) is not null)
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and not exists (select 1 from pg_event_trigger et where et.evtfoid = p.oid and et.evtname = 'ensure_rls')

  union all
  -- The events kind list must include the counters added by the email migration.
  select position('unsubscribe' in pg_get_constraintdef(k.oid)) = 0, 'constraint events_kind_check',
         case when position('unsubscribe' in pg_get_constraintdef(k.oid)) = 0 then 'CHANGED' else 'ok' end, ''
  from pg_constraint k
  where k.conname = 'events_kind_check' and k.conrelid = to_regclass('public.events')

  union all
  -- Triggers: none of ours exist. One on auth.users runs on every GitHub
  -- sign-in and, if it fails, blocks the sign-in.
  select true, 'trigger ' || t.tgname || ' on ' || t.tgrelid::regclass::text, 'UNEXPECTED', pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and (n.nspname = 'public' or t.tgrelid = 'auth.users'::regclass)
)
select item, status, detail
from checks
order by problem desc, item;
