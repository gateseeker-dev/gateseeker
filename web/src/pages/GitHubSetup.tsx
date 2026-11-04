import { Button, Card } from "@gateseeker/ui-kit";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { bindInstallation, type InstallationBoundResponse } from "../api";
import { useAuth } from "../auth-context";
import { PageSkeleton } from "../components/Skeletons";
import { Link, navigate } from "../router";
import { rememberPendingAnalysis, takePendingAnalysis } from "../scan-note";

/**
 * /app/github/setup: where GitHub sends the person back after the App's
 * install screen (docs/SPRINT_8.md 3.4), with installation_id and the state
 * the service signed. The page binds the installation to the account and
 * returns to the analysis that was interrupted (the repository is remembered
 * in this browser), or to Settings when there was none.
 */
export function GitHubSetupPage() {
  const auth = useAuth();
  const [state, setState] = useState<{ kind: "working" } | { kind: "done"; bound: InstallationBoundResponse; next: string | null } | { kind: "failed"; message: string }>({ kind: "working" });

  useEffect(() => {
    if (auth.status === "signed-out") navigate(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [auth.status]);

  const session = auth.status === "signed-in" && auth.session ? auth.session : null;
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get("installation_id") ?? "";
    const stateParam = params.get("state") ?? "";
    if (!/^\d{1,16}$/.test(installationId) || !stateParam) {
      setState({ kind: "failed", message: "This page needs the installation GitHub sends back. Start again from the repository you want to analyze." });
      return;
    }
    let cancelled = false;
    void bindInstallation(session.accessToken, Number(installationId), stateParam).then((out) => {
      if (cancelled) return;
      if (!out.ok) {
        setState({ kind: "failed", message: out.error.message });
        return;
      }
      // Back to the analysis: the repository from the state, or the one remembered before leaving.
      const remembered = takePendingAnalysis();
      const repo = out.repo ? `https://github.com/${out.repo}` : remembered;
      if (repo) rememberPendingAnalysis(repo);
      setState({ kind: "done", bound: out, next: repo ? "/app" : null });
    });
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    if (state.kind !== "done" || !state.next) return;
    const t = setTimeout(() => { navigate(state.next ?? "/app/settings"); }, 1200);
    return () => { clearTimeout(t); };
  }, [state]);

  if (!session || state.kind === "working") return <PageSkeleton label="Connecting to GitHub" />;
  if (state.kind === "failed") {
    return (
      <Card className="grid gap-3 p-4" role="alert" data-testid="github-setup-failed">
        <h1 className="text-title font-medium">Could not connect the installation</h1>
        <p className="text-body text-muted-foreground">{state.message}</p>
        <div className="flex gap-2">
          <Link href="/app" className="text-primary hover:underline">Analyze a repository</Link>
          <Link href="/app/settings" className="text-primary hover:underline">Settings</Link>
        </div>
      </Card>
    );
  }
  const i = state.bound.installation;
  return (
    <Card className="grid gap-3 p-4" role="status" data-testid="github-setup-done">
      <h1 className="flex items-center gap-2 text-title font-medium">
        <CheckCircle2 className="size-5 text-success" aria-hidden="true" /> Connected to @{i.accountLogin}
      </h1>
      <p className="text-body text-muted-foreground">
        Gateseeker can now read the repositories you picked on GitHub, read-only. Change them or disconnect any time in Settings or on GitHub.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {state.next ? (
          <>
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="text-label text-muted-foreground">Returning to your analysis…</span>
            <Button size="sm" variant="outline" onClick={() => { navigate("/app"); }}>Go now</Button>
          </>
        ) : (
          <Button size="sm" onClick={() => { navigate("/app/settings"); }}>Open Settings</Button>
        )}
      </div>
    </Card>
  );
}
