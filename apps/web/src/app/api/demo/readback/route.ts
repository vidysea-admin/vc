/**
 * T-008 demo only: a read-back of the in-process fake db for one student, so the browser evidence
 * can prove what was written (B14). 404 in live mode: it never exists against the real database.
 */
import { getRuntime } from "../../../../server/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const rt = await getRuntime();
  if (rt.mode !== "demo" || !rt.readback) return Response.json({ state: "not_found" }, { status: 404 });
  const studentId = new URL(req.url).searchParams.get("studentId") ?? "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(studentId)) return Response.json({ state: "invalid" }, { status: 400 });
  return Response.json(rt.readback(studentId), { headers: { "cache-control": "no-store" } });
}
