import { Badge, Button } from "@gateseeker/ui-kit";
import { Loader2, Play } from "lucide-react";
import { useState } from "react";

import { fetchExample, type ScanResponseOk } from "../api";
import { countExampleView } from "../funnel";
import { ReportView } from "../views/Report";
import { ExampleReport } from "./ExampleReport";

/**
 * The Home's example: the static illustration until the visitor asks for
 * the real thing, then the live report of the example repository produced by
 * the engine (GET /api/example: no sign-in, no quota, reused per commit).
 */
type Phase = { kind: "static" } | { kind: "loading" } | { kind: "ready"; response: ScanResponseOk; ms: number } | { kind: "failed"; message: string };

export function LiveExample() {
  const [phase, setPhase] = useState<Phase>({ kind: "static" });

  async function load() {
    setPhase({ kind: "loading" });
    countExampleView();
    const started = Date.now();
    const out = await fetchExample();
    if (out.ok) setPhase({ kind: "ready", response: out, ms: Date.now() - started });
    else setPhase({ kind: "failed", message: out.error.message });
  }

  if (phase.kind === "ready") {
    return (
      <div className="grid gap-3">
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">Live example</Badge>
          Real analysis of <span className="font-mono">{phase.response.repository.owner}/{phase.response.repository.repo}</span> at commit <span className="font-mono">{phase.response.repository.sha.slice(0, 7)}</span>, produced by the same engine you get after signing in.
        </p>
        <ReportView response={phase.response} elapsedMs={phase.response.timings.totalMs} />
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <ExampleReport />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" variant="outline" className="h-11" disabled={phase.kind === "loading"} onClick={() => void load()}>
          {phase.kind === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />} See a live example
        </Button>
        {phase.kind === "loading" && <span role="status" className="text-xs text-muted-foreground">Analyzing the example repository, usually a few seconds</span>}
        {phase.kind === "failed" && <span role="alert" className="text-xs text-warning">The live example is not available right now: {phase.message}</span>}
      </div>
    </div>
  );
}
