import { z } from "zod";

import { PRIORITY_LABEL } from "./report/labels.js";
import { sanitize } from "./report/text.js";
import { PRIORITIES } from "./rules/priority.js";
import { scanDirectory, type ScanDirectoryOptions, type ScanResult } from "./scan.js";
import type { PatternsMode, Priority } from "./types.js";

/**
 * `gateseeker hook claude-code`: a PreToolUse hook for Claude Code that runs
 * the gate when the agent is about to `git commit`, and blocks the commit
 * (exit code 2, reason on stderr, which Claude Code hands back to the agent)
 * when the verdict is fail or incomplete. Every other tool call passes
 * untouched and fast: nothing is scanned.
 *
 * Opt-in by design (docs/ROADMAP.md, track A3): the user adds the hook to
 * their own settings; Gateseeker never installs it.
 */

export const HOOK_EXIT = { allow: 0, error: 1, block: 2 } as const;

const inputSchema = z.looseObject({
  tool_name: z.string().optional(),
  tool_input: z.looseObject({ command: z.string().optional() }).optional(),
  cwd: z.string().optional(),
});

/** `git commit` anywhere in the command (also after `&&`, with options between). Bounded: no backtracking on long input. */
const COMMIT = /(?:^|[;&|(\s])git(?:\s+-[cC]\s+\S{1,200}|\s+--?[\w-]{1,40}(?:=\S{1,200})?){0,8}\s+commit(?:[\s;&|)]|$)/;

export function isCommitCommand(command: string): boolean {
  return command.length <= 10_000 && COMMIT.test(command);
}

export interface HookOptions {
  failOn?: Priority;
  patternsMode?: PatternsMode;
  allowIncomplete?: boolean;
  /** Engine options for the scan (tests inject OSV doubles here). */
  scan?: Omit<ScanDirectoryOptions, "root" | "failOn" | "patternsMode">;
  scanDirectory?: (options: ScanDirectoryOptions) => Promise<ScanResult>;
  cwd?: string;
}

export async function runClaudeCodeHook(stdin: string, options: HookOptions, stderr: (s: string) => void): Promise<number> {
  let raw: unknown;
  try {
    raw = JSON.parse(stdin) as unknown;
  } catch {
    stderr("gateseeker hook: expected the hook's JSON on stdin.\n");
    return HOOK_EXIT.error;
  }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    stderr("gateseeker hook: unexpected hook input.\n");
    return HOOK_EXIT.error;
  }
  const command = parsed.data.tool_input?.command;
  if (parsed.data.tool_name !== "Bash" || command === undefined || !isCommitCommand(command)) return HOOK_EXIT.allow;

  const failOn = options.failOn ?? "P2";
  const run = options.scanDirectory ?? scanDirectory;
  const result = await run({ ...options.scan, root: parsed.data.cwd ?? options.cwd ?? process.cwd(), failOn, patternsMode: options.patternsMode ?? "warn" });
  if (!result.ok) {
    stderr(`Gateseeker could not check this project (${result.error.code}): ${sanitize(result.error.message, 300)}\n`);
    return options.allowIncomplete ? HOOK_EXIT.allow : HOOK_EXIT.block;
  }
  const report = result.report;
  const verdict = report.gate.verdict;
  if (verdict === "pass") return HOOK_EXIT.allow;

  const threshold = PRIORITIES.indexOf(failOn);
  const top = report.findings.filter((f) => PRIORITIES.indexOf(f.priority) <= threshold).slice(0, 5);
  const lines = [
    verdict === "fail" ? "Gateseeker blocked this commit: fix these first." : "Gateseeker could not complete its check, so this commit is held: an unverified project is not reported as clean.",
    sanitize(report.gate.reason, 400),
    ...top.map((f) => `- ${f.priority} (${PRIORITY_LABEL[f.priority]}): ${sanitize(f.subject, 160)}. ${sanitize(f.remediation.action, 240)}`),
    "Full report with the fix for each finding: npx gateseeker scan .",
  ];
  if (verdict === "incomplete" && options.allowIncomplete) {
    stderr(`${lines.join("\n")}\n(--allow-incomplete: the commit goes ahead.)\n`);
    return HOOK_EXIT.allow;
  }
  stderr(`${lines.join("\n")}\n`);
  return HOOK_EXIT.block;
}
