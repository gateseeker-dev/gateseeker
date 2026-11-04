import { useCallback, useEffect, useState } from "react";

import { compareVersions } from "gateseeker/dist/update-check.js";

import { countUpdateReload, countUpdateShown } from "./funnel";
import { notifyUpdate } from "./notifications";

/**
 * "Gateseeker was updated": the page knows the version it was built with and
 * asks the service for its version on load, when the tab regains focus and
 * every 10 minutes. A newer service version shows the banner once per version
 * (dismissed with "Later" for this tab) and leaves one notification in the
 * bell. Reloading is the only action; nothing is forced.
 */

export const BUILT_VERSION: string = __GATESEEKER_VERSION__;
const POLL_MS = 10 * 60 * 1000;
const DISMISSED = "gateseeker:update-dismissed";

async function serviceVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(body.version) ? body.version : null;
  } catch {
    return null;
  }
}

export function useUpdateNotice(userId: string | null): { latest: string | null; dismiss: () => void; reload: () => void } {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISMISSED);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const v = await serviceVersion();
      if (cancelled || v === null || compareVersions(v, BUILT_VERSION) <= 0) return;
      setLatest((prev) => {
        if (prev === v) return prev;
        countUpdateShown();
        if (userId) notifyUpdate(userId, v);
        return v;
      });
    };
    void check();
    const onFocus = () => { void check(); };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { void check(); }, POLL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [userId]);

  const dismiss = useCallback(() => {
    if (latest === null) return;
    try {
      sessionStorage.setItem(DISMISSED, latest);
    } catch {
      /* the banner closes for this render anyway */
    }
    setDismissed(latest);
  }, [latest]);

  const reload = useCallback(() => {
    countUpdateReload();
    window.location.reload();
  }, []);

  return { latest: latest !== null && dismissed !== latest ? latest : null, dismiss, reload };
}
