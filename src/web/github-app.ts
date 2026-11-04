import { createHash, createHmac, createPrivateKey, sign, timingSafeEqual, type KeyObject } from "node:crypto";
import { z } from "zod";

/**
 * The GitHub App that reads private repositories (docs/SPRINT_8.md). Three
 * things, all without a dependency:
 *
 *   1. The App's JWT (RS256 over the App id, 10 minutes), signed with the
 *      private key from the environment. It identifies the App itself.
 *   2. Installation tokens: a JWT call asks GitHub for a token restricted to
 *      one installation and one repository, valid for one hour. The token is
 *      used for the metadata, the commit and the archive of one analysis and
 *      then forgotten: it is never stored, logged or returned.
 *   3. The `state` of the install link: HMAC-signed (account id, repository,
 *      expiry) so the account that comes back from GitHub's install screen
 *      can only bind installations it just authorized.
 *
 * `fetch` is injected; the tests sign with a key pair they generate.
 */

export interface GitHubAppConfig {
  appId: string;
  /** The App's public name in its URL (github.com/apps/<slug>). */
  slug: string;
  /** PEM private key (PKCS#1 or PKCS#8) from GATESEEKER_GITHUB_APP_KEY. */
  privateKey: string;
  apiBase?: string;
  /** Where the install screen lives (default https://github.com); the browser tests point it at the stub. */
  webBase?: string;
  fetch?: typeof fetch;
  now?: () => Date;
  userAgent?: string;
}

export interface InstallationAccount {
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
}

export interface AppFailure {
  ok: false;
  status: number;
  message: string;
}

const JWT_TTL_S = 600;
const STATE_TTL_MS = 15 * 60_000;
const UA = "gateseeker-web (+https://github.com/gateseeker-dev/gateseeker)";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Loads the key once per config object; a malformed key throws here, at startup, not inside a request. */
const keys = new WeakMap<GitHubAppConfig, KeyObject>();
function keyOf(cfg: GitHubAppConfig): KeyObject {
  let k = keys.get(cfg);
  if (!k) {
    k = createPrivateKey(cfg.privateKey);
    keys.set(cfg, k);
  }
  return k;
}

/** True when the key parses as an RSA private key; the environment reader uses it to switch the feature off loudly. */
export function validAppKey(pem: string): boolean {
  try {
    return createPrivateKey(pem).asymmetricKeyType === "rsa";
  } catch {
    return false;
  }
}

/** The App's JWT: issued a minute in the past (clock skew), valid 10 minutes. */
export function appJwt(cfg: GitHubAppConfig): string {
  const now = Math.floor((cfg.now ?? (() => new Date()))().getTime() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now - 60 + JWT_TTL_S, iss: cfg.appId }));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), keyOf(cfg)).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

// --- the install link's state ------------------------------------------------

function stateKey(cfg: GitHubAppConfig): Buffer {
  // Derived from the private key, so no second secret is needed; the key itself never leaves the process.
  return createHash("sha256").update("gateseeker-install-state").update(cfg.privateKey).digest();
}

/** `state` for the install link: who asked, for which repository ("owner/name" or ""), until when. */
export function signState(cfg: GitHubAppConfig, userId: string, repo: string): string {
  const exp = (cfg.now ?? (() => new Date()))().getTime() + STATE_TTL_MS;
  const body = b64url(JSON.stringify({ u: userId, r: repo, e: exp }));
  const mac = createHmac("sha256", stateKey(cfg)).update(body).digest("base64url");
  return `${body}.${mac}`;
}

const stateSchema = z.object({ u: z.string().min(1), r: z.string().max(260), e: z.number().int() });

/** Used states of this instance: a state binds once (best effort across instances; the binding itself is idempotent). */
const consumed = new Set<string>();

export type StateCheck = { ok: true; repo: string } | { ok: false; reason: "malformed" | "signature" | "expired" | "account" | "used" };

/** Verifies a state for the account that presents it and consumes it. */
export function verifyState(cfg: GitHubAppConfig, state: string, userId: string): StateCheck {
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || state.length > 1024) return { ok: false, reason: "malformed" };
  const [body, mac] = parts as [string, string];
  const expected = createHmac("sha256", stateKey(cfg)).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  let parsed;
  try {
    parsed = stateSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!parsed.success) return { ok: false, reason: "malformed" };
  if (parsed.data.e < (cfg.now ?? (() => new Date()))().getTime()) return { ok: false, reason: "expired" };
  if (parsed.data.u !== userId) return { ok: false, reason: "account" };
  if (consumed.has(mac)) return { ok: false, reason: "used" };
  consumed.add(mac);
  if (consumed.size > 10_000) consumed.clear();
  return { ok: true, repo: parsed.data.r };
}

/** Tests only. */
export function resetConsumedStates(): void {
  consumed.clear();
}

/** The GitHub screen where the person picks repositories; an existing installation lands on its settings. */
export function installUrl(cfg: GitHubAppConfig, state: string): string {
  const base = (cfg.webBase ?? "https://github.com").replace(/\/$/, "");
  return `${base}/apps/${encodeURIComponent(cfg.slug)}/installations/new?state=${encodeURIComponent(state)}`;
}

/** The installation's own page on GitHub (choose repositories, uninstall); the login is the account's, so it is URL-safe. */
export function installationSettingsUrl(cfg: GitHubAppConfig, account: InstallationAccount): string {
  const base = (cfg.webBase ?? "https://github.com").replace(/\/$/, "");
  const path = account.accountType === "Organization" ? `/organizations/${encodeURIComponent(account.accountLogin)}/settings/installations/${String(account.installationId)}` : `/settings/installations/${String(account.installationId)}`;
  return `${base}${path}`;
}

// --- GitHub API calls as the App -----------------------------------------------

type Answer = { kind: "http"; status: number; json: unknown } | { kind: "network"; message: string };

async function call(cfg: GitHubAppConfig, method: string, path: string, bearer: string, body?: unknown): Promise<Answer> {
  const fetchFn = cfg.fetch ?? globalThis.fetch;
  const apiBase = (cfg.apiBase ?? "https://api.github.com").replace(/\/$/, "");
  try {
    const res = await fetchFn(`${apiBase}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": cfg.userAgent ?? UA,
        "x-github-api-version": "2022-11-28",
        authorization: `Bearer ${bearer}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      json = null;
    }
    return { kind: "http", status: res.status, json };
  } catch (e) {
    return { kind: "network", message: (e as Error).message };
  }
}

/** Errors never carry GitHub's body or any token: a status and a sentence. */
function failure(a: Answer, what: string): AppFailure {
  if (a.kind === "network") return { ok: false, status: 502, message: `GitHub could not be reached while ${what}.` };
  return { ok: false, status: a.status, message: `GitHub answered HTTP ${String(a.status)} while ${what}.` };
}

const installationSchema = z.looseObject({
  id: z.number().int().positive(),
  account: z.looseObject({ login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/), type: z.enum(["User", "Organization"]) }),
});

export async function getInstallation(cfg: GitHubAppConfig, installationId: number): Promise<{ ok: true; value: InstallationAccount } | AppFailure> {
  const a = await call(cfg, "GET", `/app/installations/${String(installationId)}`, appJwt(cfg));
  if (a.kind !== "http" || a.status !== 200) return failure(a, "reading the installation");
  const parsed = installationSchema.safeParse(a.json);
  if (!parsed.success) return { ok: false, status: 502, message: "GitHub returned an unexpected installation record." };
  return { ok: true, value: { installationId: parsed.data.id, accountLogin: parsed.data.account.login, accountType: parsed.data.account.type } };
}

const tokenSchema = z.looseObject({ token: z.string().min(1), expires_at: z.string() });

export interface InstallationToken {
  token: string;
  expiresAt: string;
}

/**
 * A one-hour token restricted to one repository of the installation. GitHub
 * answers 422 when the installation does not cover that repository, which
 * the caller treats as "no access" rather than an error.
 */
export async function installationToken(cfg: GitHubAppConfig, installationId: number, repo: string): Promise<{ ok: true; value: InstallationToken } | { ok: false; noAccess: true } | AppFailure> {
  const a = await call(cfg, "POST", `/app/installations/${String(installationId)}/access_tokens`, appJwt(cfg), { repositories: [repo], permissions: { contents: "read", metadata: "read" } });
  if (a.kind === "http" && (a.status === 422 || a.status === 404)) return { ok: false, noAccess: true };
  if (a.kind !== "http" || a.status !== 201) return failure(a, "creating an installation token");
  const parsed = tokenSchema.safeParse(a.json);
  if (!parsed.success) return { ok: false, status: 502, message: "GitHub returned an unexpected token record." };
  return { ok: true, value: { token: parsed.data.token, expiresAt: parsed.data.expires_at } };
}

const reposSchema = z.looseObject({ total_count: z.number().int().nonnegative(), repositories: z.array(z.looseObject({ full_name: z.string() })) });

/** How many repositories an installation covers, and up to 100 of their names (Settings shows the count). */
export async function installationRepositories(cfg: GitHubAppConfig, installationId: number): Promise<{ ok: true; value: { total: number; names: string[] } } | AppFailure> {
  const t = await call(cfg, "POST", `/app/installations/${String(installationId)}/access_tokens`, appJwt(cfg), { permissions: { metadata: "read" } });
  if (t.kind !== "http" || t.status !== 201) return failure(t, "creating an installation token");
  const parsedToken = tokenSchema.safeParse(t.json);
  if (!parsedToken.success) return { ok: false, status: 502, message: "GitHub returned an unexpected token record." };
  const a = await call(cfg, "GET", "/installation/repositories?per_page=100", parsedToken.data.token);
  if (a.kind !== "http" || a.status !== 200) return failure(a, "listing the installation's repositories");
  const parsed = reposSchema.safeParse(a.json);
  if (!parsed.success) return { ok: false, status: 502, message: "GitHub returned an unexpected repository list." };
  return { ok: true, value: { total: parsed.data.total_count, names: parsed.data.repositories.map((r) => r.full_name) } };
}

/** GitHub's installation tokens start with "ghs_"; the redaction list of a scan includes the one in use. */
export const INSTALLATION_TOKEN_PATTERN = /\bghs_[A-Za-z0-9]{20,}\b/g;
