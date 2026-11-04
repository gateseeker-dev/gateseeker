import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { appJwt, getInstallation, installationRepositories, installationSettingsUrl, installationToken, installUrl, resetConsumedStates, signState, validAppKey, verifyState, type GitHubAppConfig } from "../src/web/github-app.js";
import { githubAppFromEnv } from "../src/web/env.js";

/**
 * The GitHub App layer of Sprint 8 (docs/SPRINT_8.md §4 items 1 and 2): the
 * App's JWT, the signed state of the install link, and the calls to GitHub,
 * all against a key pair generated here and a fetch double. No network.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const PEM_PKCS8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function config(overrides: Partial<GitHubAppConfig> = {}): GitHubAppConfig {
  return { appId: "12345", slug: "gateseeker", privateKey: PEM, now: () => new Date("2026-11-05T10:00:00Z"), ...overrides };
}

function decode(part: string): unknown {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

describe("appJwt", () => {
  it("signs RS256 with the App id as issuer, a minute in the past, ten minutes long", () => {
    const jwt = appJwt(config());
    const [h, p, s] = jwt.split(".") as [string, string, string];
    expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
    const payload = decode(p) as { iat: number; exp: number; iss: string };
    const now = Math.floor(Date.parse("2026-11-05T10:00:00Z") / 1000);
    expect(payload).toEqual({ iat: now - 60, exp: now - 60 + 600, iss: "12345" });
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
    // Another key does not verify it.
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(other, Buffer.from(s, "base64url"))).toBe(false);
  });

  it("accepts PKCS#1 and PKCS#8 keys and rejects anything else", () => {
    expect(validAppKey(PEM)).toBe(true);
    expect(validAppKey(PEM_PKCS8)).toBe(true);
    expect(validAppKey("-----BEGIN RSA PRIVATE KEY-----\nnot a key\n-----END RSA PRIVATE KEY-----")).toBe(false);
    expect(validAppKey("")).toBe(false);
  });
});

describe("install link state", () => {
  it("binds the account and the repository, expires after 15 minutes, and is single-use", () => {
    resetConsumedStates();
    const cfg = config();
    const state = signState(cfg, "user-1", "acme/secret");
    expect(installUrl(cfg, state)).toBe(`https://github.com/apps/gateseeker/installations/new?state=${encodeURIComponent(state)}`);
    expect(verifyState(cfg, state, "user-2")).toEqual({ ok: false, reason: "account" });
    expect(verifyState(cfg, state, "user-1")).toEqual({ ok: true, repo: "acme/secret" });
    expect(verifyState(cfg, state, "user-1")).toEqual({ ok: false, reason: "used" });
    const later = config({ now: () => new Date("2026-11-05T10:16:00Z") });
    expect(verifyState(later, signState(cfg, "user-1", ""), "user-1")).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a state with one character changed, a foreign key, or no structure", () => {
    resetConsumedStates();
    const cfg = config();
    const state = signState(cfg, "user-1", "acme/secret");
    const [body, mac] = state.split(".") as [string, string];
    // Not the last character: its low bits are padding and would decode to the same bytes.
    const flipped = `${body}.${mac.slice(0, 5)}${mac[5] === "A" ? "B" : "A"}${mac.slice(6)}`;
    expect(verifyState(cfg, flipped, "user-1")).toEqual({ ok: false, reason: "signature" });
    // The body says another account but the signature is the old one.
    const forgedBody = Buffer.from(JSON.stringify({ u: "user-2", r: "acme/secret", e: Date.parse("2026-11-05T10:15:00Z") })).toString("base64url");
    expect(verifyState(cfg, `${forgedBody}.${mac}`, "user-2")).toEqual({ ok: false, reason: "signature" });
    const otherKey = config({ privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString() });
    expect(verifyState(otherKey, state, "user-1")).toEqual({ ok: false, reason: "signature" });
    expect(verifyState(cfg, "nonsense", "user-1")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyState(cfg, "", "user-1")).toEqual({ ok: false, reason: "malformed" });
  });
});

function gitHubDouble(answers: Record<string, { status: number; body: unknown }>): { fetch: typeof fetch; calls: { method: string; url: string; auth: string | null; body: unknown }[] } {
  const calls: { method: string; url: string; auth: string | null; body: unknown }[] = [];
  // eslint-disable-next-line @typescript-eslint/require-await -- a fetch double must return a Promise<Response>
  const f = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    calls.push({ method: init?.method ?? "GET", url, auth: headers.get("authorization"), body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    const a = answers[key];
    if (!a) return new Response("not stubbed", { status: 500 });
    return new Response(JSON.stringify(a.body), { status: a.status });
  }) as typeof fetch;
  return { fetch: f, calls };
}

describe("GitHub calls as the App", () => {
  it("reads an installation with the JWT and returns whose it is", async () => {
    const gh = gitHubDouble({ "GET /app/installations/42": { status: 200, body: { id: 42, account: { login: "Acme", type: "Organization" } } } });
    const out = await getInstallation(config({ fetch: gh.fetch }), 42);
    expect(out).toEqual({ ok: true, value: { installationId: 42, accountLogin: "Acme", accountType: "Organization" } });
    expect(gh.calls[0]?.auth).toMatch(/^Bearer ey/);
    expect(installationSettingsUrl(config(), { installationId: 42, accountLogin: "Acme", accountType: "Organization" })).toBe("https://github.com/organizations/Acme/settings/installations/42");
    expect(installationSettingsUrl(config(), { installationId: 7, accountLogin: "jo", accountType: "User" })).toBe("https://github.com/settings/installations/7");
  });

  it("asks for a token restricted to one repository with read-only permissions; 422 means no access", async () => {
    const gh = gitHubDouble({ "POST /app/installations/42/access_tokens": { status: 201, body: { token: "ghs_abcdefghijklmnopqrstuvwxyz", expires_at: "2026-11-05T11:00:00Z" } } });
    const out = await installationToken(config({ fetch: gh.fetch }), 42, "secret");
    expect(out).toEqual({ ok: true, value: { token: "ghs_abcdefghijklmnopqrstuvwxyz", expiresAt: "2026-11-05T11:00:00Z" } });
    expect(gh.calls[0]?.body).toEqual({ repositories: ["secret"], permissions: { contents: "read", metadata: "read" } });
    const denied = gitHubDouble({ "POST /app/installations/42/access_tokens": { status: 422, body: { message: "not covered" } } });
    expect(await installationToken(config({ fetch: denied.fetch }), 42, "other")).toEqual({ ok: false, noAccess: true });
    const down = gitHubDouble({});
    const failed = await installationToken(config({ fetch: down.fetch }), 42, "secret");
    expect(failed.ok).toBe(false);
    // The failure carries a status and a sentence, never GitHub's body.
    expect(JSON.stringify(failed)).not.toContain("not stubbed");
  });

  it("counts the repositories an installation covers with a metadata-only token", async () => {
    const gh = gitHubDouble({
      "POST /app/installations/42/access_tokens": { status: 201, body: { token: "ghs_zzzzzzzzzzzzzzzzzzzzzzzz", expires_at: "x" } },
      "GET /installation/repositories": { status: 200, body: { total_count: 3, repositories: [{ full_name: "acme/a" }, { full_name: "acme/b" }, { full_name: "acme/c" }] } },
    });
    const out = await installationRepositories(config({ fetch: gh.fetch }), 42);
    expect(out).toEqual({ ok: true, value: { total: 3, names: ["acme/a", "acme/b", "acme/c"] } });
    expect(gh.calls[0]?.body).toEqual({ permissions: { metadata: "read" } });
    expect(gh.calls[1]?.auth).toBe("Bearer ghs_zzzzzzzzzzzzzzzzzzzzzzzz");
  });
});

describe("githubAppFromEnv", () => {
  it("is off without the variables, loud with a bad key, on with all three", () => {
    expect(githubAppFromEnv({})).toBeNull();
    const errors: string[] = [];
    const original = console.error;
    console.error = (m: string) => { errors.push(m); };
    try {
      expect(githubAppFromEnv({ GATESEEKER_GITHUB_APP_ID: "1", GATESEEKER_GITHUB_APP_SLUG: "gateseeker", GATESEEKER_GITHUB_APP_KEY: "garbage" })).toBeNull();
      expect(githubAppFromEnv({ GATESEEKER_GITHUB_APP_ID: "1", GATESEEKER_GITHUB_APP_SLUG: "gateseeker" })).toBeNull();
    } finally {
      console.error = original;
    }
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("private repositories are off");
    const app = githubAppFromEnv({ GATESEEKER_GITHUB_APP_ID: "12345", GATESEEKER_GITHUB_APP_SLUG: "gateseeker", GATESEEKER_GITHUB_APP_KEY: PEM.replace(/\n/g, "\\n") });
    expect(app?.appId).toBe("12345");
    expect(app && validAppKey(app.privateKey)).toBe(true);
  });
});
