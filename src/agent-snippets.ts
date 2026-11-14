/**
 * The configuration we tell people to paste, in one place: README, the Get
 * started page and a test that scans these exact files with our own agent
 * rules (GSK-AGENT-002/003), so what we recommend never trips what we warn about.
 */

/** `.mcp.json` at the project root: Claude Code, and Cursor in `.cursor/mcp.json`. The package is pinned (GSK-AGENT-003). */
export function mcpConfig(version: string): string {
  return `${JSON.stringify({ mcpServers: { gateseeker: { command: "npx", args: ["-y", `gateseeker@${version}`, "mcp"] } } }, null, 2)}\n`;
}

/**
 * `.claude/settings.json`: the commit hook. It runs the copy installed in the
 * project (`npm install --save-dev gateseeker`), never one downloaded on the
 * spot (GSK-AGENT-002).
 */
export function claudeHookSettings(): string {
  return `${JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "npx --no-install gateseeker hook claude-code" }] }] } }, null, 2)}\n`;
}
