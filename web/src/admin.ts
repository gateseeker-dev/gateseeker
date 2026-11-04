import { useEffect, useState } from "react";

import { fetchAdminOverview } from "./api";

/**
 * Whether the signed-in account is an admin master. The page cannot know the
 * configured logins, so it asks the service once per tab session (GET
 * /api/admin/overview answers 404 to everyone else) and remembers the answer
 * for this account in sessionStorage.
 */
const KEY = "gateseeker:admin:";

export function useIsAdmin(userId: string | null, token: string | null): boolean | null {
  const [state, setState] = useState<boolean | null>(() => {
    if (!userId) return null;
    try {
      const v = sessionStorage.getItem(KEY + userId);
      return v === "1" ? true : v === "0" ? false : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!userId || !token || state !== null) return;
    let cancelled = false;
    void fetchAdminOverview(token).then((out) => {
      if (cancelled) return;
      const admin = out.ok;
      try {
        sessionStorage.setItem(KEY + userId, admin ? "1" : "0");
      } catch {
        /* asked again next time */
      }
      setState(admin);
    });
    return () => { cancelled = true; };
  }, [userId, token, state]);

  return state;
}
