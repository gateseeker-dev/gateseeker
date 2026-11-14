-- Security fix (2026-11-14): until today, binding a GitHub App installation to
-- an account checked only that the account had started an install flow, not
-- that the installation was the person's own. The service now binds only the
-- App installed on the account's own GitHub user (verified identity), so every
-- binding made before is removed here and checked again on the next
-- "Allow access on GitHub". Nothing on GitHub changes: the App stays installed
-- and the repositories stay selected; people click the button once more.
-- Followed private repositories pause with "access revoked" until then.

delete from public.installations;
