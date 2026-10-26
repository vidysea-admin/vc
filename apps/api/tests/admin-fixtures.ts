/**
 * vc-admin-control fixtures for the admin API tests: the in-memory fake Db (B8), the real admin store, the real partner store, a fixed clock
 * and obvious dummy credentials only (B13). Nothing here opens a socket.
 */
import { randomBytes } from "node:crypto";
import { createFakeDb } from "@vc/db/testing";
import { createAdminStore, type AdminRole, type AdminStore } from "@vc/db";
import type { GithubPort } from "@vc/engine";
import { hashPassword, signAdminToken } from "../src/admin-auth.js";
import { withAdminRoutes, type AdminPostgresPort, type AdminRoutesDeps } from "../src/admin-routes.js";
import { createMongoPartnerStore, type PartnerStore } from "../src/partners.js";
import { respond, type ApiHandler, type ApiRequest, type ApiResponse } from "../src/server.js";

export const T0 = Date.parse("2026-10-26T10:00:00.000Z");
export const PEPPER = "synthetic-pepper-".padEnd(40, "x");
export const JWT_SECRET_TEXT = "test-admin-jwt-secret-not-real-".padEnd(48, "j");
export const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_TEXT);
export const MASTER_KEY = randomBytes(32).toString("base64");
export const PASSWORD = "test-password-not-real-1";
export const ADMIN_EMAILS: Record<AdminRole, string> = { "super-admin": "super@vc.test", admin: "admin@vc.test", viewer: "viewer@vc.test" };

let cachedHash: Promise<string> | undefined;
/** One scrypt for the whole test file: every seeded user shares the same dummy password hash. */
export const passwordHash = (): Promise<string> => (cachedHash ??= hashPassword(PASSWORD));

type CallOpts = { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string };

export interface World {
  fakeDb: ReturnType<typeof createFakeDb>["fakeDb"];
  store: AdminStore;
  partnerStore: PartnerStore;
  clock: { ms: number };
  logs: Record<string, unknown>[];
  handler: ApiHandler;
  deps: AdminRoutesDeps;
  /** Signs a valid admin token for a seeded user (no login, so the limiter is untouched). */
  token(role: AdminRole): Promise<string>;
  req(method: string, path: string, opts?: CallOpts): ApiRequest;
  call(method: string, path: string, opts?: CallOpts): Promise<ApiResponse & { json: any }>;
  auditRows(): { at: string; actorId: string; action: string; target: string; ok: boolean }[];
  /** Every collection except audit_log, as one string: equal before and after means no side effect. */
  snapshot(): string;
}

export const COLLECTIONS = ["admin_users", "sources", "source_artifacts", "turn_usage", "partners"] as const;

export async function adminWorld(overrides: Partial<AdminRoutesDeps> = {}): Promise<World> {
  const { fakeDb, db } = createFakeDb();
  const store = createAdminStore(db, { masterKey: MASTER_KEY });
  const partnerStore = createMongoPartnerStore(db);
  const clock = { ms: T0 };
  const logs: Record<string, unknown>[] = [];
  const hash = await passwordHash();
  for (const role of ["super-admin", "admin", "viewer"] as const) await store.users.create({ email: ADMIN_EMAILS[role], passwordHash: hash, role });
  const deps: AdminRoutesDeps = {
    store,
    db,
    partnerStore,
    partnerCtx: { pepper: PEPPER, now: () => new Date(clock.ms) },
    jwtSecret: JWT_SECRET,
    nowMs: () => clock.ms,
    log: (l) => logs.push(l),
    defaultSiteId: "pathlynks",
    env: {},
    ...overrides,
  };
  const handler = withAdminRoutes(async () => respond(404, { error: "inner" }), deps);
  const req: World["req"] = (method, path, opts = {}) => {
    const raw = opts.raw ?? (opts.body === undefined ? "" : JSON.stringify(opts.body));
    return {
      method,
      url: path,
      headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.headers ?? {}) },
      readBody: async () => raw,
    };
  };
  return {
    fakeDb,
    store,
    partnerStore,
    clock,
    logs,
    handler,
    deps,
    token: async (role) => (await signAdminToken({ sub: ADMIN_EMAILS[role], role }, JWT_SECRET, clock.ms)).token,
    req,
    async call(method, path, opts) {
      const res = await handler(req(method, path, opts));
      let json: any;
      try {
        json = JSON.parse(res.body);
      } catch {
        json = undefined;
      }
      return Object.assign(res, { json });
    },
    auditRows: () => fakeDb.collection<{ _id: string; at: string; actorId: string; action: string; target: string; ok: boolean }>("audit_log").all(),
    snapshot: () => JSON.stringify(COLLECTIONS.map((n) => fakeDb.collection<{ _id: string }>(n).all())),
  };
}

export const ADMIN_PATH = "/admin/api/";

/** A fake GithubPort over an in-memory repo: path -> file text. Blob shas are the paths. Counts calls. */
export function fakeGithub(files: Record<string, string>, opts: { failWith?: Error } = {}): GithubPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async listTree(owner, repo, branch) {
      calls.push(`listTree ${owner}/${repo}@${branch}`);
      if (opts.failWith) throw opts.failWith;
      return Object.entries(files).map(([path, content]) => ({ path, type: "blob", sha: path, size: content.length }));
    },
    async getBlob(owner, repo, sha) {
      calls.push(`getBlob ${sha}`);
      if (opts.failWith) throw opts.failWith;
      return { content: files[sha] ?? "", encoding: "utf-8", size: (files[sha] ?? "").length };
    },
  };
}

export function fakePostgres(result: { ok: boolean; cause?: string }): AdminPostgresPort & { calls: { config: Record<string, unknown>; passwordGiven: boolean }[] } {
  const calls: { config: Record<string, unknown>; passwordGiven: boolean }[] = [];
  return {
    calls,
    async test(config, password) {
      calls.push({ config, passwordGiven: password !== undefined });
      return result;
    },
  };
}
