import { Button, cn } from "@gateseeker/ui-kit";
import { Check, Copy, Link2, Link2Off, Loader2 } from "lucide-react";
import { useState } from "react";

import { shareReport } from "../api";

/**
 * Share a saved report at /p/<id>. Off by default; the owner turns it on,
 * copies the link, and can turn it off again. The stored report was redacted
 * before it was saved, so the link never exposes a secret, but it does show
 * the repository's findings to anyone who has it.
 */
export function ShareButton({ id, initial, token, isPrivate = false }: { id: string; initial: boolean; token: string; isPrivate?: boolean }) {
  const [shared, setShared] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = `${window.location.origin}/p/${id}`;

  async function toggle() {
    // A private repository's findings leave the account with this link: say so before it exists.
    if (!shared && isPrivate && !window.confirm("This repository is private. Anyone with the link will see its findings (file paths, dependency names and versions). Share it?")) return;
    setBusy(true);
    setError(null);
    const out = await shareReport(id, token, !shared);
    setBusy(false);
    if (out.ok) setShared(out.isPublic);
    else setError(out.error.message);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 1500);
    } catch {
      setError("Could not copy; select the link and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="share">
      <div className="inline-flex items-stretch">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggle()} aria-pressed={shared} className={cn(shared && "rounded-r-none border-r-0")}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : shared ? <Link2Off aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          {shared ? "Stop sharing" : "Share a link"}
        </Button>
        {shared && (
          <span className="inline-flex h-8 items-center gap-1 rounded-r-md border border-button-stroke bg-input pl-2.5 pr-1 shadow-solid [--shadow-color:var(--button-stroke)]">
            <code className="max-w-[14rem] truncate text-xs text-muted-foreground" title={link}>{link}</code>
            <button type="button" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy the public link"} title={copied ? "Copied" : "Copy the public link"} className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {copied ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            </button>
          </span>
        )}
      </div>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
