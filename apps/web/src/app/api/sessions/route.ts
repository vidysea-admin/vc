/**
 * T-021 (D-020, contract B6 "runtime failover"): POST a transcript to start a new scribe run.
 * Thin wiring over src/server/session-service.ts (Zod in and out, B5). Next.js route handler only.
 */
import { submitSession } from "../../../server/session-service";
import { getRuntime } from "../../../server/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "cache-control": "no-store" };

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ state: "invalid", issues: ["(body): not valid JSON"] }, { status: 400, headers: noStore });
  }
  const reply = await submitSession(await getRuntime(), body);
  return Response.json(reply.body, { status: reply.status, headers: noStore });
}
