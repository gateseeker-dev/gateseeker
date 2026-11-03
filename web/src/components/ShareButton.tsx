import { Button } from "@gateseeker/ui-kit";
import { Check, Copy, Link2, Link2Off, Loader2 } from "lucide-react";
import { useState } from "react";

import { shareReport } from "../api";

/**
 * Share a saved report at /p/<id>. Off by default; the owner turns it on,
 * copies the link, and can turn it off again. The stored report was redacted
 * before it was saved, so the link never exposes a secret, but it does show
 * the repository's findings to anyone who has it.
 */
export function ShareButton({ id, initial, token }: { id: string; initial: boolean; token: string }) {
  const [shared, setShared] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = `${window.location.origin}/p/${id}`;

  async function toggle() {
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
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggle()} aria-pressed={shared}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : shared ? <Link2Off aria-hidden="true" /> : <Link2 aria-hidden="true" />}
        {shared ? "Stop sharing" : "Share a link"}
      </Button>
      {shared && (
        <>
          <code className="max-w-[16rem] truncate rounded border bg-input px-2 py-1 text-xs" title={link}>{link}</code>
          <Button variant="ghost" size="sm" onClick={() => void copy()} aria-label="Copy the public link">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? "Copied" : "Copy"}
          </Button>
        </>
      )}
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
