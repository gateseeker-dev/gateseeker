import { handlerOptionsFromEnv } from "gateseeker/dist/web/env.js";
import { handlePublicReportRequest } from "gateseeker/dist/web/handler.js";

/** GET /api/public/<id>: a report its owner shared. No session; the body was redacted before it was stored. */
const options = handlerOptionsFromEnv({ env: process.env, workDir: "/tmp", requireAuth: true });

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).pathname.split("/").pop() ?? "";
  const out = await handlePublicReportRequest(id, options);
  return Response.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });
}
