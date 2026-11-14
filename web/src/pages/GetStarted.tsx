import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gateseeker/ui-kit";
import { Bot, Globe, Terminal } from "lucide-react";
import { claudeHookSettings, mcpConfig } from "gateseeker/dist/agent-snippets.js";
import type { ReactNode } from "react";

import { CiSnippet } from "../components/CiSnippet";
import { PageIntro } from "../components/PageIntro";
import { Link } from "../router";
import { BUILT_VERSION } from "../update-notice";

export function GetStarted() {
  return (
    <>
      <PageIntro title="Get started" lead="Four ways to run the same engine. Pick the one that matches where you are: curious, at the terminal, inside your AI agent, or about to merge." />

      <div className="grid gap-6">
        <Step n={1} icon={<Globe aria-hidden="true" />} title="In the browser, no install">
          <CardDescription>
            Sign in with GitHub, paste the URL of a public GitHub repository and get the full report in under a minute for most projects. Free and rate limited; public repositories only, up to 50 MB compressed. <Link href="/login?next=/app" className="text-primary hover:underline">Open the workspace</Link>.
          </CardDescription>
        </Step>

        <Step n={2} icon={<Terminal aria-hidden="true" />} title="On your machine, any repository" description="Needs Node 24. Nothing is installed from the analyzed project; the CLI only reads it.">
          <pre className="overflow-x-auto rounded-md border bg-input p-4 font-mono text-xs leading-relaxed inset-shadow-solid"><code>{`npx gateseeker scan .            # text report, exit code is the verdict
npx gateseeker scan . --format json --output report.json
npx gateseeker scan . --baseline base.lock   # compare with a previous lockfile`}</code></pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Exit codes: 0 pass, 1 fail, 2 incomplete, 3 usage error. Every option is in the <Link href="https://github.com/gateseeker-dev/gateseeker#readme" className="text-primary hover:underline">README</Link>.
          </p>
        </Step>

        <section id="agent" className="scroll-mt-6">
          <Step n={3} icon={<Bot aria-hidden="true" />} title="Inside your AI agent" description="Claude Code, Cursor and other agents that speak MCP can run the gate themselves. It reads files only, like the CLI, and never leaves the project folder.">
            <p className="text-sm text-muted-foreground">
              Ask your agent to check the project: save this as <code className="rounded bg-muted px-1.5 py-0.5">.mcp.json</code> at the project root (Cursor: <code className="rounded bg-muted px-1.5 py-0.5">.cursor/mcp.json</code>). The version is pinned on purpose.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md border bg-input p-4 font-mono text-xs leading-relaxed inset-shadow-solid"><code>{mcpConfig(BUILT_VERSION)}</code></pre>
            <p className="mt-4 text-sm text-muted-foreground">
              Hold Claude Code's commits while a P1 or P2 finding is open: install Gateseeker in the project (<code className="rounded bg-muted px-1.5 py-0.5">npm install --save-dev gateseeker</code>) and add this hook to <code className="rounded bg-muted px-1.5 py-0.5">.claude/settings.json</code>. It runs only before <code className="rounded bg-muted px-1.5 py-0.5">git commit</code> and tells the agent what to fix. Like the Action, code-pattern findings are reported but do not hold the commit unless you add <code className="rounded bg-muted px-1.5 py-0.5">--patterns gate</code> to the command.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md border bg-input p-4 font-mono text-xs leading-relaxed inset-shadow-solid"><code>{claudeHookSettings()}</code></pre>
          </Step>
        </section>

        <CiSnippet />

        <Card>
          <CardHeader>
            <CardTitle>Show it in your README</CardTitle>
            <CardDescription>A small badge that links here. It says the repository is checked with Gateseeker; it never says the project is secure.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <img src="/badge.svg" alt="checked with Gateseeker" width={178} height={20} className="justify-self-start" />
            <pre className="overflow-x-auto rounded-md border bg-input p-4 font-mono text-xs leading-relaxed inset-shadow-solid"><code>{`[![checked with Gateseeker](https://gateseeker.vercel.app/badge.svg)](https://gateseeker.vercel.app)`}</code></pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What is next</CardTitle>
            <CardDescription>Signed in, you can follow a repository and get an email when something new appears, and analyze private repositories. Team gate policies are on the roadmap. The engine, the rules and the Action stay open source. Tell us what you need on GitHub.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}

function Step({ n, icon, title, description, children }: { n: number; icon: ReactNode; title: string; description?: string; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/35 bg-primary/12 text-primary [&_svg]:size-5">{icon}</span>
        <div className="grid gap-1">
          <p className="font-mono text-xs text-primary">Step {n}</p>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      {children && <CardContent className="sm:pl-[4.75rem]">{children}</CardContent>}
    </Card>
  );
}
