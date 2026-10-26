/**
 * vc-admin-control S8 / VA19: same-origin pass-through to the S3 admin API (/admin/api/*). Authorised by the Authorization header only.
 */
import { defaultDeps, handleProxy } from "../../../../admin/_lib/session-handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(req: Request, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  return handleProxy(req, path, defaultDeps());
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
