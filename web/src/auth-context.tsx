import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { SESSION_INVALID_EVENT } from "./api";
import { loadAuth, type AuthClient, type AuthMode, type Session } from "./auth";
import { navigate } from "./router";

/**
 * React side of auth.ts: one client for the whole page, the current session,
 * and the two actions. `status` is "loading" until /api/config answered and
 * the stored session (if any) was read, so guards never flash the wrong page.
 * When the service answers 401 to a call made with the session (expired, or
 * ended from another browser), the local session is dropped and the login
 * page opens with the way back to the page that was open.
 */

export interface AuthState {
  status: "loading" | "signed-out" | "signed-in";
  mode: AuthMode;
  session: Session | null;
  signIn(next: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState>({ status: "loading", mode: "none", session: null, signIn: () => Promise.resolve(), signOut: () => Promise.resolve() });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<AuthClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => undefined as void;
    void loadAuth().then(async (c) => {
      if (cancelled) return;
      const s = await c.getSession();
      if (cancelled) return;
      setClient(c);
      setSession(s);
      setReady(true);
      unsubscribe = c.onChange((next) => { setSession(next); });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!client) return;
    let busy = false;
    const onInvalid = () => {
      if (busy) return;
      busy = true;
      const back = window.location.pathname;
      void client.signOut().finally(() => {
        setSession(null);
        navigate(`/login?reason=expired&next=${encodeURIComponent(back)}`);
      });
    };
    window.addEventListener(SESSION_INVALID_EVENT, onInvalid);
    return () => { window.removeEventListener(SESSION_INVALID_EVENT, onInvalid); };
  }, [client]);

  const value = useMemo<AuthState>(
    () => ({
      status: !ready ? "loading" : session ? "signed-in" : "signed-out",
      mode: client?.mode ?? "none",
      session,
      signIn: (next) => client?.signIn(next) ?? Promise.resolve(),
      signOut: async () => {
        await client?.signOut();
        setSession(null);
      },
    }),
    [client, ready, session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
