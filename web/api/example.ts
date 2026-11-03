import { handlerOptionsFromEnv } from "gateseeker/dist/web/env.js";
import { handleExampleRequest } from "gateseeker/dist/web/handler.js";

/**
 * GET /api/example: the report of GATESEEKER_EXAMPLE_REPO for signed-out
 * visitors of the Home. No quota, reused for 24 hours per commit, one analysis
 * at a time per instance, nothing saved. The function may run up to 150 s on a
 * cold miss, like a normal analysis.
 */
export const config = { maxDuration: 150 };

const options = handlerOptionsFromEnv({ env: process.env, workDir: "/tmp", requireAuth: true });

export async function GET(): Promise<Response> {
  const out = await handleExampleRequest(options);
  return Response.json(out.body, { status: out.status, headers: { "cache-control": "public, max-age=300" } });
}
