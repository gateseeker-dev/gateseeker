import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@gateseeker/ui-kit";

import { PageIntro } from "../components/PageIntro";
import { Link } from "../router";

export function About() {
  return (
    <>
      <PageIntro title="About" lead="Gateseeker exists because software is now written faster than it is reviewed." />

      <div className="grid gap-12">
        <Section title="Why">
          <p>
            Tools like Lovable, Bolt, Cursor, v0 and Replit let a founder, a freelancer or a small studio ship a working product in days. None of them runs a security check on what they generate, and the people shipping with them usually do not have a security specialist, will not read a four-hundred-line report, and already ignore dependency alerts because nobody tells them which one matters.
          </p>
          <p>
            The result is predictable: keys in client bundles, databases exposed through disabled row-level security, open CORS, committed .env files, and dependencies that are vulnerable or, increasingly, malicious. Gateseeker is a gate for exactly that code: it finds the handful of findings that matter, explains why in one sentence each, and blocks the merge when they are serious.
          </p>
        </Section>

        <Section title="Where it started">
          <p>
            In May 2026 the Laravel-Lang packages on Packagist had their release tags rewritten to point at malicious commits. Anyone who installed in the window got the payload; the official vulnerability databases had no record of it months later. That incident shaped two Gateseeker principles: supply-chain intelligence needs a curated, human-approved feed next to the official databases, and a tool that analyzes untrusted projects must never execute them.
          </p>
        </Section>

        <Section title="What it is, and is not">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-success">It is</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">A deterministic checker, on your machine, in your CI or on this website. It reads project files, consults public vulnerability sources, applies published rules, and returns prioritized findings with evidence, references and a verdict.</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-destructive">It is not</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">A penetration test, an infrastructure scanner, a runtime monitor, or an auto-fixer. It does not use AI to decide whether a vulnerability exists. It never says a project is "secure": only that no known vulnerabilities were found in the sources consulted.</CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Open source, open data">
          <p>
            The engine, the rules and the GitHub Action are MIT-licensed. The curated advisories are published under CC BY 4.0, so OSV and anyone else can reuse them. Nobody in our audience installs a security tool they cannot read; so you can read all of it on{" "}
            <Link href="https://github.com/gateseeker-dev/gateseeker" className="text-primary hover:underline">GitHub</Link>.
          </p>
          <p>The website adds accounts, history and alerts on top of the same engine; private repositories are on the roadmap. The gate itself will stay open.</p>
        </Section>

        <Section title="Privacy">
          <p>The website keeps as little as it can, and you can delete all of it yourself:</p>
          <ul className="grid list-disc gap-2 pl-5">
            <li>Your GitHub login and avatar, shown on screen; your email address, used only for the alerts on repositories you follow, read at the moment an email is sent and never copied into our database.</li>
            <li>Saved reports for 30 days and one line of history per analysis for 180 days, opened only by your account.</li>
            <li>No advertising or tracking cookies and no analytics service; only aggregate daily counters without any user or IP address.</li>
            <li>Every email has a one-click unsubscribe link, and Settings has a button that deletes your account and all of the above at once.</li>
          </ul>
          <p>
            The full <Link href="/privacy" className="text-primary hover:underline">privacy notice</Link> lists every provider and your rights under the LGPD; the <Link href="/terms" className="text-primary hover:underline">terms of use</Link> say what the results do and do not mean.
          </p>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t pt-8 sm:grid-cols-[12rem_1fr] sm:gap-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="grid max-w-2xl gap-4 text-base leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
