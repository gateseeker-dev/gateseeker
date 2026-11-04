import { Badge, Button } from "@gateseeker/ui-kit";
import { ExternalLink, Loader2, Unplug } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchInstallations, removeInstallation, type InstallationView } from "../api";
import { formatWhen } from "../notifications";
import { Link } from "../router";

/**
 * Settings, "GitHub access" (docs/SPRINT_8.md 3.4): the GitHub App
 * installations this account bound, how many repositories each covers, the
 * installation's page on GitHub (choose repositories, uninstall) and
 * Disconnect, which makes the service forget the binding.
 */
export function GitHubAccess({ token }: { token: string }) {
  const [rows, setRows] = useState<InstallationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchInstallations(token).then((out) => {
      if (cancelled) return;
      if (out.ok) setRows(out.installations);
      else setError(out.error.message);
    });
    return () => { cancelled = true; };
  }, [token]);

  async function disconnect(id: number) {
    setBusy(id);
    const out = await removeInstallation(token, id);
    setBusy(null);
    if (!out.ok) {
      setError(out.error.message);
      return;
    }
    setRows((r) => (r ?? []).filter((x) => x.installationId !== id));
  }

  if (error) return <p role="alert" className="text-label text-destructive">{error}</p>;
  if (rows === null) return <p className="text-label text-muted-foreground"><Loader2 className="mr-1 inline size-3.5 animate-spin" aria-hidden="true" /> Loading</p>;
  if (rows.length === 0) {
    return (
      <p className="text-label text-muted-foreground" data-testid="github-access-empty">
        No GitHub account or organization has authorized Gateseeker yet. Paste a private repository in <Link href="/app" className="text-primary hover:underline">Analyze</Link> and allow access there; the authorization is read-only and only for the repositories you pick.
      </p>
    );
  }
  const now = Date.now();
  return (
    <ul className="grid gap-2" aria-label="GitHub installations" data-testid="github-access">
      {rows.map((r) => (
        <li key={r.installationId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 last:border-b-0 last:pb-0">
          <span className="text-body font-medium">@{r.accountLogin}</span>
          <Badge variant="kind">{r.accountType === "Organization" ? "organization" : "account"}</Badge>
          <span className="text-label text-muted-foreground">
            {r.repositories === null ? "repositories: unknown right now" : `${String(r.repositories)} ${r.repositories === 1 ? "repository" : "repositories"}`} · since <time dateTime={r.since}>{formatWhen(r.since, now)}</time>
          </span>
          <span className="ml-auto flex items-center gap-1">
            <a href={r.manageUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-label text-primary hover:underline">
              Manage on GitHub <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
            <Button variant="outline" size="sm" disabled={busy === r.installationId} onClick={() => void disconnect(r.installationId)} aria-label={`Disconnect @${r.accountLogin}`}>
              {busy === r.installationId ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Unplug aria-hidden="true" />} Disconnect
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
