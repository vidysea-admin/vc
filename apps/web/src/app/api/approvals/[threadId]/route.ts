/**
 * T-008: GET the pending approval of one scribe thread; POST the counsellor's per-fact decision.
 * Thin wiring over src/server/approval-service.ts (Zod in and out, B5). Next.js route handlers only.
 */
import { getApprovalView, submitDecision } from "../../../../server/approval-service";
import { getRuntime } from "../../../../server/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ threadId: string }> };

const noStore = { "cache-control": "no-store" };

/** A malformed %-escape is passed through as-is; the Zod thread-id check then refuses it (400). */
function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { threadId } = await ctx.params;
  const reply = await getApprovalView(await getRuntime(), decodeId(threadId));
  return Response.json(reply.body, { status: reply.status, headers: noStore });
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { threadId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ state: "invalid", issues: ["(body): not valid JSON"] }, { status: 400, headers: noStore });
  }
  const reply = await submitDecision(await getRuntime(), decodeId(threadId), body);
  return Response.json(reply.body, { status: reply.status, headers: noStore });
}
