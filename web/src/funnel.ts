/**
 * Login funnel counters (docs/ROADMAP.md decision 1): the page reports three
 * anonymous events to /api/event, which only adds one to a per-day counter.
 * Nothing identifies the visitor. Each event is sent at most once per tab
 * session (sessionStorage), so reloads do not inflate the numbers, and the
 * page never waits on or reacts to the answer.
 */

export type FunnelEvent = "login_view" | "login_start" | "signin_complete" | "email_click" | "example_view" | "public_report_view" | "update_banner_shown" | "update_banner_reload";

const SENT = "gateseeker:funnel:";
const PENDING = "gateseeker:funnel:pending";

function send(kind: FunnelEvent): void {
  try {
    // keepalive: login_start is sent right before the OAuth redirect leaves the page.
    void fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }), keepalive: true }).catch(() => undefined);
  } catch {
    /* counters are best effort */
  }
}

function once(kind: FunnelEvent): void {
  try {
    if (sessionStorage.getItem(SENT + kind) === "1") return;
    sessionStorage.setItem(SENT + kind, "1");
  } catch {
    /* storage unavailable: still count, possibly twice */
  }
  send(kind);
}

/** The sign-in page was shown to a signed-out visitor. */
export function countLoginView(): void {
  once("login_view");
}

/** The visitor pressed "Continue with GitHub"; remembered so the return can be counted. */
export function countLoginStart(): void {
  try {
    sessionStorage.setItem(PENDING, "1");
  } catch {
    /* the completion will not be counted */
  }
  once("login_start");
}

/** A signed-out visitor opened the live example on the Home. */
export function countExampleView(): void {
  once("example_view");
}

/** The "updated" banner was shown for a new version. */
export function countUpdateShown(): void {
  once("update_banner_shown");
}

/** The person reloaded from the banner (sent before the reload, kept alive). */
export function countUpdateReload(): void {
  send("update_banner_reload");
}

/** A shared report (/p/<id>) was opened. */
export function countPublicReportView(): void {
  once("public_report_view");
}

/** A report was opened from the link in an alert email (docs/SPRINT_6.md 3.7): the link's own parameter, no tracking pixel. */
export function countEmailClick(): void {
  once("email_click");
}

/** A session appeared after a sign-in this tab started (not a visit by someone already signed in). */
export function countSignInIfPending(): void {
  try {
    if (sessionStorage.getItem(PENDING) !== "1") return;
    sessionStorage.removeItem(PENDING);
  } catch {
    return;
  }
  once("signin_complete");
}
