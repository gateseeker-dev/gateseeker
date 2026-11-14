import { describe, expect, it } from "vitest";

import { EXIT, main } from "../src/cli.js";
import { checkForUpdate, compareVersions, updateLine } from "../src/update-check.js";
import { GATESEEKER_VERSION } from "../src/version.js";

/**
 * The "newer version available" line (docs/SPRINT_7.md 3.1): registry read
 * through an injected fetch double, never the network; silent on any failure;
 * never part of the verdict.
 */

function registry(answer: () => Response | Promise<Response>): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const f = ((input: string | URL | Request) => {
    calls.push(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    return Promise.resolve().then(answer);
  }) as typeof fetch;
  return { fetch: f, calls };
}

describe("compareVersions", () => {
  it("orders releases and prereleases like semver", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.0-beta.7", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-beta.7")).toBe(1);
    expect(compareVersions("1.0.0-beta.10", "1.0.0-beta.9")).toBe(1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareVersions("1.0.0-beta", "1.0.0-beta.1")).toBe(-1);
  });
});

describe("checkForUpdate", () => {
  it("returns the newer version from the latest tag, and null when up to date", async () => {
    const r = registry(() => new Response(JSON.stringify({ version: "9.9.9" })));
    expect(await checkForUpdate({ current: "1.0.0", fetch: r.fetch })).toBe("9.9.9");
    expect(r.calls).toEqual(["https://registry.npmjs.org/gateseeker/latest"]);
    expect(await checkForUpdate({ current: "9.9.9", fetch: registry(() => new Response(JSON.stringify({ version: "9.9.9" }))).fetch })).toBeNull();
    expect(await checkForUpdate({ current: "9.9.9", fetch: registry(() => new Response(JSON.stringify({ version: "1.0.0" }))).fetch })).toBeNull();
  });

  it("is silent on HTTP errors, malformed answers and network failures", async () => {
    expect(await checkForUpdate({ current: "1.0.0", fetch: registry(() => new Response("{}", { status: 503 })).fetch })).toBeNull();
    expect(await checkForUpdate({ current: "1.0.0", fetch: registry(() => new Response("not json")).fetch })).toBeNull();
    expect(await checkForUpdate({ current: "1.0.0", fetch: registry(() => new Response(JSON.stringify({ version: "<script>" }))).fetch })).toBeNull();
    expect(await checkForUpdate({ current: "1.0.0", fetch: registry(() => { throw new Error("offline"); }).fetch })).toBeNull();
  });

  it("the line says what to run and how to silence it", () => {
    expect(updateLine("1.0.0", "1.1.0")).toContain("Gateseeker 1.1.0 is available (you run 1.0.0)");
    expect(updateLine("1.0.0", "1.1.0")).toContain("GATESEEKER_NO_UPDATE_CHECK=1");
  });
});

describe("gateseeker --version and the update line", () => {
  it("prints the line after a text run only when a fetch is given and not opted out, never touching the exit code", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const io = { stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) };
    // --version is a cheap run that never checks.
    expect(await main(["--version"], { ...io, updateFetch: registry(() => new Response(JSON.stringify({ version: "9.9.9" }))).fetch })).toBe(EXIT.pass);
    expect(out.join("")).toContain(GATESEEKER_VERSION);
    expect(err.join("")).toBe("");
  });
});
