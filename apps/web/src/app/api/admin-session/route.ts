/**
 * vc-admin-control S8 / VA19: holds the admin JWT in an httpOnly cookie. Thin wiring over admin/_lib/session-handlers.ts.
 */
import { defaultDeps, handleSessionDelete, handleSessionGet, handleSessionLogin } from "../../admin/_lib/session-handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  return handleSessionLogin(req, defaultDeps());
}

export async function GET(req: Request): Promise<Response> {
  return handleSessionGet(req, defaultDeps());
}

export async function DELETE(req: Request): Promise<Response> {
  return handleSessionDelete(req, defaultDeps());
}
