import { Button } from "@gateseeker/ui-kit";
import { RefreshCw, Sparkles } from "lucide-react";

import { Link } from "../router";

/**
 * The toast at the top of the window when the service runs a newer build than
 * this page: fixed under the header, over the content, so it is seen wherever
 * the page is scrolled. "Update" reloads; "Later" closes it for this tab.
 */
/** `version` is null when the service runs another deploy of the same version. */
export function UpdateBanner({ version, onReload, onLater }: { version: string | null; onReload: () => void; onLater: () => void }) {
  return (
    <div role="status" data-testid="update-banner" className="fixed top-[63px] left-1/2 z-40 flex w-[min(640px,calc(100%-32px))] -translate-x-1/2 flex-wrap md:left-[calc(50%+118px)] md:w-[min(640px,calc(100%-268px))] items-center gap-3 rounded-lg border border-primary/40 bg-sidebar px-4 py-3 text-body shadow-solid [--shadow-color:var(--gs-stroke)] print:hidden">
      <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {version ? <>Gateseeker was updated to <span className="font-mono">{version}</span>.</> : "Gateseeker was updated."} Reload to get it; nothing you are doing is lost until you do.{" "}
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
