import { handlerOptionsFromEnv } from "gateseeker/dist/web/env.js";
import { handleAccountRequest } from "gateseeker/dist/web/handler.js";

/** DELETE /api/account with {confirm: "<GitHub login>"}: deletes the signed-in account and everything kept for it. */
const options = handlerOptionsFromEnv({ env: process.env, workDir: "/tmp", requireAuth: true });

async function handle(req: Request): Promise<Response> {
  let body: unknown = null;
  try {
    const text = await req.text();
    if (text.length > 1024) return Response.json({ ok: false, error: { code: "bad-request", message: "Body too large." } }, { status: 413 });
    body = JSON.parse(text) as unknown;
  } catch {
    body = null;
  }
  const out = await handleAccountRequest(req.method, body, options, req.headers.get("authorization"));
  return Response.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });
}

export const DELETE = handle;
