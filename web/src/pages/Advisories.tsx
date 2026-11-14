import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, buttonVariants, cn } from "@gateseeker/ui-kit";
import bundled from "gateseeker/dist/advisories.json";
import { ArrowRight, ExternalLink } from "lucide-react";

import { PageIntro } from "../components/PageIntro";
import { Link } from "../router";

/**
 * /advisories and /advisories/<id>: one public page per approved record of
 * the curated feed, built from the advisory set bundled at build time
 * (dist/advisories.json). Every field is rendered as text; source URLs are
 * the only links, and only when they are http(s).
 */

interface AdvisoryRecord {
  id: string;
  status: string;
  type: string;
  severity: string;
  ecosystem: string;
  packages: { name: string; affected: { versions?: string[]; ranges?: { introduced: string; fixed?: string }[]; tags?: string[]; commits_after?: string | null; fixed_in?: string | null } }[];
  window: { start: string | null; end: string | null };
  indicators: string[];
  summary: string;
  remediation: string;
  sources: { url: string; publisher: string; title: string; published_at: string }[];
  review: { reviewed_at: string | null };
  upstream: { osv: string | null; ghsa: string | null };
}

const RECORDS: AdvisoryRecord[] = (Array.isArray(bundled) ? (bundled as AdvisoryRecord[]) : []).filter((a) => a.status === "approved").sort((a, b) => (b.window.start ?? "").localeCompare(a.window.start ?? ""));

const TYPE_LABEL: Record<string, string> = {
  "tag-rewrite": "Rewritten tags",
  "malicious-version": "Malicious version",
  "compromised-maintainer": "Compromised maintainer",
  typosquat: "Typosquat",
  "install-script-backdoor": "Install-script backdoor",
  other: "Supply-chain incident",
};

function severityVariant(s: string): "critical" | "high" | "moderate" | "low" {
  return s === "CRITICAL" ? "critical" : s === "HIGH" ? "high" : s === "MODERATE" ? "moderate" : "low";
}

function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "unknown";
}

export function Advisories() {
  return (
    <>
      <PageIntro title="Curated advisories" lead="Supply-chain incidents the public vulnerability databases missed or recorded late. A robot collects candidates from security publishers; a person reviews each one before the scanner uses it. Approved records are proposed upstream to OSV." />
      <ul className="grid gap-4">
        {RECORDS.map((a) => (
          <li key={a.id}>
            <Link href={`/advisories/${a.id}`} className="block rounded-xl border bg-card p-5 transition-colors hover:border-border-strong">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{a.id}</Badge>
                <Badge variant={severityVariant(a.severity)}>{a.severity}</Badge>
                <Badge variant="secondary">{a.ecosystem}</Badge>
                <span className="text-muted-foreground">{TYPE_LABEL[a.type] ?? a.type} · {day(a.window.start)}</span>
              </div>
              <h2 className="text-base font-semibold tracking-tight">{a.packages.map((p) => p.name).join(", ")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
      {RECORDS.length === 0 && <p className="text-sm text-muted-foreground">No approved record in this build.</p>}
      <p className="mt-8 text-xs text-muted-foreground">
        Records are JSON files under <Link href="https://github.com/gateseeker-dev/gateseeker/tree/main/advisories" className="text-primary hover:underline">advisories/</Link> in the repository (CC BY 4.0). To propose one, open an issue with the sources.
      </p>
    </>
  );
}

export function AdvisoryPage({ id }: { id: string }) {
  const a = RECORDS.find((r) => r.id === id);
  if (!a) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Advisory not found</h1>
        <p className="mt-2 text-muted-foreground">
          No approved record has this id. <Link href="/advisories" className="text-primary hover:underline">All advisories</Link>.
        </p>
      </section>
    );
  }
  return (
    <>
      <PageIntro eyebrow={`${a.id} · ${TYPE_LABEL[a.type] ?? a.type}`} title={a.packages.map((p) => p.name).join(", ")} lead={a.summary}>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={severityVariant(a.severity)}>{a.severity}</Badge>
          <Badge variant="secondary">{a.ecosystem}</Badge>
          <span className="text-muted-foreground">
            Window {day(a.window.start)} to {day(a.window.end)} · reviewed {day(a.review.reviewed_at)}
          </span>
        </div>
      </PageIntro>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Affected packages</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {a.packages.map((p) => (
                <li key={p.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono">{p.name}</span>
                  <span className="text-muted-foreground">
                    {p.affected.versions?.length ? `versions ${p.affected.versions.join(", ")}` : ""}
                    {p.affected.ranges?.length ? p.affected.ranges.map((r) => `from ${r.introduced}${r.fixed ? ` before ${r.fixed}` : ""}`).join("; ") : ""}
                    {p.affected.tags?.length ? `tags ${p.affected.tags.join(", ")}` : ""}
                    {p.affected.commits_after ? ` · commits after ${p.affected.commits_after}` : ""}
                    {p.affected.fixed_in ? ` · fixed in ${p.affected.fixed_in}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What to do</CardTitle>
            <CardDescription>{a.remediation}</CardDescription>
          </CardHeader>
        </Card>

        {a.indicators.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Indicators</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {a.indicators.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
            <CardDescription>Only structured facts and these links are stored, never the text of the posts.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {a.sources.map((s) => {
                const href = safeHref(s.url);
                return (
                  <li key={s.url} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-muted-foreground">{s.publisher}, {s.published_at}:</span>
                    {href ? (
                      <Link href={href} className="inline-flex items-center gap-1 text-primary hover:underline">
                        {s.title} <ExternalLink className="size-3" aria-hidden="true" />
                      </Link>
                    ) : (
                      <span>{s.title}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Upstream: OSV {a.upstream.osv ?? "not yet"}, GHSA {a.upstream.ghsa ?? "not yet"}.</p>
          </CardContent>
        </Card>

        <section className="relative overflow-hidden rounded-xl border bg-card">
          <div className="relative flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Does it affect your project?</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">Paste your public repository and the report says whether a lockfile pins one of these packages in the affected window, next to everything else it finds.</p>
            </div>
            <Link href="/login?next=/app" className={cn(buttonVariants({ size: "default" }))}>
              Check my repository <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>
        <p className="text-xs text-muted-foreground">
          <Link href="/advisories" className="text-primary hover:underline">All advisories</Link>
        </p>
      </div>
    </>
  );
}
