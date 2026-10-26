/**
 * vc-admin-control S8 / VA19: browser-side client for the S3 admin API, reached through the same-origin pass-through
 * (api/admin-session/proxy/* -> /admin/api/*). The JWT is held in memory by the caller and sent ONLY in the Authorization header.
 * Failures become AdminApiError with a fixed sentence: raw server text is never shown.
 */
import type { AdminRole, AdminSummary, AuditEntry, KeyScope, Metrics, MetricsQuery, SiteSummary, SourceActionResult, SourceInput, SourceSummary } from "./types";

export const PROXY_BASE = "/api/admin-session/proxy";

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export interface AdminClientDeps {
  fetch: typeof fetch;
  getToken: () => string | undefined;
  /** Called on a 401: the session is gone, the page returns to login. */
  onUnauthorized: () => void;
}

const SAFE_CODE = /^[a-z0-9_]{1,40}$/;

function sentenceFor(status: number): string {
  if (status === 0) return "Could not reach the admin service. Try again.";
  if (status === 400 || status === 422) return "The request was not accepted. Check the fields and try again.";
  if (status === 401) return "Your session has ended. Sign in again.";
  if (status === 403) return "You are not allowed to do that.";
  if (status === 404) return "That item was not found.";
  if (status === 409) return "That already exists or changed in the meantime.";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (status === 503) return "The admin service is not configured.";
  return "The admin service had a problem. Try again.";
}

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function readSite(v: unknown): SiteSummary {
  const o = asObj(v);
  const keys = asObj(o.keys);
  const k = (s: KeyScope) => {
    const r = asObj(keys[s]);
    return { prefix: str(r.prefix), rotatedAt: typeof r.rotatedAt === "string" ? r.rotatedAt : null };
  };
  return {
    partnerId: str(o.partnerId, str(o.id)),
    name: str(o.name),
    keys: { pub: k("pub"), srv: k("srv") },
    allowedOrigins: asArr(o.allowedOrigins ?? o.origins).filter((x): x is string => typeof x === "string"),
    status: o.status === "revoked" ? "revoked" : "active",
    createdAt: str(o.createdAt),
  };
}

function readSource(v: unknown): SourceSummary {
  const o = asObj(v);
  const last = asObj(o.lastSync);
  return {
    id: str(o.id, str(o._id)),
    siteId: str(o.siteId),
    kind: o.kind === "postgres" ? "postgres" : "github",
    config: asObj(o.config),
    hasSecret: o.hasSecret === true,
    lastSync: typeof last.at === "string" ? { at: last.at, status: str(last.status), counts: asObj(last.counts) as Record<string, number> } : undefined,
  };
}

function readAdmin(v: unknown): AdminSummary {
  const o = asObj(v);
  const role = o.role === "super-admin" || o.role === "admin" ? o.role : "viewer";
  return { id: str(o.id, str(o._id)), email: str(o.email), role, disabled: o.disabled === true, createdAt: str(o.createdAt) };
}

function readMetrics(v: unknown): Metrics {
  const o = asObj(v);
  const cv = asObj(o.chatVsVoice);
  return {
    perSiteDay: asArr(o.perSiteDay).map(r => ({ siteId: str(asObj(r).siteId), day: str(asObj(r).day), conversations: num(asObj(r).conversations) })),
    activeStudents: num(o.activeStudents),
    chatVsVoice: { chat: num(cv.chat), voice: num(cv.voice) },
    tokens: num(o.tokens),
    costUsd: num(o.costUsd),
    costPerStudentInr: num(o.costPerStudentInr),
    latencyP50: num(o.latencyP50),
    latencyP95: num(o.latencyP95),
    guardrailHits: num(o.guardrailHits),
    unanswered: num(o.unanswered),
  };
}

function readKeys(v: unknown): { label: string; value: string }[] {
  const o = asObj(v);
  return (["pub", "srv"] as const).filter(s => typeof o[s] === "string" && o[s] !== "").map(s => ({ label: s, value: o[s] as string }));
}

export function createAdminClient(deps: AdminClientDeps) {
  async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { accept: "application/json" };
    const token = deps.getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    let payload: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await deps.fetch(`${PROXY_BASE}${path}`, { method, headers, body: payload, cache: "no-store" });
    } catch {
      throw new AdminApiError(0, sentenceFor(0));
    }
    let data: Record<string, unknown> = {};
    try {
      data = asObj(await res.json());
    } catch {
      data = {};
    }
    if (res.ok) return data;
    if (res.status === 401) deps.onUnauthorized();
    const code = typeof data.error === "string" && SAFE_CODE.test(data.error) && res.status < 500 ? data.error : undefined;
    throw new AdminApiError(res.status, sentenceFor(res.status), code);
  }

  const id = (s: string) => encodeURIComponent(s);

  return {
    async me(): Promise<{ email: string; role: AdminRole | null }> {
      const o = await call("GET", "/me");
      const role = o.role === "super-admin" || o.role === "admin" || o.role === "viewer" ? o.role : null;
      return { email: str(o.email), role };
    },
    async listSites(): Promise<SiteSummary[]> {
      const o = await call("GET", "/sites");
      return asArr(o.sites ?? o.partners).map(readSite);
    },
    async createSite(input: { name: string; origins: string[]; id?: string }): Promise<{ site: SiteSummary; keys: { label: string; value: string }[] }> {
      const o = await call("POST", "/sites", input);
      return { site: readSite(o.partner ?? o.site), keys: readKeys(o.keys) };
    },
    async updateSite(siteId: string, patch: { name?: string; origins?: string[] }): Promise<SiteSummary> {
      const o = await call("PATCH", `/sites/${id(siteId)}`, patch);
      return readSite(o.partner ?? o.site ?? o);
    },
    async rotateKey(siteId: string, scope: KeyScope): Promise<{ site: SiteSummary; key: string; scope: KeyScope }> {
      const o = await call("POST", `/sites/${id(siteId)}/keys/rotate`, { scope });
      return { site: readSite(o.partner ?? o.site), key: str(o.key), scope };
    },
    async revokeSite(siteId: string): Promise<SiteSummary> {
      const o = await call("POST", `/sites/${id(siteId)}/revoke`, {});
      return readSite(o.partner ?? o.site ?? o);
    },
    async unrevokeSite(siteId: string): Promise<SiteSummary> {
      const o = await call("POST", `/sites/${id(siteId)}/unrevoke`, {});
      return readSite(o.partner ?? o.site ?? o);
    },
    async listSources(): Promise<SourceSummary[]> {
      const o = await call("GET", "/sources");
      return asArr(o.sources).map(readSource);
    },
    async createSource(input: SourceInput): Promise<SourceSummary> {
      const o = await call("POST", "/sources", input);
      return readSource(o.source ?? o);
    },
    async setSourceSecret(sourceId: string, secret: string): Promise<void> {
      await call("PUT", `/sources/${id(sourceId)}/secret`, { secret });
    },
    async testSource(sourceId: string): Promise<SourceActionResult> {
      const o = await call("POST", `/sources/${id(sourceId)}/test`, {});
      return { ok: o.ok === true, message: str(o.message, o.ok === true ? "Connection works." : "Connection failed.").slice(0, 200) };
    },
    async syncSource(sourceId: string): Promise<SourceActionResult> {
      const o = await call("POST", `/sources/${id(sourceId)}/sync`, {});
      const status = str(o.status, "unknown");
      const counts = Object.entries(asObj(o.counts))
        .filter(([, v]) => typeof v === "number")
        .map(([k, v]) => `${k} ${v}`)
        .join(", ");
      return { ok: status !== "error" && status !== "failed", message: `Sync ${status}${counts ? ` (${counts})` : ""}` };
    },
    async listAdmins(): Promise<AdminSummary[]> {
      const o = await call("GET", "/admins");
      return asArr(o.admins).map(readAdmin);
    },
    async createAdmin(input: { email: string; password: string; role: AdminRole }): Promise<AdminSummary> {
      const o = await call("POST", "/admins", input);
      return readAdmin(o.admin ?? o);
    },
    async setAdminRole(adminId: string, role: AdminRole): Promise<AdminSummary> {
      const o = await call("PATCH", `/admins/${id(adminId)}`, { role });
      return readAdmin(o.admin ?? o);
    },
    async metrics(q: MetricsQuery): Promise<Metrics> {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.siteId) p.set("siteId", q.siteId);
      return readMetrics(await call("GET", `/metrics?${p.toString()}`));
    },
    async audit(): Promise<AuditEntry[]> {
      const o = await call("GET", "/audit");
      return asArr(o.entries ?? o.audit).map(e => {
        const r = asObj(e);
        return { at: str(r.at), actorId: str(r.actorId), action: str(r.action), target: str(r.target), ok: r.ok === true };
      });
    },
  };
}

export type AdminClient = ReturnType<typeof createAdminClient>;
