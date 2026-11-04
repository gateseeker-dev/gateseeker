import { z } from "zod";

/**
 * "A newer Gateseeker is available": one small read of the npm registry after
 * a run, never before it, never changing the verdict or the exit code. Off
 * with --no-update-check or GATESEEKER_NO_UPDATE_CHECK=1. `fetch` is injected
 * so tests never reach the network; a missing fetch means no check at all.
 */

export const REGISTRY = "https://registry.npmjs.org";

export interface UpdateCheckOptions {
  current: string;
  fetch: typeof fetch;
  registry?: string;
  timeoutMs?: number;
}

const latestSchema = z.looseObject({ version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/) });

/** Semver precedence (major.minor.patch, then prerelease: a prerelease sorts before the release). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split("-", 2);
    const nums = (core ?? "").split(".").map((n) => Number(n));
    return { nums, pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  const xs = x.pre.split(".");
  const ys = y.pre.split(".");
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    const p = xs[i];
    const q = ys[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) {
      const d = Number(p) - Number(q);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (pn !== qn) return pn ? -1 : 1;
    else if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/** The newer version on the registry's `latest` tag, or null (up to date, offline, or an unexpected answer). */
export async function checkForUpdate(options: UpdateCheckOptions): Promise<string | null> {
  const base = (options.registry ?? REGISTRY).replace(/\/+$/, "");
  try {
    const res = await options.fetch(`${base}/gateseeker/latest`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(options.timeoutMs ?? 2000) });
    if (res.status !== 200) return null;
    const parsed = latestSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    return compareVersions(parsed.data.version, options.current) > 0 ? parsed.data.version : null;
  } catch {
    return null;
  }
}

export function updateLine(current: string, latest: string): string {
  return `Gateseeker ${latest} is available (you run ${current}): npm install -g gateseeker@latest, or npx gateseeker@latest. Set GATESEEKER_NO_UPDATE_CHECK=1 to silence this line.`;
}
