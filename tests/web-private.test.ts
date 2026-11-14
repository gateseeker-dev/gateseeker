import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { createStaticAuth } from "../src/web/auth.js";
import { resetConsumedStates, type GitHubAppConfig } from "../src/web/github-app.js";
import { handleAccountRequest, handleAdminRequest, handleFollowsRequest, handleGitHubRequest, handleMonitorRequest, handleScanRequest, resetTouched, type HandlerOptions, type InstallationsResponse, type ScanResponseError, type ScanResponseOk } from "../src/web/handler.js";
import { createMemoryMailer, createStaticDirectory } from "../src/web/mail.js";
import { createMemoryStore } from "../src/web/store.js";

/**
 * Private repositories through the GitHub App (docs/SPRINT_8.md §4): the
 * install link, the binding, the analysis with an installation token, the
 * monitor, and the account deletion. GitHub is a fetch double that knows one
 * public and one private repository; the App key is generated here.
 */

function header(name: string, size: number): Buffer {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, "utf8");
  h.write("0000644\0", 100, "ascii");
  h.write("0000000\0", 108, "ascii");
  h.write("0000000\0", 116, "ascii");
  h.write(size.toString(8).padStart(11, "0") + "\0", 124, "ascii");
  h.write("00000000000\0", 136, "ascii");
  h.write("        ", 148, "ascii");
  h.write("0", 156, "ascii");
  h.write("ustar\0", 257, "ascii");
  h.write("00", 263, "ascii");
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return h;
}

function targz(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, "utf8");
    parts.push(header(name, data.length), data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(parts));
}

const SHA = "c".repeat(40);
const ARCHIVE = targz({ "secret-cccc/package.json": '{"name":"secret"}', "secret-cccc/src/server.ts": 'app.use(cors({ origin: "*", credentials: true }));\n' });
const TOKEN = "ghs_installationtoken0123456789abcdef";

interface Call {
  method: string;
  url: string;
  auth: string | null;
  body: unknown;
}

/**
 * acme/secret is private: 404 without the token, 200 with it. The App's
 * endpoints answer for installation 42 (account "Acme"), which covers
 * "secret" but not "other".
 */
function gitHub(): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  // eslint-disable-next-line @typescript-eslint/require-await -- a fetch double must return a Promise<Response>
  const f = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const auth = headers.get("authorization");
    const method = init?.method ?? "GET";
    calls.push({ method, url, auth, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    const path = new URL(url).pathname;
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.includes("osv.dev")) return json(200, { vulns: [] });
    if (path === "/app/installations/42") return auth?.startsWith("Bearer ey") ? json(200, { id: 42, account: { login: "Acme", type: "Organization" } }) : json(401, {});
    if (path === "/app/installations/42/access_tokens") {
      const repos = (calls[calls.length - 1]?.body as { repositories?: string[] } | null)?.repositories ?? [];
      if (repos.includes("other")) return json(422, { message: "not covered" });
      return json(201, { token: TOKEN, expires_at: "2026-11-05T11:00:00Z" });
    }
    if (path === "/installation/repositories") return json(200, { total_count: 2, repositories: [{ full_name: "Acme/secret" }, { full_name: "Acme/tools" }] });
    const withToken = auth === `Bearer ${TOKEN}`;
    if (path === "/repos/acme/secret") return withToken ? json(200, { full_name: "Acme/secret", private: true, size: 10, default_branch: "main", html_url: "https://github.com/Acme/secret" }) : json(404, { message: "Not Found" });
    if (path === "/repos/acme/secret/commits/main") return withToken ? json(200, { sha: SHA }) : json(404, {});
    if (path === `/repos/acme/secret/tarball/${SHA}`) return withToken ? new Response(ARCHIVE, { status: 200 }) : json(404, {});
    if (path === "/repos/acme/other") return json(404, { message: "Not Found" });
    if (path.startsWith("/acme/secret/tar.gz/")) return json(404, {});
    return json(404, { message: "Not Found" });
  }) as typeof fetch;
  return { fetch: f, calls };
}

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

const ALICE = { id: "11111111-1111-4111-8111-111111111111", login: "alice" };
const BOB = { id: "22222222-2222-4222-8222-222222222222", login: "bob" };
const auth = createStaticAuth({ "tok-alice": ALICE, "tok-bob": BOB });

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  resetConsumedStates();
  resetTouched();
});

function options(gh: ReturnType<typeof gitHub>, extra: Partial<HandlerOptions> = {}): HandlerOptions {
  const d = mkdtempSync(join(tmpdir(), "gsk-private-"));
  dirs.push(d);
  const githubApp: GitHubAppConfig = { appId: "12345", slug: "gateseeker-test", privateKey: PEM, fetch: gh.fetch };
  return { fetch: gh.fetch, workDir: d, scan: { osv: { fetch: gh.fetch }, packagist: false }, auth, store: createMemoryStore(), githubApp, ...extra, ...(extra.githubApp ? { githubApp: extra.githubApp } : {}) };
}

/** Walks the install flow for Alice: asks for the link, "comes back" from GitHub with installation 42 and the state. */
async function authorize(opts: HandlerOptions, repo = "acme/secret"): Promise<string> {
  const link = await handleGitHubRequest("GET", "install", new URLSearchParams({ repo }), null, opts, "Bearer tok-alice");
  expect(link.status).toBe(200);
  const url = new URL((link.body as { url: string }).url);
  expect(url.origin + url.pathname).toBe("https://github.com/apps/gateseeker-test/installations/new");
  const state = url.searchParams.get("state") ?? "";
  const bound = await handleGitHubRequest("POST", "installations", new URLSearchParams(), { installationId: 42, state }, opts, "Bearer tok-alice");
  expect(bound).toMatchObject({ status: 200, body: { ok: true, installation: { installationId: 42, accountLogin: "Acme", accountType: "Organization", manageUrl: "https://github.com/organizations/Acme/settings/installations/42" }, repo } });
  return state;
}

describe("private repositories without an installation", () => {
  it("answers 403 private with the install link, creates no report and spends no quota", async () => {
    const gh = gitHub();
    const opts = options(gh, { quota: { limit: 1, windowSeconds: 3600 } });
    const out = await handleScanRequest({ url: "https://github.com/acme/secret" }, opts, "Bearer tok-alice");
    expect(out.status).toBe(403);
    const err = out.body as ScanResponseError;
    expect(err.error.code).toBe("private");
    expect(err.error.message).toContain("allow Gateseeker to read it on GitHub");
    expect(err.error.installUrl).toMatch(/^https:\/\/github\.com\/apps\/gateseeker-test\/installations\/new\?state=/);
    expect(gh.calls.some((c) => c.url.includes("tarball") || c.url.includes("tar.gz"))).toBe(false);
    expect(await opts.store?.claimQuota(ALICE.id, 1, 3600)).toMatchObject({ allowed: true, used: 1 });
    expect(await opts.store?.listScans(ALICE.id, 10)).toEqual([]);
  });

  it("says public-only, without a link, when the App is not configured", async () => {
    const gh = gitHub();
    const opts = options(gh);
    delete opts.githubApp;
    // GitHub answers 404 for a private repository without credentials; with no App there is nothing to offer.
    const out = await handleScanRequest({ url: "https://github.com/acme/secret" }, opts, "Bearer tok-alice");
    expect(out).toMatchObject({ status: 404, body: { error: { code: "not-found" } } });
    expect((out.body as ScanResponseError).error.installUrl).toBeUndefined();
    expect(await handleGitHubRequest("GET", "installations", new URLSearchParams(), null, opts, "Bearer tok-alice")).toMatchObject({ status: 404 });
  });
});

describe("binding an installation", () => {
  it("accepts only a state signed for the same account, unused and unexpired; the binding needs GitHub to confirm the installation", async () => {
    const gh = gitHub();
    const opts = options(gh);
    const link = await handleGitHubRequest("GET", "install", new URLSearchParams({ repo: "acme/secret" }), null, opts, "Bearer tok-alice");
    const state = new URL((link.body as { url: string }).url).searchParams.get("state") ?? "";
    // Bob presents Alice's state.
    expect(await handleGitHubRequest("POST", "installations", new URLSearchParams(), { installationId: 42, state }, opts, "Bearer tok-bob")).toMatchObject({ status: 403 });
    expect(await opts.store?.listInstallations(BOB.id)).toEqual([]);
    // A changed state.
    expect(await handleGitHubRequest("POST", "installations", new URLSearchParams(), { installationId: 42, state: `${state}x` }, opts, "Bearer tok-alice")).toMatchObject({ status: 403 });
    // The right one, once.
    expect(await handleGitHubRequest("POST", "installations", new URLSearchParams(), { installationId: 42, state }, opts, "Bearer tok-alice")).toMatchObject({ status: 200 });
    expect(await handleGitHubRequest("POST", "installations", new URLSearchParams(), { installationId: 42, state }, opts, "Bearer tok-alice")).toMatchObject({ status: 403 });
    expect(await opts.store?.listInstallations(ALICE.id)).toMatchObject([{ installationId: 42, accountLogin: "Acme", accountType: "Organization" }]);
    // An installation GitHub does not know is not bound.
    const again = await handleGitHubRequest("GET", "install", new URLSearchParams({ repo: "acme/secret" }), null, opts, "Bearer tok-alice");
    const state2 = new URL((again.body as { url: string }).url).searchParams.get("state") ?? "";
    expect(await handleGitHubRequest("POST", "installations", new URLSearchParams(), { installationId: 43, state: state2 }, opts, "Bearer tok-alice")).toMatchObject({ status: 502 });
    expect(await opts.store?.listInstallations(ALICE.id)).toHaveLength(1);
    // Validation of the request itself.
    expect(await handleGitHubRequest("GET", "install", new URLSearchParams({ repo: "not a repo" }), null, opts, "Bearer tok-alice")).toMatchObject({ status: 400 });
    expect(await handleGitHubRequest("POST", "installations", new URLSearchParams(), { installationId: "x" }, opts, "Bearer tok-alice")).toMatchObject({ status: 400 });
    expect(await handleGitHubRequest("GET", "installations", new URLSearchParams(), null, opts, null)).toMatchObject({ status: 401 });
  });

  it("lists the account's installations with the repositories they cover, and forgets one on request", async () => {
    const gh = gitHub();
    const opts = options(gh);
    await authorize(opts);
    const list = await handleGitHubRequest("GET", "installations", new URLSearchParams(), null, opts, "Bearer tok-alice");
    expect(list.status).toBe(200);
    const views = (list.body as InstallationsResponse).installations;
    expect(views).toMatchObject([{ installationId: 42, accountLogin: "Acme", repositories: 2 }]);
    expect(JSON.stringify(list.body)).not.toContain(TOKEN);
    // Bob sees nothing.
    expect(await handleGitHubRequest("GET", "installations", new URLSearchParams(), null, opts, "Bearer tok-bob")).toMatchObject({ body: { installations: [] } });
    expect(await handleGitHubRequest("DELETE", "installations/42", new URLSearchParams(), null, opts, "Bearer tok-bob")).toMatchObject({ status: 200, body: { removed: false } });
    expect(await handleGitHubRequest("DELETE", "installations/42", new URLSearchParams(), null, opts, "Bearer tok-alice")).toMatchObject({ status: 200, body: { removed: true, manageUrl: "https://github.com/organizations/Acme/settings/installations/42" } });
    expect(await opts.store?.listInstallations(ALICE.id)).toEqual([]);
  });
});

describe("analyzing a private repository", () => {
  it("reads metadata, commit and archive with a token restricted to the repository, saves the report as private, and never exposes the token", async () => {
    const gh = gitHub();
    const opts = options(gh);
    await authorize(opts);
    const out = await handleScanRequest({ url: "https://github.com/acme/secret" }, opts, "Bearer tok-alice");
    expect(out.status).toBe(200);
    const ok = out.body as ScanResponseOk;
    expect(ok.repository).toMatchObject({ owner: "acme", repo: "secret", sha: SHA, isPrivate: true });
    expect(ok.report.findings.some((f) => f.evidence.kind === "insecure-pattern" && f.evidence.ruleId === "GSK-CORS-001")).toBe(true);
    // The token request was restricted to this repository, with read-only permissions.
    const tokenCall = gh.calls.find((c) => c.url.endsWith("/app/installations/42/access_tokens"));
    expect(tokenCall?.body).toEqual({ repositories: ["secret"], permissions: { contents: "read", metadata: "read" } });
    // Metadata, commit and tarball went with the installation token; the archive came through the API, not codeload.
    const withToken = gh.calls.filter((c) => c.auth === `Bearer ${TOKEN}`).map((c) => new URL(c.url).pathname);
    expect(withToken).toEqual(expect.arrayContaining(["/repos/acme/secret", "/repos/acme/secret/commits/main", `/repos/acme/secret/tarball/${SHA}`]));
    expect(gh.calls.some((c) => c.url.includes("codeload"))).toBe(false);
    // Nothing returned or stored carries the token.
    expect(JSON.stringify(out.body)).not.toContain(TOKEN);
    const saved = await opts.store?.get(ok.id ?? "", ALICE.id);
    expect(JSON.stringify(saved)).not.toContain(TOKEN);
    expect(saved?.body).toMatchObject({ repository: { isPrivate: true } });
  });

  it("is not served from another account's cache, and its own report is not reused across accounts", async () => {
    const gh = gitHub();
    const opts = options(gh);
    await authorize(opts);
    const first = await handleScanRequest({ url: "https://github.com/acme/secret" }, opts, "Bearer tok-alice");
    expect(first.status).toBe(200);
    // Bob has no installation: 403 with the link, even though a report of that commit exists.
    const bob = await handleScanRequest({ url: "https://github.com/acme/secret" }, opts, "Bearer tok-bob");
    expect(bob.status).toBe(403);
    expect((bob.body as ScanResponseError).error.installUrl).toBeTruthy();
    // Alice again: a fresh analysis (no cache for private repositories), two downloads in total.
    const second = await handleScanRequest({ url: "https://github.com/acme/secret" }, opts, "Bearer tok-alice");
    expect(second).toMatchObject({ status: 200, body: { cached: false } });
    expect(gh.calls.filter((c) => c.url.includes("/tarball/")).length).toBe(2);
  });

  it("treats an installation that does not cover the repository as no access", async () => {
    const gh = gitHub();
    const opts = options(gh);
    await authorize(opts);
    const out = await handleScanRequest({ url: "https://github.com/acme/other" }, opts, "Bearer tok-alice");
    expect(out.status).toBe(403);
    expect((out.body as ScanResponseError).error.installUrl).toBeTruthy();
    expect(gh.calls.some((c) => c.url.includes("/repos/acme/other") && c.auth?.startsWith("Bearer ghs_"))).toBe(false);
  });
});

describe("monitoring a private repository", () => {
  const secret = "cron-secret";

  it("rescans with a fresh token, and pauses with the reason when the authorization is gone", async () => {
    const gh = gitHub();
    const mailer = createMemoryMailer();
    const opts = options(gh, { mail: { mailer, directory: createStaticDirectory({ [ALICE.id]: "alice@example.test" }), key: "k".repeat(40), baseUrl: "https://gateseeker.test", dailyCap: 100 }, cacheMs: 0 });
    await authorize(opts);
    expect(await handleFollowsRequest("POST", { owner: "acme", repo: "secret" }, opts, "Bearer tok-alice")).toMatchObject({ status: 200 });
    const run = await handleMonitorRequest(opts, `Bearer ${secret}`, secret);
    expect(run).toMatchObject({ status: 200, body: { checked: 1, failed: 0, paused: 0 } });
    const [f] = (await opts.store?.listFollows(ALICE.id)) ?? [];
    // Pattern findings are in warn mode (CLAUDE.md rule 11): the verdict passes, the finding is in the report.
    expect(f).toMatchObject({ lastVerdict: "pass", pausedReason: null });
    expect(gh.calls.filter((c) => c.url.includes("/tarball/") && c.auth === `Bearer ${TOKEN}`).length).toBe(1);

    // The person disconnected the installation: the next rescan pauses and says so, once, by email.
    await handleGitHubRequest("DELETE", "installations/42", new URLSearchParams(), null, opts, "Bearer tok-alice");
    const later = { ...opts, now: () => new Date(Date.now() + 86_400_000) };
    expect(await handleMonitorRequest(later, `Bearer ${secret}`, secret)).toMatchObject({ body: { checked: 1, paused: 1 } });
    const [paused] = (await opts.store?.listFollows(ALICE.id)) ?? [];
    expect(paused?.pausedReason).toContain("revoked");
    expect(mailer.sent.map((m) => m.kind)).toEqual(["follow_confirm", "paused"]);
    expect(JSON.stringify(mailer.sent)).not.toContain(TOKEN);
  });
});

describe("accounts and admin", () => {
  it("deleting the account forgets its installations", async () => {
    const gh = gitHub();
    const opts = options(gh);
    await authorize(opts);
    expect(await handleAccountRequest("DELETE", { confirm: "alice" }, opts, "Bearer tok-alice")).toMatchObject({ status: 200 });
    expect(await opts.store?.listInstallations(ALICE.id)).toEqual([]);
  });

  it("the admin sees that an account bound an installation (whose, since when), and the overview counts them", async () => {
    const gh = gitHub();
    const opts = options(gh, { adminLogins: ["bob"] });
    await authorize(opts);
    const overview = await handleAdminRequest("overview", new URLSearchParams(), opts, "Bearer tok-bob");
    expect(overview).toMatchObject({ status: 200, body: { overview: { installations: 1 } } });
    const account = await handleAdminRequest(`accounts/${ALICE.id}`, new URLSearchParams(), opts, "Bearer tok-bob");
    expect(account).toMatchObject({ status: 200, body: { installations: [{ installationId: 42, accountLogin: "Acme" }] } });
    expect(JSON.stringify(account.body)).not.toContain(TOKEN);
  });
});
