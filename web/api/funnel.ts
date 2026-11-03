import { handlerOptionsFromEnv } from "gateseeker/dist/web/env.js";
import { handleFunnelRequest } from "gateseeker/dist/web/handler.js";

/** GET /api/funnel: aggregate product counters, only for the logins in GATESEEKER_ADMIN_LOGINS. */
const options = handlerOptionsFromEnv({ env: process.env, workDir: "/tmp", requireAuth: true });

export async function GET(req: Request): Promise<Response> {
  const out = await handleFunnelRequest(options, req.headers.get("authorization"));
  return Response.json(out.body, { status: out.status, headers: { "cache-control": "no-store" } });
}
