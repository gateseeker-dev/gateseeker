import { authConfigFromEnv, exampleRepoFromEnv, handlerOptionsFromEnv } from "gateseeker/dist/web/env.js";
import {
  handleAccountRequest,
  handleCleanupRequest,
  handleEventRequest,
  handleExampleRequest,
  handleFeedPublishedRequest,
  handleFollowsRequest,
  handleFunnelRequest,
  handleMonitorRequest,
  handlePublicReportRequest,
  handleReportRequest,
  handleScanRequest,
  handleScansRequest,
  handleShareRequest,
  handleUnsubscribeRequest,
  type HttpResponse,
} from "gateseeker/dist/web/handler.js";

/**
 * The whole API in one Vercel Function (Node.js runtime, web signature).
 * One function instead of one file per route because the Hobby plan allows
 * twelve functions per deployment and the API has more routes than that;
 * the routing mirrors src/web/local-server.ts, which the browser tests cover.
 * The longest jobs (feed publish, daily monitor) set the duration for all.
 */
export const config = { maxDuration: 300 };

const options = handlerOptionsFromEnv({ env: process.env, workDir: "/tmp", requireAuth: true });
const BUDGET_MS = 270_000;

const ID = "([A-Za-z0-9-]{1,64})";
const REPORT = new RegExp(`^/api/reports/${ID}$`);
const SHARE = new RegExp(`^/api/reports/${ID}/share$`);
const PUBLIC = new RegExp(`^/api/public/${ID}$`);

function answer(out: HttpResponse, cache = "no-store"): Response {
  return Response.json(out.body, { status: out.status, headers: { "cache-control": cache } });
}

function refuse(status: number, message: string, allow?: string): Response {
  return Response.json({ ok: false, error: { code: "bad-request", message } }, { status, headers: allow ? { allow } : {} });
}

/** JSON body up to `max` bytes; null when absent, oversized or malformed (each handler answers bad-request). */
async function jsonBody(req: Request, max: number): Promise<{ body: unknown } | { tooLarge: true }> {
  try {
    const text = await req.text();
    if (text.length > max) return { tooLarge: true };
    return { body: text ? (JSON.parse(text) as unknown) : null };
  } catch {
    return { body: null };
  }
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method.toUpperCase();
  const authorization = req.headers.get("authorization");

  if (path === "/api/config") {
    if (method !== "GET") return refuse(405, "GET only.", "GET");
    return Response.json({ ok: true, auth: authConfigFromEnv(process.env), exampleRepo: exampleRepoFromEnv(process.env) }, { headers: { "cache-control": "no-store" } });
  }
  if (path === "/api/scan") {
    if (method !== "POST") return refuse(405, "POST only.", "POST");
    const b = await jsonBody(req, 4096);
    if ("tooLarge" in b) return refuse(413, "Body too large.");
    return answer(await handleScanRequest(b.body, options, authorization));
  }
  if (path === "/api/example") {
    if (method !== "GET") return refuse(405, "GET only.", "GET");
    return answer(await handleExampleRequest(options), "public, max-age=300");
  }
  if (path === "/api/scans") {
    if (method !== "GET") return refuse(405, "GET only.", "GET");
    return answer(await handleScansRequest(options, authorization));
  }
  if (path === "/api/funnel") {
    if (method !== "GET") return refuse(405, "GET only.", "GET");
    return answer(await handleFunnelRequest(options, authorization));
  }
  if (path === "/api/follows") {
    if (method !== "GET" && method !== "POST" && method !== "DELETE") return refuse(405, "GET, POST or DELETE.", "GET, POST, DELETE");
    const b = method === "GET" ? { body: null } : await jsonBody(req, 1024);
    if ("tooLarge" in b) return refuse(413, "Body too large.");
    return answer(await handleFollowsRequest(method, b.body, options, authorization));
  }
  if (path === "/api/account") {
    if (method !== "DELETE") return refuse(405, "DELETE only.", "DELETE");
    const b = await jsonBody(req, 1024);
    if ("tooLarge" in b) return refuse(413, "Body too large.");
    return answer(await handleAccountRequest(method, b.body, options, authorization));
  }
  if (path === "/api/event") {
    if (method !== "POST") return refuse(405, "POST only.", "POST");
    const b = await jsonBody(req, 256);
    if ("tooLarge" in b) return refuse(413, "Body too large.");
    return answer(await handleEventRequest(b.body, options));
  }
  if (path === "/api/unsubscribe") {
    if (method !== "POST") return refuse(405, "POST only.", "POST");
    let input: unknown = { f: url.searchParams.get("f"), t: url.searchParams.get("t") };
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const b = await jsonBody(req, 4096);
      if (!("tooLarge" in b) && b.body !== null && typeof b.body === "object") input = b.body;
    }
    return answer(await handleUnsubscribeRequest(input, options));
  }
  if (path === "/api/feed/published") {
    if (method !== "POST") return refuse(405, "POST only.", "POST");
    const b = await jsonBody(req, 4_500_000);
    if ("tooLarge" in b) return refuse(413, "Body too large.");
    return answer(await handleFeedPublishedRequest(b.body, { ...options, budgetMs: BUDGET_MS }));
  }
  if (path === "/api/cron/monitor") {
    if (method !== "GET") return refuse(405, "GET only.", "GET");
    return answer(await handleMonitorRequest({ ...options, budgetMs: BUDGET_MS }, authorization, process.env.CRON_SECRET));
  }
  if (path === "/api/cron/cleanup") {
    if (method !== "GET") return refuse(405, "GET only.", "GET");
    return answer(await handleCleanupRequest(options, authorization, process.env.CRON_SECRET));
  }
  const share = SHARE.exec(path);
  if (share) {
    if (method !== "POST" && method !== "DELETE") return refuse(405, "POST shares, DELETE unshares.", "POST, DELETE");
    return answer(await handleShareRequest(method, share[1] ?? "", options, authorization));
  }
  const report = REPORT.exec(path);
  if (report) {
    if (method !== "GET") return refuse(405, "GET only.", "GET");
    return answer(await handleReportRequest(report[1] ?? "", options, authorization));
  }
  const pub = PUBLIC.exec(path);
  if (pub) {
    if (method !== "GET") return refuse(405, "GET only.", "GET");
    return answer(await handlePublicReportRequest(pub[1] ?? "", options));
  }
  return Response.json({ ok: false, error: { code: "not-found", message: "No such route." } }, { status: 404, headers: { "cache-control": "no-store" } });
}

export const GET = route;
export const POST = route;
export const DELETE = route;
export const PUT = route;
export const PATCH = route;
