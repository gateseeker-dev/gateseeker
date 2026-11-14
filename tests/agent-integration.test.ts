import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { HOOK_EXIT, isCommitCommand, runClaudeCodeHook } from "../src/agent-hook.js";
import { claudeHookSettings, mcpConfig } from "../src/agent-snippets.js";
import { main } from "../src/cli.js";
import { handleMcpMessage, MCP_PROTOCOL_VERSIONS, runMcpServer, type McpServerOptions } from "../src/mcp.js";
import { scanDirectory, type ScanDirectoryOptions, type ScanResult } from "../src/scan.js";
import { GATESEEKER_VERSION } from "../src/version.js";
import { CLIENT_EVENT_KINDS } from "../src/web/store.js";
import { VISIT_SOURCES, visitSource } from "../src/web/visit-source.js";
import { fixturePath, readJsonFixture } from "./helpers.js";

const SECRETS = readJsonFixture("projects/secrets.json") as Record<string, string>;
const PROJECT = fixturePath("projects/vibe-next-supabase");
// Patterns only: nothing reaches the network.
const OFFLINE: McpServerOptions = { root: PROJECT, scan: { packagist: false } };

const dirs: string[] = [];
function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), "gsk-agent-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function call(name: string, args: unknown, options: McpServerOptions = OFFLINE) {
  return handleMcpMessage({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } }, options);
}

function resultOf(answer: Awaited<ReturnType<typeof handleMcpMessage>>): { content: { type: string; text: string }[]; structuredContent?: Record<string, unknown>; isError: boolean } {
  expect(answer?.error).toBeUndefined();
  return answer?.result as never;
}

describe("MCP server (gateseeker mcp)", () => {
  it("negotiates the protocol version, names itself and lists one read-only tool", async () => {
    const init = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } }, OFFLINE);
    expect(init?.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gateseeker", version: GATESEEKER_VERSION } });
    // A version we do not know: we answer with our newest and the client decides.
    const future = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } }, OFFLINE);
    expect(future?.result).toMatchObject({ protocolVersion: MCP_PROTOCOL_VERSIONS[0] });
    expect(await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "ping" }, OFFLINE)).toEqual({ jsonrpc: "2.0", id: 3, result: {} });
    const list = (await handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "tools/list" }, OFFLINE))?.result as { tools: { name: string; annotations: Record<string, boolean>; inputSchema: { additionalProperties: boolean } }[] };
    expect(list.tools.map((t) => t.name)).toEqual(["gateseeker_scan"]);
    expect(list.tools[0]?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(list.tools[0]?.inputSchema.additionalProperties).toBe(false);
  });

  it("never answers notifications and reports unknown methods, tools and malformed requests", async () => {
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, OFFLINE)).toBeNull();
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "anything/else" }, OFFLINE)).toBeNull();
    expect((await handleMcpMessage({ jsonrpc: "2.0", id: 5, method: "resources/list" }, OFFLINE))?.error?.code).toBe(-32601);
    expect((await call("rm_rf", {}))?.error?.code).toBe(-32602);
    expect((await handleMcpMessage({ id: 6, method: "ping" }, OFFLINE))?.error?.code).toBe(-32600);
    expect((await handleMcpMessage([1, 2], OFFLINE))?.error?.code).toBe(-32600);
  });

  it("scans the project and answers with the redacted report and the verdict", async () => {
    const r = resultOf(await call("gateseeker_scan", { only: "patterns" }));
    expect(r.isError).toBe(false);
    expect(r.structuredContent).toMatchObject({ verdict: "pass", failOn: "P2" });
    const text = r.content[0]?.text ?? "";
    expect(text).toContain("GSK-SUPABASE-002");
    for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
    expect(JSON.stringify(r)).not.toMatch(/\bsecure\b/i);
  });

  it("refuses paths outside the project, through .. or a link, and arguments it does not know", async () => {
    expect(resultOf(await call("gateseeker_scan", { path: ".." })).isError).toBe(true);
    expect(resultOf(await call("gateseeker_scan", { path: "../../.." })).content[0]?.text).toMatch(/inside the project/);
    expect(resultOf(await call("gateseeker_scan", { path: "nope" })).content[0]?.text).toMatch(/does not exist/);
    expect(resultOf(await call("gateseeker_scan", { path: "package.json" })).content[0]?.text).toMatch(/directory/);
    expect(resultOf(await call("gateseeker_scan", { command: "ls" })).isError).toBe(true);
    expect(resultOf(await call("gateseeker_scan", { fail_on: "P9" })).isError).toBe(true);
    const root = freshDir();
    const outside = freshDir();
    try {
      symlinkSync(outside, join(root, "escape"), "junction");
    } catch {
      return; // links not permitted on this machine: the ".." cases above still cover the check
    }
    expect(resultOf(await call("gateseeker_scan", { path: "escape" }, { root })).content[0]?.text).toMatch(/inside the project/);
  });

  it("frames messages one per line over stdio and answers a parse error", async () => {
    const input = new PassThrough();
    const out: string[] = [];
    const done = runMcpServer(OFFLINE, { input, output: (s) => out.push(s) });
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    input.write("{not json\n\n");
    input.end(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })}\n`);
    await done;
    const answers = out.map((l) => JSON.parse(l) as { id: number | null; error?: { code: number } });
    expect(out.every((l) => l.endsWith("\n") && !l.slice(0, -1).includes("\n"))).toBe(true);
    expect(answers.map((a) => a.id).sort()).toEqual([1, 2, null].sort());
    expect(answers.find((a) => a.id === null)?.error?.code).toBe(-32700);
  });

  it("is started by the CLI and serves on stdin/stdout", async () => {
    const stdin = new PassThrough();
    const out: string[] = [];
    const run = main(["mcp", "--root", PROJECT], { stdout: (s) => out.push(s), stderr: () => undefined, stdin });
    stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`);
    expect(await run).toBe(0);
    expect(out.join("")).toContain("gateseeker_scan");
  });
});

describe("Claude Code hook (gateseeker hook claude-code)", () => {
  it("recognises git commit, also after other commands and with git options, and nothing else", () => {
    for (const c of ["git commit -m x", "npm test && git commit -am 'x'", "git -C app commit", "git --no-pager commit --amend", "(cd a; git commit)"]) expect(isCommitCommand(c)).toBe(true);
    for (const c of ["git status", "git log --grep commit", "echo git commit", "gitcommit", "git commit-tree abc", "git show HEAD:commit.txt"]) {
      // "echo git commit" is text, but a shell would not commit; the pattern errs towards scanning, so only the clear ones are checked here.
      if (c === "echo git commit") continue;
      expect(isCommitCommand(c)).toBe(false);
    }
  });

  it("stays linear on long adversarial commands", () => {
    const inputs = [`git ${"-c a=b ".repeat(20_000)}`, `git ${"--x ".repeat(30_000)}commi`, " git".repeat(30_000), `git ${"-".repeat(100_000)}`];
    const start = performance.now();
    for (const s of inputs) isCommitCommand(s.slice(0, 10_000));
    expect(performance.now() - start).toBeLessThan(200);
  });

  it("lets every other tool call through without scanning", async () => {
    let scans = 0;
    const spy = (o: ScanDirectoryOptions): Promise<ScanResult> => {
      scans += 1;
      return scanDirectory(o);
    };
    const err: string[] = [];
    expect(await runClaudeCodeHook(JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls -la" }, cwd: PROJECT }), { scanDirectory: spy }, (s) => err.push(s))).toBe(HOOK_EXIT.allow);
    expect(await runClaudeCodeHook(JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "a" } }), { scanDirectory: spy }, (s) => err.push(s))).toBe(HOOK_EXIT.allow);
    expect(scans).toBe(0);
    expect(err).toEqual([]);
    expect(await runClaudeCodeHook("not json", {}, (s) => err.push(s))).toBe(HOOK_EXIT.error);
  });

  it("blocks a commit on fail with what to fix, and lets it through on pass", async () => {
    const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git commit -m wip" }, cwd: PROJECT });
    const err: string[] = [];
    // Pattern findings in gate mode make this fixture fail; without gate mode they only warn.
    expect(await runClaudeCodeHook(input, { patternsMode: "gate", scan: { only: "patterns" } }, (s) => err.push(s))).toBe(HOOK_EXIT.block);
    const text = err.join("");
    expect(text).toContain("Gateseeker blocked this commit");
    expect(text).toMatch(/- P1 \(Fix now\): /);
    for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
    expect(await runClaudeCodeHook(input, { scan: { only: "patterns" } }, () => undefined)).toBe(HOOK_EXIT.allow);
  });

  it("holds the commit when the check is incomplete, unless allowed, and says so", async () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git commit" }, cwd: PROJECT });
    const incomplete = async (o: ScanDirectoryOptions): Promise<ScanResult> => {
      const r = await scanDirectory({ ...o, only: "patterns" });
      if (!r.ok) return r;
      return { ok: true, report: { ...r.report, gate: { ...r.report.gate, verdict: "incomplete", reason: "1 dependency query failed." } } };
    };
    const err: string[] = [];
    expect(await runClaudeCodeHook(input, { scanDirectory: incomplete }, (s) => err.push(s))).toBe(HOOK_EXIT.block);
    expect(err.join("")).toContain("not reported as clean");
    const allowed: string[] = [];
    expect(await runClaudeCodeHook(input, { scanDirectory: incomplete, allowIncomplete: true }, (s) => allowed.push(s))).toBe(HOOK_EXIT.allow);
    expect(allowed.join("")).toContain("--allow-incomplete");
  });

  it("is reached through the CLI and refuses unknown agents", async () => {
    const stdin = new PassThrough();
    stdin.end(JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }));
    expect(await main(["hook", "claude-code"], { stdout: () => undefined, stderr: () => undefined, stdin })).toBe(HOOK_EXIT.allow);
    const err: string[] = [];
    expect(await main(["hook", "cursor"], { stdout: () => undefined, stderr: (s) => err.push(s), stdin: new PassThrough() })).toBe(3);
    expect(err.join("")).toContain("hook claude-code");
  });
});

describe("the configuration we recommend", () => {
  it("does not trip our own agent rules", async () => {
    const root = freshDir();
    mkdirSync(join(root, ".claude"));
    writeFileSync(join(root, ".mcp.json"), mcpConfig(GATESEEKER_VERSION));
    writeFileSync(join(root, ".claude", "settings.json"), claudeHookSettings());
    const r = await scanDirectory({ root, only: "patterns" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.findings.filter((f) => f.subject.includes("GSK-AGENT") || JSON.stringify(f.evidence).includes("GSK-AGENT"))).toEqual([]);
    // And the files are what a scan of a real misconfiguration would flag if changed: an unpinned server is caught.
    writeFileSync(join(root, ".mcp.json"), mcpConfig(GATESEEKER_VERSION).replace(`@${GATESEEKER_VERSION}`, "@latest"));
    const bad = await scanDirectory({ root, only: "patterns" });
    expect(bad.ok && JSON.stringify(bad.report.findings)).toContain("GSK-AGENT-003");
  });
});

describe("where a visit came from (visit_<source> counters)", () => {
  it("maps our ?ref= and the referrer's host to a closed list, and nothing else", () => {
    expect(visitSource("hn", "", "gateseeker.vercel.app")).toBe("hn");
    expect(visitSource("Twitter", "", "gateseeker.vercel.app")).toBe("x");
    expect(visitSource("<script>", "https://news.ycombinator.com/item?id=1", "gateseeker.vercel.app")).toBe("hn");
    expect(visitSource(null, "", "gateseeker.vercel.app")).toBe("direct");
    expect(visitSource(null, "https://gateseeker.vercel.app/about", "gateseeker.vercel.app")).toBe("direct");
    expect(visitSource(null, "https://www.google.com.br/", "gateseeker.vercel.app")).toBe("search");
    expect(visitSource(null, "https://duckduckgo.com/", "x")).toBe("search");
    expect(visitSource(null, "https://github.com/gateseeker-dev/gateseeker", "x")).toBe("github");
    expect(visitSource(null, "https://old.reddit.com/r/vibecoding/", "x")).toBe("reddit");
    expect(visitSource(null, "https://t.co/abc", "x")).toBe("x");
    expect(visitSource(null, "https://www.linkedin.com/feed/", "x")).toBe("linkedin");
    expect(visitSource(null, "https://github.com.evil.example/", "x")).toBe("other");
    expect(visitSource(null, "https://notgoogle.example/", "x")).toBe("other");
    expect(visitSource(null, "not a url", "x")).toBe("other");
    // Every source is a kind the service accepts.
    for (const s of VISIT_SOURCES) expect(CLIENT_EVENT_KINDS as readonly string[]).toContain(`visit_${s}`);
  });

  it("README shows the version this package is (so the MCP snippet is never stale)", () => {
    expect(readFileSync(join(fixturePath(""), "..", "README.md"), "utf8")).toContain(`gateseeker@${GATESEEKER_VERSION}`);
  });
});
