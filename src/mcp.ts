import { createInterface } from "node:readline";
import { relative, resolve, sep } from "node:path";
import { realpath, stat } from "node:fs/promises";
import { z } from "zod";

import { renderText } from "./report/text.js";
import { PRIORITIES } from "./rules/priority.js";
import { scanDirectory, type ScanDirectoryOptions, type ScanResult } from "./scan.js";
import { GATESEEKER_VERSION } from "./version.js";

/**
 * `gateseeker mcp`: a Model Context Protocol server over stdio, so a coding
 * agent (Claude Code, Cursor, ...) can run the gate on the project it is
 * working in. JSON-RPC 2.0, one message per line, no SDK (rule 8).
 *
 * One tool, `gateseeker_scan`, with the CLI's engine and defaults. Safety:
 *   - it only reads, like the CLI: nothing from the project is executed;
 *   - the path the agent asks for must stay inside the directory the server
 *     was started in (the project), so a prompt injected into a file cannot
 *     make the agent scan the home directory;
 *   - the answer is the sanitized text report: secrets are already redacted.
 */

/** Newest first; the client's version is echoed when we know it, otherwise our newest (the client then decides). */
export const MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type JsonRpcId = string | number;
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpServerOptions {
  /** The project directory; every scan stays inside it. */
  root: string;
  /** Engine options passed to every scan (tests inject OSV doubles here). */
  scan?: Omit<ScanDirectoryOptions, "root" | "only" | "failOn">;
  /** Replaces the engine (tests). */
  scanDirectory?: (options: ScanDirectoryOptions) => Promise<ScanResult>;
}

const TOOL = {
  name: "gateseeker_scan",
  title: "Gateseeker security gate",
  description:
    "Checks the project for known-vulnerable or malicious dependencies (OSV and the Gateseeker curated feed), insecure patterns common in AI-generated code (keys in client code, Supabase without RLS, open CORS, committed .env) and risky AI agent configuration. Reads files only; never runs the project. Returns a verdict (pass, fail or incomplete) and the findings by priority with the fix for each. Run it before committing or when the user asks whether the project has security problems.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory to check, relative to the project root. Default: the project root." },
      only: { type: "string", enum: ["deps", "patterns"], description: "Run a single analysis: deps (dependencies) or patterns (code and agent configuration). Default: both." },
      fail_on: { type: "string", enum: [...PRIORITIES], description: "Lowest priority that makes the verdict fail. Default: P2." },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
} as const;

const argsSchema = z.strictObject({
  path: z.string().max(1000).optional(),
  only: z.enum(["deps", "patterns"]).optional(),
  fail_on: z.enum(["P1", "P2", "P3", "P4"]).optional(),
});

const INSTRUCTIONS =
  "Gateseeker is a deterministic security gate. Call gateseeker_scan before committing changes. A fail verdict lists what to fix first (P1 before P2). An incomplete verdict means part of the check could not run: say so, never report it as clean. No known vulnerabilities were found in the sources consulted is the strongest statement a pass allows; never call the project secure.";

function ok(id: JsonRpcId | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(id: JsonRpcId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolError(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

/** The directory to scan, or null when it leaves the project root. */
function inside(root: string, path: string | undefined): string | null {
  const target = resolve(root, path ?? ".");
  const rel = relative(root, target);
  if (rel === "") return target;
  if (rel.startsWith("..") || resolve(rel) === rel || rel.split(sep).includes("..")) return null;
  return target;
}

async function callScan(options: McpServerOptions, raw: unknown) {
  const parsed = argsSchema.safeParse(raw ?? {});
  if (!parsed.success) return toolError("Invalid arguments: path (string), only (deps or patterns) and fail_on (P1 to P4) are the only ones accepted.");
  const root = await realpath(resolve(options.root));
  let target = inside(root, parsed.data.path);
  if (target === null) return toolError("The path must stay inside the project the server was started in.");
  try {
    // Through links too: a link inside the project that points outside it is refused like "../".
    target = inside(root, relative(root, await realpath(target)));
    if (target === null) return toolError("The path must stay inside the project the server was started in.");
    if (!(await stat(target)).isDirectory()) return toolError("The path must be a directory.");
  } catch {
    return toolError("The path does not exist.");
  }
  const run = options.scanDirectory ?? scanDirectory;
  const result = await run({ ...options.scan, root: target, failOn: parsed.data.fail_on ?? "P2", ...(parsed.data.only ? { only: parsed.data.only } : {}) });
  if (!result.ok) return toolError(`Input rejected (${result.error.code}): ${result.error.message}`);
  const r = result.report;
  return {
    content: [{ type: "text", text: renderText(r) }],
    structuredContent: { verdict: r.gate.verdict, reason: r.gate.reason, failOn: r.gate.failOn, byPriority: r.summary.byPriority, findings: r.findings.length },
    isError: false,
  };
}

/**
 * Handles one parsed JSON-RPC message; null for notifications (no answer).
 * Exported for tests: the stdio loop only frames lines around it.
 */
export async function handleMcpMessage(message: unknown, options: McpServerOptions): Promise<JsonRpcResponse | null> {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return err(null, -32600, "Invalid request.");
  const m = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const hasId = typeof m.id === "string" || typeof m.id === "number";
  const id = hasId ? (m.id as JsonRpcId) : null;
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return hasId || m.id === undefined ? err(id, -32600, "Invalid request.") : null;
  // A notification (no id) is never answered, known or not.
  if (!hasId) return null;
  const params = (typeof m.params === "object" && m.params !== null ? m.params : {}) as Record<string, unknown>;

  switch (m.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const version = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0];
      return ok(id, { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gateseeker", title: "Gateseeker", version: GATESEEKER_VERSION }, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: [TOOL] });
    case "tools/call": {
      if (params.name !== TOOL.name) return err(id, -32602, `Unknown tool: ${typeof params.name === "string" ? params.name.slice(0, 60) : "(none)"}.`);
      try {
        return ok(id, await callScan(options, params.arguments));
      } catch (e) {
        return ok(id, toolError(`The scan stopped with an unexpected error: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
    default:
      return err(id, -32601, `Method not found: ${m.method.slice(0, 60)}.`);
  }
}

/** Reads newline-delimited JSON-RPC from stdin and writes answers to stdout; logs only to stderr. */
export async function runMcpServer(options: McpServerOptions, io: { input: NodeJS.ReadableStream; output: (s: string) => void }): Promise<void> {
  const lines = createInterface({ input: io.input, crlfDelay: Infinity });
  const pending: Promise<void>[] = [];
  for await (const line of lines) {
    if (line.trim() === "") continue;
    // Messages are answered as they finish: a long scan does not hold up a ping.
    pending.push(
      (async () => {
        let message: unknown;
        try {
          message = JSON.parse(line) as unknown;
        } catch {
          io.output(`${JSON.stringify(err(null, -32700, "Parse error."))}\n`);
          return;
        }
        const answer = await handleMcpMessage(message, options);
        if (answer) io.output(`${JSON.stringify(answer)}\n`);
      })(),
    );
  }
  await Promise.all(pending);
}
