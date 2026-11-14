import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, buttonVariants, cn } from "@gateseeker/ui-kit";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchPublicReport, type ReportOutcome } from "../api";
import { CiSnippet } from "../components/CiSnippet";
import { ReportSkeleton } from "../components/Skeletons";
import { countPublicReportView } from "../funnel";
import { Link } from "../router";
import { ReportView } from "../views/Report";

/**
 * /p/<id>: a report its owner chose to share. No session needed. The page
 * says who it is for and ends with the two ways to get one's own report.
 */
export function PublicReportPage({ id }: { id: string }) {
  const [outcome, setOutcome] = useState<ReportOutcome | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOutcome(null);
    countPublicReportView();
    void fetchPublicReport(id).then((o) => { if (!cancelled) setOutcome(o); });
    return () => { cancelled = true; };
  }, [id]);

  if (outcome === null) return <ReportSkeleton label="Loading the shared report" />;
  if (!outcome.ok) {
    return (
      <Card role="alert">
        <CardHeader>
          <CardTitle>Shared report not available</CardTitle>
          <CardDescription>{outcome.error.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/get-started" className="text-primary hover:underline">Analyze your own repository</Link>
        </CardContent>
      </Card>
    );
  }
  const name = `${outcome.saved.repository.owner}/${outcome.saved.repository.repo}`;
  const response = { ...outcome.saved, id: outcome.id, cached: false, quota: null };
  return (
    <div className="grid gap-6">
      <div>
        <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">Shared report</Badge>
          Shared by its owner. Commit <span className="font-mono">{outcome.saved.repository.sha.slice(0, 7)}</span>, analyzed {new Date(outcome.createdAt).toLocaleDateString()}. Gateseeker read the repository; it never ran it.
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
      </div>
      <ReportView response={response} elapsedMs={outcome.saved.timings.totalMs} />
      <section className="relative overflow-hidden rounded-xl border bg-card">
        <div className="relative flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Get this for your own repository</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Sign in with GitHub and paste a public repository URL, or add the Action and make it a gate on every pull request.</p>
          </div>
          <Link href="/login?next=/app" className={cn(buttonVariants({ size: "default" }))}>
            Analyze a repository <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
      <CiSnippet repository={outcome.saved.repository} />
    </div>
  );
}
