/**
 * pc-partner-keys (D-111; spec K1-K5): per-partner API keys for the VC API.
 *
 * New file, on purpose: this is genuinely new functionality (apps/api had JWT auth and one anonymous route, no partner registry). It owns
 *   - the `partners` collection of the virtual_counsellor database (one document per partner, `_id` = partnerId), and the add / rotate / revoke / list
 *     operations the CLI (apps/api/scripts/partner.ts) runs;
 *   - the key format `vck_<partnerId>_<43-char base64url>` and its storage: only HMAC-SHA256(key, VC_PARTNER_KEY_PEPPER) and a short prefix are
 *     kept. The raw key is returned once, by add and rotate, and is in no log, document or listing;
 *   - the in-process registry the routes ask ("whose key is this?"): one cached read of the whole partner list, at most 60 s old, so a revoke or a
 *     rotate takes effect on a running server within 60 s (clarified default 1; a freshly started server sees it at once);
 *   - `withPartnerRoutes`: the outermost wrapper of the HTTP handler. It answers CORS preflights and adds Access-Control-Allow-Origin to a keyed
 *     response, and serves GET /v1/partner/openapi.json.
 *
 * What is guaranteed here, and what is not:
 *  - A partner id is ^[a-z0-9-]{2,32}$ (no underscore), so a key splits on its first two underscores and the id is always a valid tenant id.
 *  - A key is checked by comparing HMACs with timingSafeEqual; an unknown id, a revoked partner and a wrong secret cost the same work and give the
 *    same answer (undefined). The caller maps every one of them to one 401.
 *  - CORS is decided per key, never by nginx and never `*`. A browser preflight carries no key, so it is granted when the Origin is in the list of ANY
 *    active partner; the real request is granted only when ITS key is active and the Origin is in THAT key's list. Only the public chat route, the voice
 *    session route and the partner openapi route take part; no other route is ever granted CORS.
 *  - The raw partner key is a bearer secret. A key put in a public web page (the widget's key mode) is public by construction; the same key also
 *    authenticates the server-to-server student routes (K3). That is the "one simple key per partner" of D-111, and it is listed as an open risk.
 *  - The store is the only thing this module writes, and only from the CLI. The request path only reads.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { anonymousCountersCollection } from "@vc/db";
import { PATH_ID_PATTERN, respond, type ApiHandler, type ApiRequest, type ApiResponse } from "./server.js";
import { PARTNER_OPENAPI } from "./openapi.js";

type VcDb = Parameters<typeof anonymousCountersCollection>[0];

/** The environment names (B11: values live only in .env). */
export const PARTNER_PEPPER_ENV = "VC_PARTNER_KEY_PEPPER";
export const PARTNER_KEY_REQUIRED_ENV = "VC_PARTNER_KEY_REQUIRED";
/** The request header a widget or an anonymous caller sends its key in. */
export const PARTNER_KEY_HEADER = "x-vc-key";
export const STUDENT_ID_HEADER = "x-vc-student-id";
export const STUDENT_AGE_HEADER = "x-vc-student-age";
export const GUARDIAN_CONSENT_HEADER = "x-vc-guardian-consent";

export const PARTNER_ID_PATTERN = /^[a-z0-9-]{2,32}$/;
export const PARTNER_KEY_PREFIX = "vck_";
const SECRET_LENGTH = 43; // base64url of 32 random bytes
const PARTNER_KEY_PATTERN = new RegExp(`^vck_([a-z0-9-]{2,32})_([A-Za-z0-9_-]{${SECRET_LENGTH}})$`);
/** How many characters of the secret are kept, with `vck_<id>_`, as the listing prefix. */
const PREFIX_SECRET_CHARS = 4;
export const MIN_PEPPER_LENGTH = 32;
/** A cached partner list is never older than this (K2: a revoke takes effect within 60 s). */
export const PARTNER_CACHE_TTL_MS = 60_000;
export const PARTNER_COLLECTION = "partners";
export const PARTNER_PREFLIGHT_MAX_AGE_SEC = 600;

export type PartnerErrorCode =
  | "usage"
  | "invalid_partner_id"
  | "invalid_origin"
  | "partner_exists"
  | "partner_not_found"
  | "partner_revoked";

/** A refusal of an ops command. The message never holds a key or a hash. */
export class PartnerError extends Error {
  constructor(
    readonly code: PartnerErrorCode,
    message: string,
  ) {
    super(`PartnerError: ${message}`);
    this.name = "PartnerError";
  }
}

/** A misconfigured pepper or flag: thrown at startup, naming the variable and never its value. */
export class PartnerConfigError extends Error {
  constructor(message: string) {
    super(`PartnerConfigError: ${message}`);
    this.name = "PartnerConfigError";
  }
}

/** The partner store could not be read. The routes answer 503 (fail closed) and never say why. */
export class PartnerRegistryUnavailableError extends Error {
  constructor() {
    super("PartnerRegistryUnavailableError: the partner registry could not be read");
    this.name = "PartnerRegistryUnavailableError";
  }
}

export interface PartnerDoc {
  _id: string;
  partnerId: string;
  name: string;
  /** HMAC-SHA256(key, pepper), hex. */
  keyHash: string;
  /** `vck_<partnerId>_` plus the first characters of the secret: enough to tell keys apart in a listing, useless as a credential. */
  keyPrefix: string;
  allowedOrigins: string[];
  status: "active" | "revoked";
  createdAt: string;
  rotatedAt: string | null;
}

/** What a listing and a command result show: a partner without its hash. */
export type PartnerSummary = Omit<PartnerDoc, "_id" | "keyHash">;

export interface PartnerStore {
  get(partnerId: string): Promise<PartnerDoc | null>;
  list(): Promise<PartnerDoc[]>;
  /** Rejects with code 11000 (or PartnerError partner_exists) when the id is taken. */
  insert(doc: PartnerDoc): Promise<void>;
  /** Merges `patch` into the partner; resolves false when there is no such partner. */
  update(partnerId: string, patch: Partial<Omit<PartnerDoc, "_id" | "partnerId">>): Promise<boolean>;
}

/** The slice of the driver's collection this module uses (the fake Db satisfies it too). */
interface PartnerCollection {
  findOne(filter: { _id: string }): Promise<PartnerDoc | null>;
  find(filter: Record<string, never>): { toArray(): Promise<PartnerDoc[]> };
  insertOne(doc: PartnerDoc): Promise<unknown>;
  updateOne(filter: { _id: string }, update: { $set: Record<string, unknown> }): Promise<{ matchedCount: number }>;
}

/** The Mongo-backed store over the `partners` collection of the virtual_counsellor Db (the one database this repo may write, B12). */
export function createMongoPartnerStore(db: VcDb): PartnerStore {
  const partners = db.collection<PartnerDoc>("partners") as unknown as PartnerCollection;
  return {
    get: (partnerId) => partners.findOne({ _id: partnerId }),
    list: async () => (await partners.find({}).toArray()).sort((a, b) => (a.partnerId < b.partnerId ? -1 : a.partnerId > b.partnerId ? 1 : 0)),
    insert: async (doc) => {
      try {
        await partners.insertOne(doc);
      } catch (err) {
        if ((err as { code?: unknown } | null)?.code === 11000) throw new PartnerError("partner_exists", `partner "${doc.partnerId}" already exists`);
        throw err;
      }
    },
    update: async (partnerId, patch) => (await partners.updateOne({ _id: partnerId }, { $set: patch })).matchedCount > 0,
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** The pepper, or undefined when unset or blank. A set pepper shorter than MIN_PEPPER_LENGTH is a config error (the value is never echoed). */
export function partnerPepperFromEnv(env: Record<string, string | undefined>): string | undefined {
  const raw = env[PARTNER_PEPPER_ENV];
  if (raw === undefined || raw.trim() === "") return undefined;
  if (raw.length < MIN_PEPPER_LENGTH) throw new PartnerConfigError(`${PARTNER_PEPPER_ENV} must be at least ${MIN_PEPPER_LENGTH} characters`);
  return raw;
}

/** Reads the flag: unset, empty and "false" are off; exactly "true" is on; anything else is a config error (never a silent on or off). */
export function partnerKeyRequiredFromEnv(env: Record<string, string | undefined>): boolean {
  const raw = env[PARTNER_KEY_REQUIRED_ENV]?.trim();
  if (raw === undefined || raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  throw new PartnerConfigError(`${PARTNER_KEY_REQUIRED_ENV} must be "true" or "false" (got a different value)`);
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** The partner id and secret of a well-formed key, or undefined. A key splits on its first two underscores; an id has none. */
export function parsePartnerKey(key: string): { partnerId: string; secret: string } | undefined {
  const m = PARTNER_KEY_PATTERN.exec(key);
  return m ? { partnerId: m[1]!, secret: m[2]! } : undefined;
}

/** HMAC-SHA256(key, pepper) as hex: the only form of a key that is ever stored. */
export function hashPartnerKey(key: string, pepper: string): string {
  return createHmac("sha256", pepper).update(key).digest("hex");
}

function newKey(partnerId: string, random: (n: number) => Buffer): { key: string; keyPrefix: string } {
  const secret = random(32).toString("base64url");
  const head = `${PARTNER_KEY_PREFIX}${partnerId}_`;
  return { key: `${head}${secret}`, keyPrefix: `${head}${secret.slice(0, PREFIX_SECRET_CHARS)}` };
}

const summaryOf = (doc: PartnerDoc): PartnerSummary => ({
  partnerId: doc.partnerId,
  name: doc.name,
  keyPrefix: doc.keyPrefix,
  allowedOrigins: [...doc.allowedOrigins],
  status: doc.status,
  createdAt: doc.createdAt,
  rotatedAt: doc.rotatedAt,
});

/**
 * One allowed origin: https://host[:port], or http on localhost / 127.0.0.1 for development. No path, query, credentials or wildcard; the
 * result is the URL's own normalised origin (lower-case host, no trailing slash).
 */
export function normalizeOrigin(raw: string): string {
  const bad = () => new PartnerError("invalid_origin", `"${raw.slice(0, 80)}" is not an allowed origin (use https://host[:port], or http://localhost[:port] for development; no path, wildcard or credentials)`);
  if (typeof raw !== "string" || raw === "" || raw.includes("*")) throw bad();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw bad();
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!(url.protocol === "https:" || (url.protocol === "http:" && local))) throw bad();
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || (url.pathname !== "/" && url.pathname !== "") || url.origin === "null") throw bad();
  return url.origin;
}

function normalizeOrigins(origins: readonly string[]): string[] {
  return [...new Set(origins.map(normalizeOrigin))];
}

function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

export interface PartnerOpContext {
  pepper: string;
  now?: () => Date;
  /** Tests only; default crypto.randomBytes. */
  randomBytes?: (n: number) => Buffer;
}

function requirePepper(ctx: PartnerOpContext): void {
  if (typeof ctx.pepper !== "string" || ctx.pepper.length < MIN_PEPPER_LENGTH) throw new PartnerConfigError(`${PARTNER_PEPPER_ENV} must be at least ${MIN_PEPPER_LENGTH} characters`);
}

/** Adds a partner and returns its raw key. The key is shown to the caller once; only its HMAC and a prefix are stored. */
export async function addPartner(
  store: PartnerStore,
  input: { name: string; origins?: readonly string[]; id?: string },
  ctx: PartnerOpContext,
): Promise<{ partner: PartnerSummary; key: string }> {
  requirePepper(ctx);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "" || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new PartnerError("usage", "a partner needs a name of 1 to 120 printable characters");
  const partnerId = input.id ?? slugOf(name);
  if (!PARTNER_ID_PATTERN.test(partnerId) || !PATH_ID_PATTERN.test(partnerId)) {
    throw new PartnerError("invalid_partner_id", `the partner id must match ${PARTNER_ID_PATTERN.source} (lower-case letters, digits and hyphens); pass --id to choose one`);
  }
  const allowedOrigins = normalizeOrigins(input.origins ?? []);
  if (await store.get(partnerId)) throw new PartnerError("partner_exists", `partner "${partnerId}" already exists (rotate its key, or choose another id)`);
  const { key, keyPrefix } = newKey(partnerId, ctx.randomBytes ?? randomBytes);
  const doc: PartnerDoc = {
    _id: partnerId,
    partnerId,
    name,
    keyHash: hashPartnerKey(key, ctx.pepper),
    keyPrefix,
    allowedOrigins,
    status: "active",
    createdAt: (ctx.now?.() ?? new Date()).toISOString(),
    rotatedAt: null,
  };
  await store.insert(doc);
  return { partner: summaryOf(doc), key };
}

/** Replaces an active partner's key. The old hash is gone from the store at once. */
export async function rotatePartner(store: PartnerStore, partnerId: string, ctx: PartnerOpContext): Promise<{ partner: PartnerSummary; key: string }> {
  requirePepper(ctx);
  const existing = await store.get(partnerId);
  if (!existing) throw new PartnerError("partner_not_found", `no partner "${partnerId}"`);
  if (existing.status === "revoked") throw new PartnerError("partner_revoked", `partner "${partnerId}" is revoked; add a new partner instead of rotating`);
  const { key, keyPrefix } = newKey(partnerId, ctx.randomBytes ?? randomBytes);
  const rotatedAt = (ctx.now?.() ?? new Date()).toISOString();
  const keyHash = hashPartnerKey(key, ctx.pepper);
  if (!(await store.update(partnerId, { keyHash, keyPrefix, rotatedAt }))) throw new PartnerError("partner_not_found", `no partner "${partnerId}"`);
  return { partner: summaryOf({ ...existing, keyHash, keyPrefix, rotatedAt }), key };
}

/** Revokes a partner (idempotent). Its key stops working on a running server within PARTNER_CACHE_TTL_MS. */
export async function revokePartner(store: PartnerStore, partnerId: string): Promise<PartnerSummary> {
  const existing = await store.get(partnerId);
  if (!existing) throw new PartnerError("partner_not_found", `no partner "${partnerId}"`);
  if (existing.status !== "revoked") await store.update(partnerId, { status: "revoked" });
  return summaryOf({ ...existing, status: "revoked" });
}

export async function listPartners(store: PartnerStore): Promise<PartnerSummary[]> {
  return (await store.list()).map(summaryOf);
}

// ---------------------------------------------------------------------------
// The CLI (the script wires the environment and the database; everything else is here so it is tested)
// ---------------------------------------------------------------------------

export const PARTNER_USAGE = [
  "usage:",
  "  partner add <name> [--id <partner-id>] [--origin <https://site>]...   register a partner; prints its key once",
  "  partner rotate <partner-id>                                          new key (printed once); the old key stops working",
  "  partner revoke <partner-id>                                          the key stops working (within 60 s on a running server)",
  "  partner list                                                         partners, status and key prefix (never a key)",
];

const usageError = (extra?: string) => new PartnerError("usage", [...(extra ? [extra] : []), ...PARTNER_USAGE].join("\n"));

function row(p: PartnerSummary): string {
  return `${p.partnerId}  ${p.status}  ${p.keyPrefix}...  origins: ${p.allowedOrigins.length > 0 ? p.allowedOrigins.join(", ") : "(none)"}  name: ${p.name}`;
}

/** Runs one CLI command and returns the lines to print. Throws PartnerError (code "usage" for a bad command line). */
export async function runPartnerCli(argv: readonly string[], deps: { store: PartnerStore } & PartnerOpContext): Promise<string[]> {
  const [command, ...rest] = argv;
  switch (command) {
    case "add": {
      const positional: string[] = [];
      const origins: string[] = [];
      let id: string | undefined;
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "--origin" || a === "--id") {
          const v = rest[++i];
          if (v === undefined) throw usageError(`${a} needs a value`);
          if (a === "--origin") origins.push(v);
          else id = v;
        } else if (a.startsWith("--")) throw usageError(`unknown option ${a}`);
        else positional.push(a);
      }
      if (positional.length !== 1) throw usageError("add needs exactly one <name>");
      const { partner, key } = await addPartner(deps.store, { name: positional[0]!, origins, ...(id !== undefined ? { id } : {}) }, deps);
      return [`added ${row(partner)}`, `key: ${key}`, "This key is shown once and is not stored. Copy it now; to replace it run: partner rotate " + partner.partnerId];
    }
    case "rotate": {
      if (rest.length !== 1) throw usageError("rotate needs exactly one <partner-id>");
      const { partner, key } = await rotatePartner(deps.store, rest[0]!, deps);
      return [`rotated ${row(partner)}`, `key: ${key}`, "This key is shown once and is not stored. The old key stops working (within 60 s on a running server)."];
    }
    case "revoke": {
      if (rest.length !== 1) throw usageError("revoke needs exactly one <partner-id>");
      return [`revoked ${row(await revokePartner(deps.store, rest[0]!))}`];
    }
    case "list": {
      if (rest.length !== 0) throw usageError("list takes no arguments");
      const rows = await listPartners(deps.store);
      return rows.length === 0 ? ["(no partners)"] : rows.map(row);
    }
    default:
      throw usageError(command === undefined ? undefined : `unknown command ${command}`);
  }
}

// ---------------------------------------------------------------------------
// The registry (request path: read only)
// ---------------------------------------------------------------------------

/** Who a verified key belongs to. */
export interface PartnerIdentity {
  partnerId: string;
  name: string;
  allowedOrigins: readonly string[];
}

export interface PartnerRegistry {
  /** The partner a key belongs to, or undefined (malformed, unknown, revoked and wrong-secret are indistinguishable). Rejects with PartnerRegistryUnavailableError when the store cannot be read. */
  authenticate(key: string): Promise<PartnerIdentity | undefined>;
  /** True when `origin` is in the allowed list of at least one active partner (a preflight carries no key). */
  originAllowedByAnyPartner(origin: string): Promise<boolean>;
  /** Counts one answered turn for a partner (in memory, text-free). */
  noteTurn(partnerId: string): void;
  /** Turns answered per partner since this process started. */
  usage(): ReadonlyMap<string, { turns: number }>;
}

export interface PartnerRegistryOptions {
  store: PartnerStore;
  pepper: string;
  nowMs?: () => number;
  /** At most PARTNER_CACHE_TTL_MS. */
  ttlMs?: number;
}

const DUMMY_HASH = Buffer.alloc(32);

export function createPartnerRegistry(options: PartnerRegistryOptions): PartnerRegistry {
  if (typeof options.pepper !== "string" || options.pepper.length < MIN_PEPPER_LENGTH) throw new PartnerConfigError(`${PARTNER_PEPPER_ENV} must be at least ${MIN_PEPPER_LENGTH} characters`);
  const nowMs = options.nowMs ?? Date.now;
  const ttlMs = Math.min(options.ttlMs ?? PARTNER_CACHE_TTL_MS, PARTNER_CACHE_TTL_MS);
  const pepper = options.pepper;
  const turns = new Map<string, { turns: number }>();
  let snapshot: { at: number; byId: Map<string, PartnerDoc> } | undefined;
  let inflight: Promise<Map<string, PartnerDoc>> | undefined;

  async function partners(): Promise<Map<string, PartnerDoc>> {
    if (snapshot && nowMs() - snapshot.at < ttlMs && nowMs() >= snapshot.at) return snapshot.byId;
    // One read serves every concurrent caller; a flood of random ids costs one read per window, not one per request.
    inflight ??= (async () => {
      try {
        const at = nowMs();
        const docs = await options.store.list();
        const byId = new Map(docs.map((d) => [d.partnerId, d]));
        snapshot = { at, byId };
        return byId;
      } catch {
        snapshot = undefined; // never serve a stale list past its window (fail closed)
        throw new PartnerRegistryUnavailableError();
      } finally {
        inflight = undefined;
      }
    })();
    return inflight;
  }

  return {
    async authenticate(key) {
      const parsed = typeof key === "string" ? parsePartnerKey(key) : undefined;
      if (!parsed) return undefined;
      const doc = (await partners()).get(parsed.partnerId);
      // The same work whether or not the partner exists: one HMAC and one constant-time compare.
      const presented = createHmac("sha256", pepper).update(key).digest();
      const stored = doc && /^[0-9a-f]{64}$/.test(doc.keyHash) ? Buffer.from(doc.keyHash, "hex") : DUMMY_HASH;
      const equal = timingSafeEqual(presented, stored);
      if (!doc || !equal || doc.status !== "active") return undefined;
      return { partnerId: doc.partnerId, name: doc.name, allowedOrigins: [...doc.allowedOrigins] };
    },
    async originAllowedByAnyPartner(origin) {
      for (const doc of (await partners()).values()) if (doc.status === "active" && doc.allowedOrigins.includes(origin)) return true;
      return false;
    },
    noteTurn(partnerId) {
      const entry = turns.get(partnerId);
      if (entry) entry.turns += 1;
      else turns.set(partnerId, { turns: 1 });
    },
    usage: () => turns,
  };
}

// ---------------------------------------------------------------------------
// Reading a key and a student off a request
// ---------------------------------------------------------------------------

/** One header's single string value, or undefined when it is absent. A repeated header is `null` (never a value a proxy sets). */
export function singleHeader(headers: ApiRequest["headers"], name: string): string | undefined | null {
  const value = headers[name];
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

export type PartnerKeyInput = { kind: "none" } | { kind: "key"; key: string } | { kind: "malformed" };

/** The key a request carries in X-VC-Key. A present but empty, blank or repeated header is "malformed" (never "none"). */
export function partnerKeyFromRequest(req: Pick<ApiRequest, "headers">): PartnerKeyInput {
  const value = singleHeader(req.headers, PARTNER_KEY_HEADER);
  if (value === undefined) return { kind: "none" };
  if (value === null) return { kind: "malformed" };
  const key = value.trim();
  return key === "" ? { kind: "malformed" } : { kind: "key", key };
}

/** A bearer token that is a partner key (never a JWT: a compact JWS starts with "eyJ"). */
export const isPartnerKeyToken = (token: string): boolean => token.startsWith(PARTNER_KEY_PREFIX);

export type PartnerStudentHeaders = { ok: true; studentId: string; minor: boolean; guardianConsent: boolean } | { ok: false };

/**
 * K3: the student a partner's backend vouches for, from X-VC-Student-Id / -Age / X-VC-Guardian-Consent. The id must be a valid path id. The age is
 * a whole number 0 to 120; a missing or invalid age is a minor (fail closed), and guardian consent counts only when the header is exactly "true".
 */
export function partnerStudentFromHeaders(headers: ApiRequest["headers"]): PartnerStudentHeaders {
  const id = singleHeader(headers, STUDENT_ID_HEADER);
  if (typeof id !== "string" || !PATH_ID_PATTERN.test(id)) return { ok: false };
  const ageRaw = singleHeader(headers, STUDENT_AGE_HEADER);
  const age = typeof ageRaw === "string" && /^[0-9]{1,3}$/.test(ageRaw) ? Number(ageRaw) : undefined;
  const adult = age !== undefined && age >= 18 && age <= 120;
  const consent = singleHeader(headers, GUARDIAN_CONSENT_HEADER) === "true";
  return { ok: true, studentId: id, minor: !adult, guardianConsent: consent };
}

// ---------------------------------------------------------------------------
// CORS and the partner OpenAPI route
// ---------------------------------------------------------------------------

export const PARTNER_OPENAPI_PATH = "/v1/partner/openapi.json";
const ANONYMOUS_CHAT_PATH = "/v1/public/chat/turns";
const VOICE_SESSION_PATH = /^\/v1\/students\/[^/]+\/chat\/threads\/[^/]+\/voice\/sessions$/;
const CORS_METHODS = "POST,GET,OPTIONS";
const CORS_HEADERS = "Content-Type,X-VC-Key,Authorization";

/** The routes that take part in CORS: the public chat route, the voice session route and the partner openapi route. */
export function isCorsEligiblePath(pathname: string): boolean {
  return pathname === ANONYMOUS_CHAT_PATH || pathname === PARTNER_OPENAPI_PATH || VOICE_SESSION_PATH.test(pathname);
}

function pathOf(req: Pick<ApiRequest, "url">): string | undefined {
  try {
    return new URL(req.url, "http://vc-api.invalid").pathname;
  } catch {
    return undefined;
  }
}

function withHeaders(res: ApiResponse, extra: Record<string, string>): ApiResponse {
  return { ...res, headers: { ...res.headers, ...extra } };
}

/** The key a CORS decision is made from: X-VC-Key, else a `Bearer vck_...` token. */
function keyForCors(req: ApiRequest): string | undefined {
  const k = partnerKeyFromRequest(req);
  if (k.kind === "key") return k.key;
  const auth = singleHeader(req.headers, "authorization");
  const m = typeof auth === "string" ? /^Bearer +(vck_[^\s]+)\s*$/i.exec(auth) : null;
  return m ? m[1] : undefined;
}

/**
 * Wraps the whole handler (outermost). With a registry it answers preflights and adds Access-Control-Allow-Origin to a keyed response; without
 * one nothing is ever granted CORS. In both cases it serves GET /v1/partner/openapi.json. It never swallows an error from the inner handler, and a
 * registry that cannot be read only means no CORS header (the inner handler still answers).
 */
export function withPartnerRoutes(inner: ApiHandler, registry: PartnerRegistry | undefined): ApiHandler {
  return async (req) => {
    const pathname = pathOf(req);
    const method = req.method.toUpperCase();
    if (pathname === undefined || !isCorsEligiblePath(pathname)) return inner(req);

    if (method === "OPTIONS") {
      const origin = singleHeader(req.headers, "origin");
      const base = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
      let allowed = false;
      if (registry && typeof origin === "string" && origin !== "") {
        try {
          allowed = await registry.originAllowedByAnyPartner(origin);
        } catch {
          allowed = false;
        }
      }
      return {
        status: 204,
        headers: allowed
          ? {
              ...base,
              "access-control-allow-origin": origin as string,
              vary: "Origin",
              "access-control-allow-methods": CORS_METHODS,
              "access-control-allow-headers": CORS_HEADERS,
              "access-control-max-age": String(PARTNER_PREFLIGHT_MAX_AGE_SEC),
            }
          : base,
        body: "",
      };
    }

    let res: ApiResponse;
    if (pathname === PARTNER_OPENAPI_PATH) {
      res = method === "GET" ? respond(200, PARTNER_OPENAPI) : respond(405, { error: "method_not_allowed" }, { allow: "GET, OPTIONS" });
    } else {
      res = await inner(req);
    }

    const origin = singleHeader(req.headers, "origin");
    const key = registry && typeof origin === "string" && origin !== "" ? keyForCors(req) : undefined;
    if (registry && key !== undefined) {
      try {
        const partner = await registry.authenticate(key);
        if (partner && partner.allowedOrigins.includes(origin as string)) {
          return withHeaders(res, { "access-control-allow-origin": origin as string, vary: "Origin", "access-control-expose-headers": "Retry-After" });
        }
      } catch {
        // an unreadable registry grants nothing; the response itself stands
      }
    }
    return res;
  };
}
