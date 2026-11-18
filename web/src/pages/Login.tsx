import { Button, Card, CardContent, CardDescription, CardHeader } from "@gateseeker/ui-kit";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { safeNext, takeNext } from "../auth";
import { useAuth } from "../auth-context";
import { GitHubMark } from "../components/GitHubMark";
import { countLoginStart, countLoginView, countSignInIfPending } from "../funnel";
import { Link, navigate } from "../router";

/**
 * Sign-in page. "Continue with GitHub" starts Supabase Auth's OAuth flow
 * (or the stub in local/test mode). After the round trip the page lands here
 * again with a session and forwards to the remembered in-app path. The visit,
 * the click and the completed sign-in feed the anonymous funnel counters.
 */
export function Login() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const next = safeNext(params.get("next") ?? "/app");
  const expired = params.get("reason") === "expired";

  useEffect(() => {
    if (auth.status === "signed-out") countLoginView();
    if (auth.status !== "signed-in") return;
    countSignInIfPending();
    // takeNext() clears what it returns, so it is read once.
    const remembered = takeNext();
    navigate(remembered === "/app" ? next : remembered);
  }, [auth.status, next]);

  async function start() {
    setBusy(true);
    countLoginStart();
    await auth.signIn(next);
    // On OAuth the browser navigates away; in stub mode the session appears at once and the effect above forwards.
    setBusy(false);
  }

  const unavailable = auth.status !== "loading" && auth.mode === "none";
  return (
    <section className="relative mx-auto max-w-sm py-8 sm:py-12">
      <Card className="relative">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-11 items-center justify-center rounded-lg border border-primary/40 bg-primary/15 text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold leading-snug tracking-tight">Log in</h1>
          <CardDescription>{expired ? "Your session ended (it expired, or was signed out elsewhere). Sign in again to continue where you were." : "Sign in to open the demo workspace and analyze a public GitHub repository."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Button size="lg" className="h-11 w-full" disabled={busy || auth.status === "loading" || unavailable} onClick={() => void start()}>
            {busy || auth.status === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <GitHubMark />} Continue with GitHub
          </Button>
          {unavailable ? (
            <p role="alert" className="text-center text-xs text-warning">Sign-in is not configured on this server. Run the CLI locally instead.</p>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              The demo workspace is free and rate limited. Public repositories, or private ones you authorize on GitHub; nothing is installed or executed. We use your GitHub login and avatar, and your email only for alerts you turn on. By continuing you accept the{" "}
              <Link href="/terms" className="text-primary hover:underline">Terms of use</Link> and the <Link href="/privacy" className="text-primary hover:underline">Privacy notice</Link>.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
