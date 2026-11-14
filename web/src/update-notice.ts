import { useCallback, useEffect, useState } from "react";

import { compareVersions } from "gateseeker/dist/update-check.js";

import { countUpdateReload, countUpdateShown } from "./funnel";
import { notifyUpdate } from "./notifications";

/**
 * "Gateseeker was updated": the page knows the version and the deploy it was
 * built with and asks the service for its own on load, when the tab regains
 * focus and every 10 minutes. A newer service version, or another deploy of
 * the same version (most site changes ship without a version bump), shows the
 * banner once per update (dismissed with "Later" for this tab) and leaves one
 * notification in the bell. Reloading is the only action; nothing is forced.
 */

export const BUILT_VERSION: string = __GATESEEKER_VERSION__;
export const BUILT_BUILD: string = __GATESEEKER_BUILD__;

/** What the service runs, as the banner describes it: a version when it is newer than the page's, or just "updated". */
export interface Update {
  version: string | null;
  /** Identifies this update for "Later": version plus deploy id. */
  key: string;
}
const POLL_MS = 10 * 60 * 1000;
const DISMISSED = "gateseeker:update-dismissed";

async function serviceVersion(): Promise<{ version: string; build: string | null } | null> {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    const body = (await res.json()) as { version?: unknown; build?: unknown };
    if (typeof body.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(body.version)) return null;
    return { version: body.version, build: typeof body.build === "string" && /^[0-9a-f]{1,40}$/.test(body.build) ? body.build : null };
  } catch {
    return null;
  }
}

/** The update the service runs relative to this page, or null when they are the same. */
export function detectUpdate(service: { version: string; build: string | null }, built: { version: string; build: string } = { version: BUILT_VERSION, build: BUILT_BUILD }): Update | null {
  const cmp = compareVersions(service.version, built.version);
  if (cmp > 0) return { version: service.version, key: `${service.version}:${service.build ?? ""}` };
  // Same version, another deploy: only when the service says which deploy it runs (the local server says none).
  if (cmp === 0 && service.build !== null && service.build !== built.build) return { version: null, key: `${service.version}:${service.build}` };
  return null;
}

export function useUpdateNotice(userId: string | null): { latest: Update | null; dismiss: () => void; reload: () => void } {
  const [latest, setLatest] = useState<Update | null>(null);
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
      const service = await serviceVersion();
      if (cancelled || service === null) return;
      const update = detectUpdate(service);
      if (update === null) return;
      setLatest((prev) => {
        if (prev?.key === update.key) return prev;
        countUpdateShown();
        if (userId) notifyUpdate(userId, update.version);
        return update;
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
      sessionStorage.setItem(DISMISSED, latest.key);
    } catch {
      /* the banner closes for this render anyway */
    }
    setDismissed(latest.key);
  }, [latest]);

  const reload = useCallback(() => {
    countUpdateReload();
    window.location.reload();
  }, []);

  return { latest: latest !== null && dismissed !== latest.key ? latest : null, dismiss, reload };
}
