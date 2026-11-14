import { useEffect, useState } from "react";

import { fetchAdminOverview } from "./api";

/**
 * Whether the signed-in account is an admin master. The page cannot know the
 * configured logins, so it asks the service (GET /api/admin/overview answers
 * 404 to everyone else). The last answer for this account is kept in
 * localStorage so a reload or a new tab renders the right sidebar at once
 * (no flash of the plain sidebar), and the service is asked again once per
 * tab session so a change in the configuration is picked up. The answer only
 * decides what the sidebar shows; every admin route is gated by the service.
 */
const KEY = "gateseeker:admin:";
const CHECKED = "gateseeker:admin-checked:";

function remembered(userId: string): boolean | null {
  try {
    const v = localStorage.getItem(KEY + userId);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

function checkedThisTab(userId: string): boolean {
  try {
    return sessionStorage.getItem(CHECKED + userId) === "1";
  } catch {
    return false;
  }
}

export function useIsAdmin(userId: string | null, token: string | null): boolean | null {
  const [state, setState] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId || !token || checkedThisTab(userId)) return;
    let cancelled = false;
    void fetchAdminOverview(token).then((out) => {
      if (cancelled) return;
      // Only the 404 given to non-admins means "no"; a service failure keeps what was remembered.
      if (!out.ok && out.error.code !== "not-found") return;
      const admin = out.ok;
      try {
        localStorage.setItem(KEY + userId, admin ? "1" : "0");
        sessionStorage.setItem(CHECKED + userId, "1");
      } catch {
        /* asked again next time */
      }
      setState(admin);
    });
    return () => { cancelled = true; };
  }, [userId, token]);

  // Read on render, not only on mount: the first render happens while the session is still being read (no userId yet).
  return state ?? (userId ? remembered(userId) : null);
}
