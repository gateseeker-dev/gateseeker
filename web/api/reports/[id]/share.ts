import { handlerOptionsFromEnv } from "gateseeker/dist/web/env.js";
import { handleShareRequest } from "gateseeker/dist/web/handler.js";

/** POST /api/reports/<id>/share makes the report readable at /p/<id>; DELETE takes it back. Owner only. */
const options = handlerOptionsFromEnv({ env: process.env, workDir: "/tmp", requireAuth: true });

function idOf(req: Request): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request): Promise<Response> {
  const out = await handleShareRequest("POST", idOf(req), options, req.headers.get("authorization"));
  return Response.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });
}

export async function DELETE(req: Request): Promise<Response> {
  const out = await handleShareRequest("DELETE", idOf(req), options, req.headers.get("authorization"));
  return Response.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });
}
