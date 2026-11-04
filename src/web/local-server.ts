import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GATESEEKER_VERSION } from "../version.js";
import { authConfigFromEnv, exampleRepoFromEnv, handlerOptionsFromEnv } from "./env.js";
import { handleAccountRequest, handleAdminRequest, handleExampleRequest, handleFunnelRequest, handleGitHubRequest, handlePublicReportRequest, handleShareRequest, handleCleanupRequest, handleEventRequest, handleFeedPublishedRequest, handleUnsubscribeRequest, handleFollowsRequest, handleMonitorRequest, handleReportRequest, handleScanRequest, handleScansRequest } from "./handler.js";

/**
 * Development and end-to-end server for the public page: serves web/dist and
 * answers the same routes as the Vercel functions with the shared handlers.
 * It is not the production deployment (that is web/api on Vercel).
 *
 *   GET  /api/config          auth mode for the page
 *   POST /api/scan            analyze (bearer token when auth is configured)
 *   GET  /api/reports/<id>    a saved report of the signed-in user
 *   POST/DELETE /api/reports/<id>/share  share or unshare it at /p/<id>
 *   GET  /api/public/<id>     a shared report (no session)
 *   GET  /api/example         the example repository's report (no session, no quota)
 *   GET  /api/funnel          product counters (GATESEEKER_ADMIN_LOGINS only)
 *   GET  /api/admin/overview, /api/admin/accounts[?before=], /api/admin/accounts/<id>  admin master (same logins)
 *   GET/POST/DELETE /api/follows  followed repositories of the signed-in user
 *   GET  /api/github/install?repo=owner/name, GET/POST /api/github/installations, DELETE /api/github/installations/<id>
 *                             the GitHub App authorization for private repositories (docs/SPRINT_8.md)
 *   DELETE /api/account       delete the signed-in account and its data ({confirm: login})
 *   GET  /api/cron/monitor    rescan due followed repositories (bearer CRON_SECRET)
 *   POST /api/feed/published  store a signed advisory set, queue and rescan (GATESEEKER_FEED_KEY)
 *   GET  /api/scans           the signed-in user's analysis history
 *   GET  /api/cron/cleanup    purge expired reports (bearer CRON_SECRET)
 *   POST /api/event           count a login-funnel event (anonymous, aggregate)
 *   POST /api/unsubscribe     stop following from an email link (?f=&t= or JSON {f, t}; no session)
 *   GET  /api/dev/outbox      emails kept in memory (stub sign-in only; nothing is sent)
 *
 * Environment: see env.ts, plus
 *   GATESEEKER_WEB_PORT      default 4320
 *   GATESEEKER_WEB_DIST      default <repo>/web/dist
 */

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(process.env.GATESEEKER_WEB_DIST ?? join(here, "..", "..", "web", "dist"));
const port = Number(process.env.GATESEEKER_WEB_PORT ?? "4320");
const host = "127.0.0.1";
const MAX_BODY = 4096;

const options = handlerOptionsFromEnv({ env: process.env });
/** Stub mode only: POST /api/dev/version {version, build} makes /api/config report another version or deploy id, for the update-notice tests. */
let reportedVersion: string = GATESEEKER_VERSION;
let reportedBuild: string | null = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
const authConfig = authConfigFromEnv(process.env);
const exampleRepo = exampleRepoFromEnv(process.env);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, max = MAX_BODY): Promise<string | null> {
  return new Promise((resolveBody) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        resolveBody(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => { resolveBody(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", () => { resolveBody(null); });
  });
}

function serveStatic(res: ServerResponse, urlPath: string): void {
  const safe = urlPath.split("/").filter((s) => s !== "" && s !== "." && s !== "..").join("/");
  let file = join(dist, safe);
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  // Single-page app: unknown paths fall back to index.html.
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("web/dist not built; run pnpm build:web");
    return;
  }
  const connect = authConfig.mode === "supabase" ? `'self' ${new URL(authConfig.url).origin}` : "'self'";
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
    "content-security-policy": `default-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com; style-src 'self' 'unsafe-inline'; connect-src ${connect}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${host}:${port}`);
  const authorization = req.headers.authorization ?? null;

  if (url.pathname === "/api/config") {
    json(res, 200, { ok: true, auth: authConfig, exampleRepo, version: reportedVersion, build: reportedBuild, githubApp: options.githubApp !== undefined });
    return;
  }
  if (url.pathname === "/api/scan") {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: { code: "bad-request", message: "POST only." } });
      return;
    }
    void (async () => {
      const raw = await readBody(req);
      let body: unknown;
      try {
        body = raw === null ? null : (JSON.parse(raw) as unknown);
      } catch {
        body = null;
      }
      const out = await handleScanRequest(body, options, authorization);
      json(res, out.status, out.body);
    })();
    return;
  }
  if (url.pathname === "/api/follows") {
    void (async () => {
      const raw = req.method === "GET" ? null : await readBody(req);
      let body: unknown;
      try {
        body = raw === null ? null : (JSON.parse(raw) as unknown);
      } catch {
        body = null;
      }
      const out = await handleFollowsRequest(req.method ?? "GET", body, options, authorization);
      json(res, out.status, out.body);
    })();
    return;
  }
  if (url.pathname === "/api/account") {
    void (async () => {
      const raw = await readBody(req);
      let body: unknown;
      try {
        body = raw === null ? null : (JSON.parse(raw) as unknown);
      } catch {
        body = null;
      }
      const out = await handleAccountRequest(req.method ?? "GET", body, options, authorization);
      json(res, out.status, out.body);
    })();
    return;
  }
  if (url.pathname === "/api/feed/published") {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: { code: "bad-request", message: "POST only." } });
      return;
    }
    void (async () => {
      const raw = await readBody(req, 4_500_000);
      let body: unknown;
      try {
        body = raw === null ? null : (JSON.parse(raw) as unknown);
      } catch {
        body = null;
      }
      const out = await handleFeedPublishedRequest(body, options);
      json(res, out.status, out.body);
    })();
    return;
  }
  if (url.pathname === "/api/unsubscribe") {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: { code: "bad-request", message: "POST only." } });
      return;
    }
    void (async () => {
      const raw = await readBody(req);
      let body: unknown = null;
      try {
        body = raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        /* the one-click header posts a form body; the id and token are in the query */
      }
      const input = body !== null && typeof body === "object" ? body : { f: url.searchParams.get("f"), t: url.searchParams.get("t") };
      const out = await handleUnsubscribeRequest(input, options);
      json(res, out.status, out.body);
    })();
    return;
  }
  if (url.pathname === "/api/dev/version" && authConfig.mode === "stub" && req.method === "POST") {
    void readBody(req).then((raw) => {
      try {
        const body = JSON.parse(raw ?? "") as { version?: unknown; build?: unknown };
        if (typeof body.version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(body.version)) reportedVersion = body.version;
        if (typeof body.build === "string" && /^[0-9a-f]{0,40}$/.test(body.build)) reportedBuild = body.build || null;
      } catch {
        /* ignored */
      }
      json(res, 200, { ok: true, version: reportedVersion, build: reportedBuild });
    });
    return;
  }
  if (url.pathname === "/api/dev/outbox" && authConfig.mode === "stub") {
    const mailer = options.mail?.mailer as { sent?: unknown[] } | null | undefined;
    json(res, 200, { ok: true, sent: mailer?.sent ?? [] });
    return;
  }
  if (url.pathname === "/api/cron/monitor") {
    void handleMonitorRequest(options, authorization, process.env.CRON_SECRET).then((out) => { json(res, out.status, out.body); });
    return;
  }
  if (url.pathname === "/api/scans") {
    void handleScansRequest(options, authorization).then((out) => { json(res, out.status, out.body); });
    return;
  }
  const shareMatch = /^\/api\/reports\/([A-Za-z0-9-]{1,64})\/share$/.exec(url.pathname);
  if (shareMatch) {
    void handleShareRequest(req.method ?? "GET", shareMatch[1] ?? "", options, authorization).then((out) => { json(res, out.status, out.body); });
    return;
  }
  const reportMatch = /^\/api\/reports\/([A-Za-z0-9-]{1,64})$/.exec(url.pathname);
  if (reportMatch) {
    void handleReportRequest(reportMatch[1] ?? "", options, authorization).then((out) => { json(res, out.status, out.body); });
    return;
  }
  const publicMatch = /^\/api\/public\/([A-Za-z0-9-]{1,64})$/.exec(url.pathname);
  if (publicMatch) {
    void handlePublicReportRequest(publicMatch[1] ?? "", options).then((out) => { json(res, out.status, out.body); });
    return;
  }
  if (url.pathname === "/api/example") {
    void handleExampleRequest(options).then((out) => { json(res, out.status, out.body); });
    return;
  }
  if (url.pathname.startsWith("/api/github/")) {
    void (async () => {
      const raw = req.method === "POST" ? await readBody(req) : null;
      let body: unknown;
      try {
        body = raw === null ? null : (JSON.parse(raw) as unknown);
      } catch {
        body = null;
      }
      const out = await handleGitHubRequest(req.method ?? "GET", url.pathname.slice("/api/github/".length), url.searchParams, body, options, authorization);
      json(res, out.status, out.body);
    })();
    return;
  }
  if (url.pathname.startsWith("/api/admin/")) {
    void handleAdminRequest(url.pathname.slice("/api/admin/".length), url.searchParams, options, authorization).then((out) => { json(res, out.status, out.body); });
    return;
  }
  if (url.pathname === "/api/funnel") {
    void handleFunnelRequest(options, authorization).then((out) => { json(res, out.status, out.body); });
    return;
  }
  if (url.pathname === "/api/event") {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: { code: "bad-request", message: "POST only." } });
      return;
    }
    void (async () => {
      const raw = await readBody(req);
      let body: unknown;
      try {
        body = raw === null ? null : (JSON.parse(raw) as unknown);
      } catch {
        body = null;
      }
      const out = await handleEventRequest(body, options);
      json(res, out.status, out.body);
    })();
    return;
  }
  if (url.pathname === "/api/cron/cleanup") {
    void handleCleanupRequest(options, authorization, process.env.CRON_SECRET).then((out) => { json(res, out.status, out.body); });
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    json(res, 404, { ok: false, error: { code: "not-found", message: "No such route." } });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  serveStatic(res, url.pathname);
});

server.listen(port, host, () => {
  console.log(`gateseeker web (local) listening on http://${host}:${port}/ serving ${dist} (auth: ${authConfig.mode})`);
});
