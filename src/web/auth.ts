import { z } from "zod";

/**
 * Who is calling the hosted service. The page signs the user in with Supabase
 * Auth (GitHub provider) and sends the access token as a bearer header; the
 * service asks Supabase who the token belongs to. The engine never sees the
 * user; only quota and report ownership do.
 *
 * `fetch` is injected so tests never reach the network.
 */

export interface AuthUser {
  id: string;
  /**
   * GitHub login, read from the GitHub identity Supabase records at sign-in
   * (`identities[].identity_data`), which the user cannot edit. Never from
   * `user_metadata`: any signed-in user can rewrite that with their own
   * session, so it would let anyone claim an admin's login (security review
   * 2026-11-14). Used for authorization (admin logins, GitHub App account).
   */
  login: string | null;
}

export interface AuthVerifier {
  /** Resolves the user for a bearer token, or null when the token is missing, invalid or expired. */
  verify(token: string): Promise<AuthUser | null>;
}

const userSchema = z.looseObject({
  id: z.string().min(1),
  identities: z
    .array(z.looseObject({ provider: z.string(), identity_data: z.looseObject({ user_name: z.string().optional(), preferred_username: z.string().optional() }).nullable().optional() }))
    .nullable()
    .optional(),
});

export interface SupabaseAuthOptions {
  url: string;
  anonKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Verifies tokens against Supabase Auth (GET /auth/v1/user). */
export function createSupabaseAuth(options: SupabaseAuthOptions): AuthVerifier {
  const doFetch = options.fetch ?? fetch;
  const base = options.url.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    async verify(token) {
      if (!/^[A-Za-z0-9._~+/=-]{16,4096}$/.test(token)) return null;
      try {
        const res = await doFetch(`${base}/auth/v1/user`, {
          headers: { apikey: options.anonKey, authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status !== 200) return null;
        const parsed = userSchema.safeParse(await res.json());
        if (!parsed.success) return null;
        const github = (parsed.data.identities ?? []).find((i) => i.provider === "github")?.identity_data;
        const login = github?.user_name ?? github?.preferred_username ?? null;
        return { id: parsed.data.id, login: login !== null && /^[A-Za-z0-9-]{1,39}$/.test(login) ? login : null };
      } catch {
        return null;
      }
    },
  };
}

/** Fixed token to user map for the local server and the browser tests. Never used in production. */
export function createStaticAuth(tokens: Record<string, AuthUser>): AuthVerifier {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async verify(token) {
      return Object.hasOwn(tokens, token) ? (tokens[token] ?? null) : null;
    },
  };
}

/** Extracts the token from an `Authorization: Bearer <token>` header value. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m?.[1] ?? null;
}
