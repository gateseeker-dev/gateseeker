import { Badge, Button, Card, MetricCard, Table, Td, Th } from "@gateseeker/ui-kit";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchAdminAccount, fetchAdminAccounts, fetchAdminOverview, type AdminAccountResponse, type AdminAccountsResponse, type AdminOverviewResponse, type ScanResponseError } from "../api";
import { useAuth } from "../auth-context";
import { ScanTable } from "../components/ScanTable";
import { PageSkeleton } from "../components/Skeletons";
import { formatWhen } from "../notifications";
import { Link, navigate } from "../router";
import { useWorkspaceTitle } from "../Workspace";

/**
 * Admin master (docs/SPRINT_7.md 3.3): /app/admin (overview), /app/admin/accounts
 * (list, newest access first) and /app/admin/accounts/<id> (one account's
 * activity: analyses, follows, shared reports; never anyone's findings). The
 * service answers 404 to any login outside GATESEEKER_ADMIN_LOGINS, and the
 * pages then say so.
 */

const EVENT_LABELS: Record<string, string> = {
  login_view: "Login page views",
  login_start: "Clicked Continue with GitHub",
  signin_complete: "Signed in",
  example_view: "Live example opened (Home)",
  public_report_view: "Shared report opened",
  email_click: "Report opened from an email",
  update_banner_shown: "Update notice shown",
  update_banner_reload: "Update notice: reloaded",
  rescan_complete: "Daily rescans finished",
  rescan_incomplete: "Daily rescans incomplete",
  rescan_failed: "Daily rescans failed",
  email_follow_confirm: "Follow confirmations sent",
  email_alert: "Alert emails sent",
  email_paused: "Paused notices sent",
  email_capped: "Emails held by the daily cap",
  email_failed: "Emails that failed to send",
  unsubscribe: "Unsubscribes",
};

function NotAdmin() {
  return (
    <Card className="grid gap-2 p-4" role="alert">
      <h1 className="text-title font-medium">Not available</h1>
      <p className="text-label text-muted-foreground">This area is for the product's admin master. <Link href="/app/dashboard" className="text-primary hover:underline">Back to the dashboard</Link>.</p>
    </Card>
  );
}

/** Any failure other than the 404 given to non-admins: the message, so the cause is visible. */
function Failed({ message }: { message: string }) {
  return (
    <Card className="grid gap-2 p-4" role="alert" data-testid="admin-failed">
      <h1 className="text-title font-medium">The service did not answer</h1>
      <p className="text-label text-muted-foreground">{message}</p>
    </Card>
  );
}

type Denied = "denied" | { failed: string };

function deniedOrFailed(err: ScanResponseError): Denied {
  return err.error.code === "not-found" ? "denied" : { failed: err.error.message };
}

function useSession() {
  const auth = useAuth();
  useEffect(() => {
    if (auth.status === "signed-out") navigate("/login?next=/app/admin");
  }, [auth.status]);
  return auth.status === "signed-in" && auth.session ? auth.session : null;
}

export function AdminOverviewPage() {
  const session = useSession();
  const [data, setData] = useState<AdminOverviewResponse | null | Denied>(null);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void fetchAdminOverview(session.accessToken).then((out) => { if (!cancelled) setData(out.ok ? out : deniedOrFailed(out)); });
    return () => { cancelled = true; };
  }, [session]);

  if (!session || data === null) return <PageSkeleton label="Loading the overview" />;
  if (data === "denied") return <NotAdmin />;
  if ("failed" in data) return <Failed message={data.failed} />;
  const o = data.overview;
  const totals = new Map<string, number>();
  for (const e of data.funnel.events) totals.set(e.kind, (totals.get(e.kind) ?? 0) + e.count);
  const views = totals.get("login_view") ?? 0;
  const signed = totals.get("signin_complete") ?? 0;
  const conversion = views > 0 ? `${String(Math.round((signed / views) * 100))}%` : "n/a";

  return (
    <div className="grid gap-4" data-testid="admin-overview">
      <div>
        <h1 className="text-display font-medium">How the product is doing</h1>
        <p className="text-label text-muted-foreground">Accounts that used the service, their activity, and the aggregate counters of the last {data.funnel.days} days (since {data.funnel.since}, UTC).</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Accounts", value: o.accounts, note: `${String(o.new7)} new in 7 days, ${String(o.new30)} in 30` },
          { label: "Active in 7 days", value: o.active7, note: `${String(o.active30)} in 30 days` },
          { label: "Analyses in 7 days", value: o.scans7, note: `${String(o.scans30)} in 30 days` },
          { label: "Followed repositories", value: o.follows, note: `${String(o.sharedReports)} shared reports, ${String(o.installations)} GitHub installations` },
        ].map((m) => (
          <div key={m.label}>
            <dt className="sr-only">{m.label}</dt>
            <dd>
              <MetricCard label={m.label} value={m.value} note={m.note} className="h-full" />
            </dd>
          </div>
        ))}
      </dl>
      <Card className="grid gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-title font-medium">Counters, last {data.funnel.days} days</h2>
          <span className="text-label text-muted-foreground">Login page to sign-in: {conversion}</span>
        </div>
        <dl className="grid gap-1 sm:grid-cols-2 sm:gap-x-8">
          {Object.keys(EVENT_LABELS).map((kind) => (
            <div key={kind} className="flex items-baseline justify-between gap-4 border-b py-1.5">
              <dt className="text-body text-muted-foreground">{EVENT_LABELS[kind]}</dt>
              <dd className="font-mono text-body">{totals.get(kind) ?? 0}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-muted-foreground">Aggregate only: no visitor is identified by these counters.</p>
      </Card>
      <Link href="/app/admin/accounts" className="text-primary hover:underline">All accounts</Link>
    </div>
  );
}

export function AdminAccountsPage() {
  const session = useSession();
  const [pages, setPages] = useState<AdminAccountsResponse[]>([]);
  const [denied, setDenied] = useState<Denied | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(before: string | null) {
    if (!session) return;
    setBusy(true);
    const out = await fetchAdminAccounts(session.accessToken, before);
    setBusy(false);
    if (out.ok) setPages((p) => [...p, out]);
    else setDenied(deniedOrFailed(out));
  }
  useEffect(() => {
    setPages([]);
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load the first page once per session
  }, [session]);

  if (!session || (pages.length === 0 && denied === null)) return <PageSkeleton label="Loading the accounts" />;
  if (denied === "denied") return <NotAdmin />;
  if (denied !== null) return <Failed message={denied.failed} />;
  const rows = pages.flatMap((p) => p.accounts);
  const next = pages[pages.length - 1]?.next ?? null;
  const now = Date.now();
  return (
    <div className="grid gap-4" data-testid="admin-accounts">
      <div>
        <h1 className="text-display font-medium">Accounts</h1>
        <p className="text-label text-muted-foreground">Everyone who signed in, newest access first. Last access has a precision of 5 minutes; nothing else about visits is kept.</p>
      </div>
      <Table aria-label="Accounts">
        <thead>
          <tr>
            <Th>Login</Th>
            <Th className="w-40">Last access</Th>
            <Th className="w-40">Since</Th>
            <Th className="w-24">Analyses</Th>
            <Th className="w-24">Follows</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.userId} className="border-b last:border-b-0">
              <Td>
                <Link href={`/app/admin/accounts/${a.userId}`} className="text-body font-medium text-primary hover:underline">@{a.login}</Link>
              </Td>
              <Td><time dateTime={a.lastSeen}>{formatWhen(a.lastSeen, now)}</time></Td>
              <Td>{a.firstSeen.slice(0, 10)}</Td>
              <Td className="tabular-nums">{a.scans}</Td>
              <Td className="tabular-nums">{a.follows}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {rows.length === 0 && <p className="text-label text-muted-foreground">No account yet.</p>}
      {next && (
        <Button variant="outline" size="sm" className="justify-self-start" disabled={busy} onClick={() => void load(next)}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} More
        </Button>
      )}
    </div>
  );
}

export function AdminAccountPage({ id }: { id: string }) {
  const session = useSession();
  const [data, setData] = useState<AdminAccountResponse | null | Denied | "missing">(null);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setData(null);
    void fetchAdminAccount(session.accessToken, id).then((out) => {
      if (cancelled) return;
      if (out.ok) setData(out);
      else setData(out.error.message.startsWith("No account") ? "missing" : deniedOrFailed(out));
    });
    return () => { cancelled = true; };
  }, [session, id]);
  useWorkspaceTitle(data !== null && typeof data === "object" && "account" in data ? `@${data.account.login}` : null);

  if (!session || data === null) return <PageSkeleton label="Loading the account" />;
  if (data === "denied") return <NotAdmin />;
  if (data !== "missing" && "failed" in data) return <Failed message={data.failed} />;
  if (data === "missing") {
    return (
      <Card className="grid gap-2 p-4" role="alert">
        <h1 className="text-title font-medium">No account with this id</h1>
        <Link href="/app/admin/accounts" className="text-primary hover:underline">All accounts</Link>
      </Card>
    );
  }
  const a = data.account;
  const now = Date.now();
  return (
    <div className="grid gap-4" data-testid="admin-account">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/app/admin/accounts" aria-label="Back to accounts" className="inline-flex size-8 items-center justify-center rounded-md border">
          <ArrowLeft className="size-4 text-primary" aria-hidden="true" />
        </Link>
        <div>
          <h1 className="text-display font-medium">@{a.login}</h1>
          <p className="text-label text-muted-foreground">
            Since {a.firstSeen.slice(0, 10)} · last access <time dateTime={a.lastSeen}>{formatWhen(a.lastSeen, now)}</time> · {a.scans} analyses · {a.follows} followed
          </p>
        </div>
      </div>
      <section className="grid gap-2">
        <h2 className="text-title font-medium">Analyses</h2>
        {data.scans.length === 0 ? <p className="text-label text-muted-foreground">None recorded (history is kept 180 days).</p> : <ScanTable rows={data.scans.map((s) => ({ owner: s.owner, repo: s.repo, sha: s.sha, verdict: s.verdict, byPriority: s.byPriority, reportId: null, at: s.at }))} label={`Analyses of @${a.login}`} />}
        <p className="text-caption text-muted-foreground">Repository, commit, verdict and counts only. The findings of a report belong to its owner and are not shown here.</p>
      </section>
      <section className="grid gap-2">
        <h2 className="text-title font-medium">Followed repositories</h2>
        {data.follows.length === 0 ? (
          <p className="text-label text-muted-foreground">None.</p>
        ) : (
          <ul className="grid gap-1 text-body">
            {data.follows.map((f) => (
              <li key={`${f.owner}/${f.repo}`} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{f.owner}/{f.repo}</span>
                {f.pausedReason ? <Badge variant="high">paused</Badge> : <Badge variant="kind">active</Badge>}
                <span className="text-label text-muted-foreground">since {f.since.slice(0, 10)}{f.lastScanAt ? `, last check ${f.lastScanAt.slice(0, 10)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {data.installations && (
        <section className="grid gap-2">
          <h2 className="text-title font-medium">GitHub installations</h2>
          {data.installations.length === 0 ? (
            <p className="text-label text-muted-foreground">None.</p>
          ) : (
            <ul className="grid gap-1 text-body">
              {data.installations.map((i) => (
                <li key={i.installationId} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">@{i.accountLogin}</span>
                  <Badge variant="kind">{i.accountType === "Organization" ? "organization" : "account"}</Badge>
                  <span className="text-label text-muted-foreground">installation {i.installationId}, since {i.since.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-caption text-muted-foreground">Which GitHub accounts authorized the App for this person. Which repositories, and their contents, stay on GitHub.</p>
        </section>
      )}
      <section className="grid gap-2">
        <h2 className="text-title font-medium">Shared reports</h2>
        {data.shared.length === 0 ? (
          <p className="text-label text-muted-foreground">None.</p>
        ) : (
          <ul className="grid gap-1 text-body">
            {data.shared.map((r) => (
              <li key={r.id}>
                <Link href={`/p/${r.id}`} className="text-primary hover:underline">{r.owner}/{r.repo}</Link> <span className="font-mono text-label text-muted-foreground">{r.sha.slice(0, 7)}</span> <span className="text-label text-muted-foreground">{r.createdAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
