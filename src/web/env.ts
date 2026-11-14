import { MIN_FEED_KEY_LENGTH } from "../intel/feed-signature.js";
import { createStaticAuth, createSupabaseAuth } from "./auth.js";
import { DEFAULT_QUOTA, type HandlerOptions, type MailSettings } from "./handler.js";
import { createBrevoMailer, createMemoryMailer, createStaticDirectory, createSupabaseDirectory } from "./mail.js";
import { parseGitHubRepoUrl } from "./github-url.js";
import { validAppKey, type GitHubAppConfig } from "./github-app.js";
import { createMemoryStore, createSupabaseStore } from "./store.js";

/**
 * Builds the handler options from environment variables, the one place the
 * Vercel functions and the local server read configuration. Nothing here is
 * logged; keys stay inside the returned closures.
 *
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *                              production: Supabase Auth + Postgres store
 *   GATESEEKER_AUTH_STUB=1     local/e2e: fixed token "e2e-token", memory store (ignored when SUPABASE_URL is set)
 *   GATESEEKER_SCAN_LIMIT      analyses per user per hour (default 10)
 *   GATESEEKER_EXAMPLE_REPO    public GitHub URL behind "Try an example" and GET /api/example (default: this project)
 *   GATESEEKER_ADMIN_LOGINS    comma-separated GitHub logins that may read GET /api/funnel (product counters)
 *   GITHUB_TOKEN               optional read-only token for the GitHub API limit
 *   GATESEEKER_FEED_KEY        HMAC key shared with the feed workflow (32+ characters); without it only the bundled advisory set is used
 *   GATESEEKER_EMAIL_KEY       key of the unsubscribe links (32+ characters); without it no email is sent
 *   BREVO_API_KEY, GATESEEKER_EMAIL_FROM
 *                              email provider and sender address; without them nothing is sent (unsubscribe links still work)
 *   GATESEEKER_PUBLIC_URL      the site's address for links in emails (default https://gateseeker.vercel.app)
 *   GATESEEKER_EMAIL_DAILY_CAP emails per UTC day (default 250, at most 300: Brevo's free plan)
 *   GATESEEKER_GITHUB_APP_ID, GATESEEKER_GITHUB_APP_SLUG, GATESEEKER_GITHUB_APP_KEY
 *                              the GitHub App that reads private repositories (docs/SPRINT_8.md); all three or the feature is off
 *   GATESEEKER_GITHUB_API, GATESEEKER_GITHUB_ARCHIVE, GATESEEKER_GITHUB_WEB, GATESEEKER_OSV_ENDPOINT, GATESEEKER_PACKAGIST_BASE
 *                              upstream overrides (tests point them at stubs)
 */

export type Env = Record<string, string | undefined>;

/** What the page needs to sign users in; the anon key is public by design. */
export type AuthConfig = { mode: "supabase"; url: string; anonKey: string } | { mode: "stub"; token: string } | { mode: "none" };

export const STUB_TOKEN = "e2e-token";
export const STUB_USER = { id: "00000000-0000-4000-8000-00000000e2e0", login: "e2e-user" };

export function authConfigFromEnv(env: Env): AuthConfig {
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) return { mode: "supabase", url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY };
  if (env.GATESEEKER_AUTH_STUB === "1") return { mode: "stub", token: STUB_TOKEN };
  return { mode: "none" };
}

/** The repository behind the analyze view's "Try an example"; GATESEEKER_EXAMPLE_REPO when it is a valid public GitHub URL. */
export const DEFAULT_EXAMPLE_REPO = "https://github.com/gateseeker-dev/gateseeker";

export function exampleRepoFromEnv(env: Env): string {
  const raw = env.GATESEEKER_EXAMPLE_REPO;
  return raw !== undefined && parseGitHubRepoUrl(raw).ok ? raw.trim() : DEFAULT_EXAMPLE_REPO;
}

/** GitHub logins (case-insensitive, stored lower-case) allowed to read the product counters. */
export function adminLoginsFromEnv(env: Env): string[] {
  return (env.GATESEEKER_ADMIN_LOGINS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[A-Za-z0-9-]{1,39}$/.test(x));
}

/**
 * The GitHub App from the environment, or null (feature off) when a variable
 * is missing or the key does not parse. A present but unusable key is reported
 * on stderr once, so a deploy with a mangled key is noticed instead of
 * silently analyzing public repositories only.
 */
export function githubAppFromEnv(env: Env, fetchFn?: typeof fetch): GitHubAppConfig | null {
  const appId = env.GATESEEKER_GITHUB_APP_ID?.trim() ?? "";
  const slug = env.GATESEEKER_GITHUB_APP_SLUG?.trim() ?? "";
  // Vercel keeps the PEM's line breaks; a key pasted with literal "\n" is accepted too.
  const privateKey = (env.GATESEEKER_GITHUB_APP_KEY ?? "").replace(/\\n/g, "\n").trim();
  if (!appId && !slug && !privateKey) return null;
  if (!/^\d{1,12}$/.test(appId) || !/^[A-Za-z0-9-]{1,64}$/.test(slug) || !validAppKey(privateKey)) {
    console.error("gateseeker: GATESEEKER_GITHUB_APP_ID, GATESEEKER_GITHUB_APP_SLUG and GATESEEKER_GITHUB_APP_KEY must all be set and valid; private repositories are off.");
    return null;
  }
  return {
    appId,
    slug,
    privateKey,
    ...(env.GATESEEKER_GITHUB_API ? { apiBase: env.GATESEEKER_GITHUB_API } : {}),
    ...(env.GATESEEKER_GITHUB_WEB ? { webBase: env.GATESEEKER_GITHUB_WEB } : {}),
    ...(fetchFn ? { fetch: fetchFn } : {}),
  };
}

export const DEFAULT_PUBLIC_URL = "https://gateseeker.vercel.app";
export const DEFAULT_EMAIL_DAILY_CAP = 250;
/** Key of the unsubscribe links in local runs and browser tests (stub sign-in only). */
export const STUB_EMAIL_KEY = "stub-email-key-for-local-runs-only-000";
export const STUB_EMAIL = "e2e-user@example.test";

/** GATESEEKER_PUBLIC_URL when it is https (or http on localhost), without a trailing slash. */
export function publicUrlFromEnv(env: Env, fallback = DEFAULT_PUBLIC_URL): string {
  try {
    const u = new URL(env.GATESEEKER_PUBLIC_URL ?? "");
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol === "https:" || (local && u.protocol === "http:")) return u.origin;
  } catch {
    /* not set or not a URL */
  }
  return fallback;
}

function dailyCapFromEnv(env: Env): number {
  const n = Number(env.GATESEEKER_EMAIL_DAILY_CAP ?? "");
  return Number.isInteger(n) && n > 0 && n <= 300 ? n : DEFAULT_EMAIL_DAILY_CAP;
}

const SENDER = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[A-Za-z]{2,24}$/;

export interface EnvHandlerOptions {
  env: Env;
  workDir?: string;
  fetch?: typeof fetch;
  /**
   * Fail closed: when true and no auth is configured (neither Supabase nor
   * the stub), the handlers refuse every request instead of serving
   * anonymously. The Vercel functions set it; the local server does not.
   */
  requireAuth?: boolean;
}

export function handlerOptionsFromEnv({ env, workDir, fetch: fetchFn, requireAuth }: EnvHandlerOptions): HandlerOptions {
  const limit = Number(env.GATESEEKER_SCAN_LIMIT ?? "");
  const quota = Number.isInteger(limit) && limit > 0 ? { limit, windowSeconds: DEFAULT_QUOTA.windowSeconds } : DEFAULT_QUOTA;
  const scan: HandlerOptions["scan"] = {
    ...(env.GATESEEKER_OSV_ENDPOINT ? { osv: { endpoint: env.GATESEEKER_OSV_ENDPOINT } } : {}),
    ...(env.GATESEEKER_PACKAGIST_BASE ? { packagist: { base: env.GATESEEKER_PACKAGIST_BASE } } : {}),
  };
  const base: HandlerOptions = {
    quota,
    scan,
    ...(workDir ? { workDir } : {}),
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(env.GATESEEKER_GITHUB_API ? { apiBase: env.GATESEEKER_GITHUB_API } : {}),
    ...(env.GATESEEKER_GITHUB_ARCHIVE ? { archiveBase: env.GATESEEKER_GITHUB_ARCHIVE } : {}),
    ...(env.GITHUB_TOKEN ? { githubToken: env.GITHUB_TOKEN } : {}),
    exampleRepo: exampleRepoFromEnv(env),
    adminLogins: adminLoginsFromEnv(env),
    ...(() => { const app = githubAppFromEnv(env, fetchFn); return app ? { githubApp: app } : {}; })(),
    // A short key is ignored rather than trusted: published sets are then not used and the reports say "bundled".
    ...(env.GATESEEKER_FEED_KEY && env.GATESEEKER_FEED_KEY.length >= MIN_FEED_KEY_LENGTH ? { feedKey: env.GATESEEKER_FEED_KEY } : {}),
  };
  const auth = authConfigFromEnv(env);
  if (auth.mode === "supabase") {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required when SUPABASE_URL is set.");
    const emailKey = env.GATESEEKER_EMAIL_KEY ?? "";
    const from = env.GATESEEKER_EMAIL_FROM?.trim() ?? "";
    const mail: MailSettings | null =
      emailKey.length >= 32
        ? {
            mailer: env.BREVO_API_KEY && SENDER.test(from) ? createBrevoMailer({ apiKey: env.BREVO_API_KEY, from: { email: from, name: "Gateseeker" }, ...(fetchFn ? { fetch: fetchFn } : {}) }) : null,
            directory: createSupabaseDirectory({ url: auth.url, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, ...(fetchFn ? { fetch: fetchFn } : {}) }),
            key: emailKey,
            baseUrl: publicUrlFromEnv(env),
            dailyCap: dailyCapFromEnv(env),
          }
        : null;
    return {
      ...base,
      auth: createSupabaseAuth({ url: auth.url, anonKey: auth.anonKey, ...(fetchFn ? { fetch: fetchFn } : {}) }),
      store: createSupabaseStore({ url: auth.url, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, ...(fetchFn ? { fetch: fetchFn } : {}) }),
      ...(mail ? { mail } : {}),
    };
  }
  if (auth.mode === "stub") {
    // Local runs and browser tests: emails go to an in-memory outbox (GET /api/dev/outbox on the local server), never out.
    const mail: MailSettings = { mailer: createMemoryMailer(), directory: createStaticDirectory({ [STUB_USER.id]: STUB_EMAIL }), key: STUB_EMAIL_KEY, baseUrl: publicUrlFromEnv(env, "http://localhost:4320"), dailyCap: dailyCapFromEnv(env) };
    return { ...base, auth: createStaticAuth({ [STUB_TOKEN]: STUB_USER }), store: createMemoryStore(), mail };
  }
  if (requireAuth) return { ...base, auth: createStaticAuth({}), store: createMemoryStore(), closed: true };
  return base;
}
