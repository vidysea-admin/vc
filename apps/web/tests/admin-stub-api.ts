/**
 * vc-admin-control / VA19 (unit vca-ui): a STUB of the S3 admin API for the browser walk. Not the real API (that is built in unit vca-api);
 * canned data, in memory, loopback only. Run:  VC_STUB_PORT=3109 pnpm exec tsx tests/admin-stub-api.ts
 * Then:  VC_ADMIN_API_URL=http://127.0.0.1:3109 pnpm -C apps/web dev
 * Accounts (stub only): super@vc.test / admin@vc.test / viewer@vc.test, password "stub-password-1".
 * Test hooks: POST /__stub/expire (every issued token stops working), POST /__stub/reset (state back to the seed),
 * POST /__stub/downgrade {email} (that account's live tokens become viewer: the stale-role 403 case).
 * It imitates the role matrix of S3 (viewer = GET only; admin = all but admins + secrets; super-admin = all) so the walk can show a real 403.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

type Role = "super-admin" | "admin" | "viewer";
interface Site { partnerId: string; name: string; keys: { pub: { prefix: string; rotatedAt: string | null }; srv: { prefix: string; rotatedAt: string | null } }; allowedOrigins: string[]; status: "active" | "revoked"; createdAt: string }
interface Source { id: string; siteId: string; kind: "github" | "postgres"; config: Record<string, unknown>; hasSecret: boolean; lastSync?: { at: string; status: string; counts?: Record<string, number> } }

const PASSWORD = "stub-password-1";
const ACCOUNTS: Record<string, { id: string; role: Role }> = {
  "super@vc.test": { id: "u-super", role: "super-admin" },
  "admin@vc.test": { id: "u-admin", role: "admin" },
  "viewer@vc.test": { id: "u-viewer", role: "viewer" },
};

let tokens = new Map<string, { email: string; role: Role }>();
let sites: Site[] = [];
let sources: Source[] = [];
let admins: { id: string; email: string; role: Role; disabled: boolean; createdAt: string }[] = [];
let audit: { at: string; actorId: string; action: string; target: string; ok: boolean }[] = [];
let failures: number[] = [];
const secrets = new Map<string, string>();

const token = (n = 6) => randomBytes(n).toString("hex");
const rand43 = () => randomBytes(32).toString("base64url");

function seed(): void {
  const now = new Date().toISOString();
  sites = [
    { partnerId: "pathlynks", name: "Pathlynks", keys: { pub: { prefix: "vck_pub_pathlynks_AbCd", rotatedAt: null }, srv: { prefix: "vck_srv_pathlynks_EfGh", rotatedAt: null } }, allowedOrigins: ["https://pathlynks.example"], status: "active", createdAt: now },
  ];
  sources = [
    { id: "gh-frontend", siteId: "pathlynks", kind: "github", config: { owner: "vidysea", repo: "frontend", branch: "main", service: "frontend", tokenRef: "GITHUB_TOKEN" }, hasSecret: false },
  ];
  admins = Object.entries(ACCOUNTS).map(([email, a]) => ({ id: a.id, email, role: a.role, disabled: false, createdAt: now }));
  audit = [];
  failures = [];
  secrets.clear();
}
seed();

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    const v: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function record(actor: string, action: string, target: string, ok: boolean): void {
  audit.unshift({ at: new Date().toISOString(), actorId: actor, action, target, ok });
}

function metrics(from: string, to: string, siteId?: string) {
  const days: string[] = [];
  for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z") && days.length < 31; d = new Date(d.getTime() + 86_400_000)) days.push(d.toISOString().slice(0, 10));
  const use = sites.filter(s => !siteId || s.partnerId === siteId);
  const perSiteDay = use.flatMap((s, si) => days.map((day, di) => ({ siteId: s.partnerId, day, conversations: 20 + ((di * 7 + si * 13) % 40) })));
  const total = perSiteDay.reduce((a, r) => a + r.conversations, 0);
  return { perSiteDay, activeStudents: Math.round(total / 3), chatVsVoice: { chat: Math.round(total * 0.85), voice: Math.round(total * 0.15) }, tokens: total * 2300, costUsd: total * 0.021, costPerStudentInr: 21.4, latencyP50: 820, latencyP95: 2310, guardrailHits: 6, unanswered: 14 };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  const method = req.method ?? "GET";
  if (url.pathname === "/__stub/expire" && method === "POST") { tokens = new Map(); return send(res, 200, { ok: true }); }
  if (url.pathname === "/__stub/reset" && method === "POST") { tokens = new Map(); seed(); return send(res, 200, { ok: true }); }
  if (url.pathname === "/__stub/downgrade" && method === "POST") {
    const b = await readBody(req);
    for (const v of tokens.values()) if (v.email === b.email) v.role = "viewer";
    return send(res, 200, { ok: true });
  }
  const m = /^\/admin\/api\/(.+)$/.exec(url.pathname);
  if (!m) return send(res, 404, { error: "not_found" });
  const parts = m[1].split("/");
  const body = method === "GET" ? {} : await readBody(req);

  if (parts[0] === "login" && method === "POST") {
    const now = Date.now();
    failures = failures.filter(t => now - t < 60_000);
    if (failures.length >= 5) return send(res, 429, { error: "rate_limited" });
    const email = String(body.email ?? "").toLowerCase();
    const acct = ACCOUNTS[email];
    if (!acct || body.password !== PASSWORD) { failures.push(now); return send(res, 401, { error: "invalid_credentials" }); }
    const t = `stub.${acct.role}.${token()}`;
    tokens.set(t, { email, role: acct.role });
    return send(res, 200, { token: t, role: acct.role, email });
  }

  const auth = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""));
  const who = auth ? tokens.get(auth[1]) : undefined;
  if (!who) return send(res, 401, { error: "unauthorized" });
  const write = method !== "GET";
  const superOnly = parts[0] === "admins" || (parts[0] === "sources" && parts[2] === "secret");
  if ((write && who.role === "viewer") || (superOnly && who.role !== "super-admin")) { record(who.email, `${method} ${m[1]}`, parts[1] ?? parts[0], false); return send(res, 403, { error: "forbidden" }); }

  if (parts[0] === "me") return send(res, 200, { email: who.email, role: who.role });
  if (parts[0] === "audit") return send(res, 200, { entries: audit.slice(0, 100) });
  if (parts[0] === "metrics") return send(res, 200, metrics(url.searchParams.get("from") ?? "2026-10-19", url.searchParams.get("to") ?? "2026-10-25", url.searchParams.get("siteId") ?? undefined));

  if (parts[0] === "admins") {
    if (method === "GET") return send(res, 200, { admins });
    if (method === "POST") {
      const email = String(body.email ?? "").toLowerCase();
      const role = (["super-admin", "admin", "viewer"] as const).find(r => r === body.role);
      if (!email || !role || String(body.password ?? "").length < 12) return send(res, 400, { error: "invalid_admin" });
      if (admins.some(a => a.email === email)) return send(res, 409, { error: "exists" });
      const a = { id: `u-${token(3)}`, email, role, disabled: false, createdAt: new Date().toISOString() };
      admins.push(a);
      record(who.email, "admins.create", email, true);
      return send(res, 201, { admin: a });
    }
    if (method === "PATCH" && parts[1]) {
      const a = admins.find(x => x.id === parts[1]);
      const role = (["super-admin", "admin", "viewer"] as const).find(r => r === body.role);
      if (!a || !role) return send(res, 404, { error: "not_found" });
      a.role = role;
      record(who.email, "admins.set_role", a.email, true);
      return send(res, 200, { admin: a });
    }
  }

  if (parts[0] === "sites") {
    if (method === "GET") return send(res, 200, { sites });
    if (method === "POST" && !parts[1]) {
      const name = String(body.name ?? "").trim();
      const id = String(body.id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).slice(0, 32);
      if (!name || id.length < 2) return send(res, 400, { error: "invalid_site" });
      if (sites.some(s => s.partnerId === id)) return send(res, 409, { error: "partner_exists" });
      const pub = `vck_pub_${id}_${rand43()}`;
      const srv = `vck_srv_${id}_${rand43()}`;
      const s: Site = { partnerId: id, name, keys: { pub: { prefix: pub.slice(0, id.length + 13), rotatedAt: null }, srv: { prefix: srv.slice(0, id.length + 13), rotatedAt: null } }, allowedOrigins: Array.isArray(body.origins) ? body.origins.map(String) : [], status: "active", createdAt: new Date().toISOString() };
      sites.push(s);
      record(who.email, "sites.create", id, true);
      return send(res, 201, { partner: s, keys: { pub, srv } });
    }
    const site = sites.find(s => s.partnerId === parts[1]);
    if (!site) return send(res, 404, { error: "partner_not_found" });
    if (method === "PATCH") {
      if (typeof body.name === "string" && body.name.trim()) site.name = body.name.trim();
      if (Array.isArray(body.origins)) site.allowedOrigins = body.origins.map(String);
      record(who.email, "sites.update", site.partnerId, true);
      return send(res, 200, { partner: site });
    }
    if (parts[2] === "keys" && parts[3] === "rotate" && method === "POST") {
      if (site.status === "revoked") return send(res, 409, { error: "partner_revoked" });
      const scope = body.scope === "srv" ? "srv" : "pub";
      const key = `vck_${scope}_${site.partnerId}_${rand43()}`;
      site.keys[scope] = { prefix: key.slice(0, site.partnerId.length + 13), rotatedAt: new Date().toISOString() };
      record(who.email, "sites.rotate", `${site.partnerId}:${scope}`, true);
      return send(res, 200, { partner: site, key, scope });
    }
    if (parts[2] === "revoke" && method === "POST") { site.status = "revoked"; record(who.email, "sites.revoke", site.partnerId, true); return send(res, 200, { partner: site }); }
    if (parts[2] === "unrevoke" && method === "POST") { site.status = "active"; record(who.email, "sites.unrevoke", site.partnerId, true); return send(res, 200, { partner: site }); }
  }

  if (parts[0] === "sources") {
    if (method === "GET") return send(res, 200, { sources });
    if (method === "POST" && !parts[1]) {
      const id = String(body.id ?? "");
      if (!id || (body.kind !== "github" && body.kind !== "postgres")) return send(res, 400, { error: "invalid_source" });
      if (sources.some(s => s.id === id)) return send(res, 409, { error: "exists" });
      const { kind, id: _id, ...config } = body;
      const s: Source = { id, siteId: "pathlynks", kind: kind as "github" | "postgres", config, hasSecret: false };
      sources.push(s);
      record(who.email, "sources.create", id, true);
      return send(res, 201, { source: s });
    }
    const src = sources.find(s => s.id === parts[1]);
    if (!src) return send(res, 404, { error: "not_found" });
    if (parts[2] === "secret" && method === "PUT") {
      if (typeof body.secret !== "string" || body.secret === "") return send(res, 400, { error: "invalid_secret" });
      secrets.set(src.id, body.secret);
      src.hasSecret = true;
      record(who.email, "sources.set_secret", src.id, true);
      return send(res, 200, { ok: true, hasSecret: true });
    }
    if (parts[2] === "test" && method === "POST") { record(who.email, "sources.test", src.id, true); return send(res, 200, { ok: src.hasSecret, message: src.hasSecret ? "Connection works." : "No secret is set for this source." }); }
    if (parts[2] === "sync" && method === "POST") { src.lastSync = { at: new Date().toISOString(), status: "ok", counts: { files: 42 } }; record(who.email, "sources.sync", src.id, true); return send(res, 200, { status: "ok", counts: { files: 42 } }); }
  }
  return send(res, 404, { error: "not_found" });
});

const port = Number(process.env.VC_STUB_PORT ?? "3109");
server.listen(port, "127.0.0.1", () => console.error(`admin stub api on http://127.0.0.1:${port}`));
