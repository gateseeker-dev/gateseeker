import type { ReactNode } from "react";

import { PageIntro } from "../components/PageIntro";
import { Link } from "../router";

/**
 * /privacy and /terms: the hosted service's privacy notice and terms of use,
 * in plain language (docs/SPRINT_6.md 5). Every statement here must match
 * what the code does: retention periods come from the store and the cleanup
 * cron, the list of providers from the deployment (docs/DEPLOY.md). Change
 * both together. Operator and contact were given by the PO on 2026-11-01.
 */

export const LEGAL = {
  operator: "Fernando Capone",
  contact: "fernando.capone@gmail.com",
  updated: "1 November 2026",
};

const mail = <Link href={`mailto:${LEGAL.contact}`} className="text-primary hover:underline">{LEGAL.contact}</Link>;

export function Privacy() {
  return (
    <>
      <PageIntro title="Privacy" lead={`What the Gateseeker website keeps about you, why, for how long, and how to delete it. Last updated ${LEGAL.updated}.`} />
      <div className="grid gap-12">
        <Section title="In short">
          <p>Gateseeker keeps as little as it can. You sign in with GitHub; we use your login and avatar on screen and your email address only to send the alerts you turn on. Your reports are visible only to your account. There are no advertising or tracking cookies, and no analytics service. You can delete your account and everything kept for it from Settings at any time.</p>
          <p>The command-line tool and the GitHub Action run on your own machine or CI. They send package names and versions to OSV and nothing to us; this notice is about the website.</p>
        </Section>

        <Section title="Who is responsible">
          <p>
            The Gateseeker website is operated by {LEGAL.operator}, an individual based in Brazil, who is the controller of the personal data described here under Brazil's General Data Protection Law (LGPD, Law 13.709/2018). For any question or request about your data, write to {mail}.
          </p>
        </Section>

        <Section title="What we keep">
          <Dl
            rows={[
              ["Your account", "Your GitHub user id, login, name, avatar address and the email address GitHub shares, kept by our sign-in provider (Supabase Auth) while the account exists. We never receive your GitHub password. Signing in gives us no access to your repositories; private repositories are read only through the separate authorization below."],
              ["GitHub App authorizations", "When you allow Gateseeker to read private repositories, GitHub records an installation of our App on your account or organization, read-only and limited to the repositories you pick there. We keep the installation's number and whose it is, so we can ask GitHub for a one-hour token when you analyze or follow one of those repositories. The token is used for that analysis and never stored. Disconnect in Settings, or uninstall the App on GitHub, at any time; deleting your account removes our record."],
              ["Saved reports", "The result of each analysis you run: repository name, commit, findings and the code lines they point to (secret values are always masked). Public repositories only. Deleted after 30 days."],
              ["Analysis history", "One line per analysis (repository, commit, verdict, counts by priority), so the dashboard works on any device. Deleted after 180 days."],
              ["Followed repositories", "Which repositories you follow, the date of the last check and a short summary of new findings waiting for the next email. Kept until you unfollow, unsubscribe from an email, or delete your account."],
              ["Usage limits", "How many analyses your account ran in the current hour, to keep the free service fair."],
              ["Access dates", "When your account first used the service and when it last did, with a precision of five minutes. No IP address, browser or page is recorded. The product's operator sees these dates and your account's activity (which public repositories you analyzed and follow, and the reports you shared) to run the service, answer you and prevent abuse; never the findings of your reports."],
              ["Aggregate counters", "Daily totals such as visits to the sign-in page, sign-ins, checks of followed repositories, emails sent and unsubscribes. They hold no user, IP address or browser information."],
              ["In your browser", "Your session (so you stay signed in), a copy of your recent history, notifications and preferences, in local storage on your device. Clearing site data or signing out removes the session; deleting the account removes the rest from that browser."],
            ]}
          />
          <p>We do not copy your email address into our own tables: it is read from the sign-in record at the moment an email is sent. We do not sell or share personal data, and we do not use it for advertising or to train AI models.</p>
        </Section>

        <Section title="Why, and on what legal basis">
          <ul className="grid list-disc gap-2 pl-5">
            <li><strong className="text-foreground">Providing the service you asked for</strong> (account, analyses, reports, history): performance of a contract, LGPD art. 7, V.</li>
            <li><strong className="text-foreground">Email alerts</strong> about repositories you follow: your consent, given each time you click Follow and withdrawn by unfollowing or with the link in every email, art. 7, I.</li>
            <li><strong className="text-foreground">Keeping the service working and fair</strong> (usage limits, abuse prevention, error logs): legitimate interest, art. 7, IX.</li>
          </ul>
        </Section>

        <Section title="Who processes data for us">
          <p>These providers run parts of the service and see only what they need for it. Their servers may be outside Brazil; each one is bound by its own data processing terms.</p>
          <Dl
            rows={[
              ["Vercel", "Hosts the website and the functions that run analyses. Its request logs, which include IP addresses, are kept for a short period under Vercel's policy."],
              ["Supabase", "Sign-in and the database described above."],
              ["GitHub", "Sign-in with your GitHub account, the source of the repositories you analyze, and the App installations that let us read the private ones you authorized."],
              ["Brevo", "Sends the alert emails: receives your email address, the repository name and the short list of new findings for that email. Brevo keeps delivery logs under its own policy."],
              ["OSV.dev", "Receives package names and versions from the analyzed repository to look up known vulnerabilities. No personal data."],
            ]}
          />
        </Section>

        <Section title="Your rights">
          <p>Under the LGPD (art. 18) you can ask us to confirm whether we hold data about you, give you a copy, correct it, delete it, tell you who we share it with, and withdraw consent. People in the European Union and the United Kingdom have equivalent rights under the GDPR.</p>
          <p>
            You can do most of this yourself: see your history in the workspace, unfollow in Settings, and use <strong className="text-foreground">Delete account</strong> in Settings to remove the account and everything listed above at once. For anything else, write to {mail}; we answer within 15 days. You can also complain to Brazil's data protection authority (ANPD) or the authority where you live.
          </p>
        </Section>

        <Section title="Security">
          <p>The browser never talks to our database: only the server does, with a key kept in the hosting provider's environment settings. Every table has row level security on. Analyzed repositories are read as text and never installed or executed. No system can promise it will never be breached; if a breach affecting your data happens, we will tell you and the ANPD as the law requires.</p>
        </Section>

        <Section title="Children">
          <p>The service is meant for people building software professionally and is not directed at children. Do not create an account if you are under 18.</p>
        </Section>

        <Section title="Changes">
          <p>When this notice changes, the date at the top changes; for changes that matter we also tell signed-in users by email or in the workspace. The previous versions are in the public repository history on <Link href="https://github.com/gateseeker-dev/gateseeker/commits/main/web/src/pages/Legal.tsx" className="text-primary hover:underline">GitHub</Link>.</p>
        </Section>
      </div>
    </>
  );
}

export function Terms() {
  return (
    <>
      <PageIntro title="Terms of use" lead={`The rules for using the Gateseeker website. Last updated ${LEGAL.updated}.`} />
      <div className="grid gap-12">
        <Section title="Who and what">
          <p>
            These terms are an agreement between you and {LEGAL.operator}, the individual based in Brazil who operates the Gateseeker website (the "service"). By signing in you accept them and the <Link href="/privacy" className="text-primary hover:underline">privacy notice</Link>. If you do not agree, do not use the service.
          </p>
          <p>The Gateseeker command-line tool, GitHub Action and rules are open source under the MIT license, and the curated advisories under CC BY 4.0. Those licenses, not these terms, govern the code and data you download from the repository; these terms cover the hosted website.</p>
        </Section>

        <Section title="The service">
          <p>Gateseeker reads the files of a GitHub repository (public, or private ones you authorized through our GitHub App), checks the installed dependencies against public vulnerability sources and a curated advisory feed, looks for common insecure patterns, and ranks the findings with published rules. It never installs or runs the code it analyzes. Only analyze repositories you are allowed to read.</p>
          <p>The service is currently free, offered as a demo, with limits on analyses per hour, repository size and followed repositories. We may change features or limits, or stop the service, at any time; when we stop it we will give signed-in users notice where we reasonably can and time to keep what they need.</p>
        </Section>

        <Section title="What the results mean">
          <p>
            Results are automated, informational and limited to what the rules and the sources consulted know at the time of the analysis. A finding may be wrong (a false positive), and real problems may go unreported (false negatives). "No known vulnerabilities were found in the sources consulted" means exactly that; it does not mean a project is secure. An "incomplete" verdict means part of the analysis could not be done.
          </p>
          <p>Gateseeker is not a security audit, a penetration test or professional advice. You remain responsible for the security of your software and for the decisions you make with the results.</p>
        </Section>

        <Section title="Your account">
          <p>You sign in with your own GitHub account, one account per person, and are responsible for what happens under it. Keep your GitHub account protected. You can delete your Gateseeker account at any time in Settings.</p>
        </Section>

        <Section title="Acceptable use">
          <p>You may analyze any public repository. You agree not to:</p>
          <ul className="grid list-disc gap-2 pl-5">
            <li>get around the usage limits, for example with several accounts or automated requests;</li>
            <li>probe, overload or attack the service, or try to read data of other accounts;</li>
            <li>use results about someone else's project to attack it. If you find a problem in a project that is not yours, tell its maintainers privately first;</li>
            <li>use the service in breach of the law or of GitHub's terms.</li>
          </ul>
          <p>We may suspend or delete accounts that break these rules, telling you why when we can.</p>
        </Section>

        <Section title="Content and names">
          <p>Repositories you analyze remain their owners'. Reports are generated from public data and are visible only to the account that ran them. GitHub, Supabase, Lovable, Bolt, Cursor, v0, Replit and other names mentioned on this site are trademarks of their owners and are used only to describe compatibility; Gateseeker is not affiliated with or endorsed by them.</p>
        </Section>

        <Section title="Liability">
          <p>
            The service is provided as it is and as available, without guarantees of uninterrupted operation or of finding every problem. To the extent the law allows, the operator is not liable for indirect damages, lost profits or lost data arising from the use of the service or of its results. Nothing in these terms limits rights you have that the law does not allow to be limited, including those under Brazil's Consumer Defense Code.
          </p>
        </Section>

        <Section title="Changes and law">
          <p>If these terms change in a way that matters, the date at the top changes and signed-in users are told before the change applies; continuing to use the service afterwards means accepting the new version.</p>
          <p>These terms are governed by the laws of Brazil. Disputes go to the courts of Brazil; if you are a consumer, you may bring them in the courts where you live. Questions: {mail}.</p>
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

function Dl({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-4">
      {rows.map(([term, text]) => (
        <div key={term} className="grid gap-1">
          <dt className="font-medium text-foreground">{term}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  );
}
