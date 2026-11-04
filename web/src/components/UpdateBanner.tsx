import { Button } from "@gateseeker/ui-kit";
import { RefreshCw, Sparkles } from "lucide-react";

import { Link } from "../router";

/** The strip at the top of the workspace when the service runs a newer version than this page. */
export function UpdateBanner({ version, onReload, onLater }: { version: string; onReload: () => void; onLater: () => void }) {
  return (
    <div role="status" data-testid="update-banner" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-body print:hidden">
      <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        Gateseeker was updated to <span className="font-mono">{version}</span>. Reload to get it; nothing you are doing is lost until you do.{" "}
        <Link href="https://github.com/gateseeker-dev/gateseeker/blob/main/CHANGELOG.md" className="text-primary hover:underline">What changed</Link>
      </span>
      <span className="flex gap-2">
        <Button size="sm" onClick={onReload}>
          <RefreshCw aria-hidden="true" /> Update
        </Button>
        <Button size="sm" variant="ghost" onClick={onLater}>Later</Button>
      </span>
    </div>
  );
}
