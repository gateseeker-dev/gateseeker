# Supabase schema

`migrations/` holds the SQL the hosted service needs, in order. The PO applies each file once in the Supabase SQL editor; nothing here runs automatically.

`verify_schema.sql` is a read-only check (catalog SELECTs only) to run in the same editor after applying a migration, or after running SQL by mistake: it lists missing tables, columns, indexes and functions, RLS turned off, and any policy, trigger, table or function no migration created. All rows `ok` means the database matches `migrations/`. Update its expected lists in the same change that adds a migration.

Rules:

- Every table has row level security enabled and no policies: the browser never reads these tables, only the Vercel function with the service_role key does (the service role bypasses RLS).
- Keys never live in this repository. They are entered as Vercel environment variables by the PO.
- `reports` rows expire (`expires_at`, 30 days); the daily cron `/api/cron/cleanup` deletes them and keeps the free project from pausing for inactivity.
