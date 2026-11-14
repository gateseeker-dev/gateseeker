# We scanned 10 popular repos' coding-agent config. Here is what a security gate should look for.

> Draft for the PO's review (2026-11-03). Target: Hacker News ("Show HN"), dev.to, the Claude Code and Cursor communities. Numbers come from `docs/VALIDATION_SPRINT_5.md` (measured 2026-10-30). Keep the claims exactly as measured; the sample is small and the post says so.

Claude Code, Cursor, Codex and friends do not only write code. They run commands, install packages and edit project configuration, and they read instruction files that anyone can commit to a repository. Security scanners look at the code these agents produce. None of the ones we checked look at the **configuration that decides what the agent is allowed to do**.

So we wrote five rules for that and ran them on ten public repositories that ship agent configuration (`.claude/`, `.cursor/`, `.codex/`, `.mcp.json`, `CLAUDE.md`, `AGENTS.md`): 144 agent files in total, from projects like glances, Strapi's docs, Sentry's toolkit and two popular Next.js SaaS templates.

## The five things we check

| Rule | What it flags |
|---|---|
| GSK-AGENT-001 | Unrestricted command permission: `Bash` allowed wholesale, `defaultMode: bypassPermissions`, auto-approve everything. Any command the agent decides to run executes without asking you. |
| GSK-AGENT-002 | A hook or environment step that downloads and runs remote code (`curl … \| sh`, `npx something@latest`) while the agent works. |
| GSK-AGENT-003 | An MCP server started from an unpinned or remote source, or with a secret inline instead of an environment variable reference. |
| GSK-AGENT-004 | Hidden instructions in files agents read: invisible Unicode, HTML comments carrying directives, encoded text. The classic prompt-injection carrier. |
| GSK-AGENT-005 | Safety nets switched off in config: `--no-verify` on commits, tests skipped in CI, hooks disabled. |

All five are deterministic pattern rules, each shipped with a positive, a negative and a suppression fixture, a timing test against pathological input, and a plain-language explanation of what the setting allows. They report configuration, not incidents: the wording never claims an attack happened.

## What we found

Three findings in 144 files, all confirmed by hand, all in one repository:

- `.claude/settings.json` with `defaultMode: "bypassPermissions"` and `"Bash"` in the allow list: every command runs without a prompt.
- `.cursor/environment.json` with `"install": "curl -fsSL https://bun.sh/install | bash -s …"`: Cursor runs this on its own when it sets up the agent's background environment. The source is Bun's official installer with a pinned version, which lowers the risk in practice; the rule still flags it, because a remote script executed without review is what it is.

The other nine repositories had nothing to flag, and an independent text sweep of the same 144 files agreed. That matters as much as the findings: over 40 legitimate HTML comments in Strapi's Cursor rules, `localhost` MCP servers, documentation lines like `npx shadcn@latest add` and a narrow `Bash(npx @sentry/dotagents@latest doctor --fix)` permission were all correctly left alone.

Two false positives from the first run were fixed before this write-up: a `-n` that belonged to `jq`, not to `git commit`, and an `Authorization: Bearer ${TOKEN}` that is a variable reference, not a literal secret. One false negative was found by the sweep and fixed too: the Cursor `environment.json` case above, which the rule did not read at first.

Precision after the fixes: 3 of 3. Sample of ten repositories: this is plausibility, not statistics, and all five rules stay in warn mode until a larger measurement justifies failing a build on them.

## Why a gate, not a checklist

A vibe coder does not read security checklists. They paste a URL, or they add a workflow once. Gateseeker does both: paste a public GitHub repository and read the report in the browser, or add the Action and every pull request gets a summary comment, SARIF in the Security tab, and a failing check when a P1 or P2 finding appears. The agent-config rules run next to known-vulnerability checks (OSV plus a curated feed of incidents the public databases missed), supply-chain signals and the insecure patterns common in AI-generated apps: hardcoded keys in client bundles, Supabase tables without RLS, open CORS with credentials, committed `.env` files.

It reads the repository and never runs it. It is open source (MIT), the rules are a few hundred lines each, and the validation document with the ten commits is in the repo.

- Try it: https://gateseeker.vercel.app
- Rules and the validation: https://github.com/gateseeker-dev/gateseeker/blob/main/docs/VALIDATION_SPRINT_5.md
- Propose a rule or report a false positive: issues welcome.
