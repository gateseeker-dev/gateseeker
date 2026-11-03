import { Card } from "@gateseeker/ui-kit";
import { useEffect, useState } from "react";

import { fetchFunnel, type FunnelResponse } from "../api";

/**
 * Settings section shown only to the logins in GATESEEKER_ADMIN_LOGINS: the
 * aggregate counters of the last two weeks. Everyone else gets a 404 from the
 * service and sees nothing here.
 */
const LABELS: Record<string, string> = {
  login_view: "Login page views",
  login_start: "Clicked Continue with GitHub",
  signin_complete: "Signed in",
  example_view: "Live example opened (Home)",
  public_report_view: "Shared report opened",
  email_click: "Report opened from an email",
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

export function ProductCounters({ token }: { token: string }) {
  const [data, setData] = useState<FunnelResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFunnel(token).then((out) => { if (!cancelled && out.ok) setData(out); });
    return () => { cancelled = true; };
  }, [token]);

  if (!data) return null;
  const totals = new Map<string, number>();
  for (const e of data.events) totals.set(e.kind, (totals.get(e.kind) ?? 0) + e.count);
  const rows = Object.keys(LABELS).map((kind) => ({ kind, label: LABELS[kind] ?? kind, count: totals.get(kind) ?? 0 }));
  const views = totals.get("login_view") ?? 0;
  const signed = totals.get("signin_complete") ?? 0;
  const conversion = views > 0 ? Math.round((signed / views) * 100) : null;

  return (
    <Card className="grid gap-4 p-4 md:grid-cols-[240px_1fr] md:gap-8" data-testid="product-counters">
      <div className="grid content-start gap-1">
        <h2 className="text-title font-medium">Product counters</h2>
        <p className="text-label text-muted-foreground">Last {data.days} days since {data.since}, UTC. Aggregate only: no visitor is identified. Visible to the product owner.</p>
      </div>
      <div className="grid content-start gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Analyses" value={String(data.scans.scans)} />
          <Metric label="Accounts that analyzed" value={String(data.scans.accounts)} />
          <Metric label="Followed repositories" value={String(data.follows)} />
          <Metric label="Login to sign-in" value={conversion === null ? "n/a" : `${String(conversion)}%`} />
        </dl>
        <dl className="grid gap-1">
          {rows.map((r) => (
            <div key={r.kind} className="flex items-baseline justify-between gap-4 border-b py-1.5 last:border-b-0">
              <dt className="text-body text-muted-foreground">{r.label}</dt>
              <dd className="font-mono text-body">{r.count}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-input/40 p-3">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
