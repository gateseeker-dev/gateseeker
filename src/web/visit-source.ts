/**
 * Where a signed-out visit came from, as one word of a closed list, for the
 * aggregate "visit_<source>" counters (docs/SPRINT_9.md). Built from the
 * `?ref=` of our own links when present, otherwise from the referrer's host
 * only; nothing else about the visit is kept, and an unknown site is "other".
 */

export const VISIT_SOURCES = ["direct", "search", "github", "hn", "reddit", "x", "linkedin", "other"] as const;
export type VisitSource = (typeof VISIT_SOURCES)[number];
export const VISIT_EVENT_KINDS = ["visit_direct", "visit_search", "visit_github", "visit_hn", "visit_reddit", "visit_x", "visit_linkedin", "visit_other"] as const satisfies readonly `visit_${VisitSource}`[];
export type VisitEventKind = (typeof VISIT_EVENT_KINDS)[number];

const HOSTS: [RegExp, VisitSource][] = [
  [/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|kagi|yandex|baidu)\.[a-z.]+$/, "search"],
  [/(^|\.)github\.(com|io)$/, "github"],
  [/^news\.ycombinator\.com$/, "hn"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$/, "x"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "linkedin"],
];

/** `ref` is the value of our own `?ref=` parameter; `referrer` is document.referrer; `ownHost` is the site's host (internal navigation is not a visit source). */
export function visitSource(ref: string | null, referrer: string, ownHost: string): VisitSource {
  const r = (ref ?? "").trim().toLowerCase();
  if ((VISIT_SOURCES as readonly string[]).includes(r)) return r as VisitSource;
  if (r === "twitter") return "x";
  if (r === "ycombinator" || r === "hackernews") return "hn";
  if (referrer === "") return "direct";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host === ownHost.toLowerCase()) return "direct";
  for (const [re, source] of HOSTS) if (re.test(host)) return source;
  return "other";
}
