/**
 * pc-partner-keys (D-111; spec K1-K5): per-partner API keys for the VC API.
 *
 * New file, on purpose: this is genuinely new functionality (apps/api had JWT auth and one anonymous route, no partner registry). It owns
 *   - the `partners` collection of the virtual_counsellor database (one document per partner, `_id` = partnerId), and the add / rotate / revoke / list
 *     operations the CLI (apps/api/scripts/partner.ts) runs;
 *   - the key format and its storage. Every partner has TWO keys with scopes: a PAGE key `vck_pub_<partnerId>_<43-char base64url>` (sits in public HTML;
 *     opens only the public chat route, and from a browser only for the partner's own origins) and a SERVER key `vck_srv_<partnerId>_<43-char base64url>`
 *     (stays on the partner's backend; opens only the student chat routes, never gets CORS). A key used outside its scope is the same uniform 401 as any bad key.
 *     Only HMAC-SHA256(key, VC_PARTNER_KEY_PEPPER) and a short prefix are kept, per scope. A raw key is returned once, by add and rotate, and is in no log,
 *     document or listing;
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
 *    active partner; the real request is granted only when ITS key is active and the Origin is in THAT key's list. Only the public chat route and the partner openapi
 *    route take part (a later anonymous voice route, pc-voice, joins them); no other route is ever granted CORS, and the student voice routes never do.
 *  - A page key is public by construction (it is in the page source), so it can open nothing but the anonymous public chat route, which anyone can already
 *    call; it can never read or write a student. The server key is the only credential for student data.
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
/**
 * A partner id becomes the tenant id of every record its server key writes (K3), so it must never equal a tenant that already exists. The tenants of the
 * Vidysea JWT path are claims inside signed tokens, not a list in the server config, so they cannot be read here; this module refuses the sandbox tenant id and
 * a short reserved list of names that look like a platform tenant (each name alone, and each name + separator + suffix such as `sandbox-1`), the tenants this repo
 * itself writes under, and the operator-listed VC_RESERVED_TENANT_IDS plus the sandbox tenant id of startApi (`PartnerOpContext.reservedIds` for add,
 * `PartnerRegistryOptions.reservedIds` for every request, so a partner record made earlier or a tenant configured later is refused at request time too).
 */
export const RESERVED_PARTNER_IDS: readonly string[] = ["sandbox", "admin", "system", "root", "default", "internal"];
/** The tenants this repo itself writes under (apps/web/demo/seed.ts `vc-synthetic-demo`, packages/engine/evals/score.ts `scribe-evaluation`): refused as an exact id. */
export const KNOWN_TENANT_IDS: readonly string[] = ["vc-synthetic-demo", "scribe-evaluation"];
/**
 * The configured tenant ids that cannot be read from anywhere else (pc-reserved-ids, ISS-pc-partner-keys-1): a comma- or space-separated list of the tenant ids the
 * Vidysea JWT path and the sandbox use (`tenant` claims are inside signed tokens, so only the operator knows them). The CLI and the running server both read it.
 */
export const RESERVED_TENANT_IDS_ENV = "VC_RESERVED_TENANT_IDS";
/** A tenant id as @vc/db accepts it (TENANT_ID_PATTERN): the list is validated with the same shape, so a typo fails closed instead of silently reserving nothing. */
const CONFIGURED_TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** The one fold every reserved-id comparison uses (NFKC, lower-case): isReservedPartnerId, the env parsers and startApi's sandbox guard (pc-hardening H4). */
export const foldId = (id: string): string => id.normalize("NFKC").toLowerCase();

/**
 * True when `id` is, or looks like, a tenant that already exists: equal to a built-in reserved name followed by nothing or by a separator (any non-letter,
 * non-digit) and a suffix (`sandbox`, `sandbox-1`, `admin_2`, `root.x`), to a tenant this repo writes under, or to one of the `extra` configured tenant ids.
 * Case and width are folded (NFKC, lower-case), so `SANDBOX` and a full-width `ｓandbox` count. A name that merely starts with the same letters (`sandboxed`) does not.
 * Only the built-in names have a name+separator+suffix family: a configured tenant (`extra`) matches by its exact folded id, so listing `pathlynks` does not refuse
 * `pathlynks-2` (that partner reaches only its own tenant `pathlynks-2`; pc-hardening H6, ISS-pc-reserved-ids-9).
 */
export function isReservedPartnerId(id: string, extra: readonly string[] = [], ownTenants: readonly string[] = []): boolean {
  return reservedPartnerIdReason(id, extra, ownTenants) !== undefined;
}

/** Why an id is reserved: a built-in name or family, a tenant this repo writes under, or an operator-configured tenant (pc-hardening H5, the reason `partner list` prints). */
export type ReservedIdReason = "builtin" | "repo" | "configured";

export function reservedPartnerIdReason(id: string, extra: readonly string[] = [], ownTenants: readonly string[] = []): ReservedIdReason | undefined {
  const f = foldId(id);
  // Never exemptable (pc-reserved-ids-2 S2): the built-in names and their families, and the tenants this repo writes under.
  if (KNOWN_TENANT_IDS.includes(f)) return "repo";
  if (RESERVED_PARTNER_IDS.some((name) => f === name || (f.startsWith(name) && /^[^a-z0-9]/.test(f.slice(name.length))))) return "builtin";
  // A configured tenant id: entries are trimmed and folded like the env parser's (S4); a blank entry reserves nothing. The ONE exemption is an explicit operator binding
  // (`ownTenants`), matched against the EXACT partner id: a partner reaches only the tenant named by its own id (chat.ts:855), so binding `pathlynks` frees that
  // partner and nothing else, and a differently cased or full-width look-alike of it stays refused.
  if (extra.some((e) => {
    const t = foldId(e.trim());
    return t !== "" && t === f;
  })) return ownTenants.some((o) => o.trim() === id) ? undefined : "configured";
  return undefined;
}

/** The configured tenant ids from VC_RESERVED_TENANT_IDS (empty when unset). A malformed entry is a config error naming the variable, never a silent skip. */
export function reservedTenantIdsFromEnv(env: Record<string, string | undefined>): string[] {
  const raw = env[RESERVED_TENANT_IDS_ENV];
  if (raw === undefined || raw.trim() === "") return [];
  const ids = raw.split(/[\s,]+/).filter((s) => s !== "");
  if (ids.some((s) => !CONFIGURED_TENANT_ID_PATTERN.test(s))) {
    throw new PartnerConfigError(`${RESERVED_TENANT_IDS_ENV} must be a comma- or space-separated list of tenant ids (1-64 characters of letters, digits, "_" and "-")`);
  }
  return [...new Set(ids)];
}

/**
 * The explicit binding of a partner to its OWN tenant (pc-reserved-ids-2 S2, ISS-pc-reserved-ids-2): a comma- or space-separated list of `<partner>:<tenant>`. A partner id IS
 * the tenant of everything its server key reaches (chat.ts:855, voice.ts:1712; there is no separate tenant field), so a partner can only ever be bound to the tenant of its
 * own id and the two halves must be equal. The list frees exactly those partners from the VC_RESERVED_TENANT_IDS check (so `pathlynks` can be listed as a real JWT tenant
 * and still be a partner); it can never free a built-in reserved name or a tenant this repo writes under.
 */
export const PARTNER_OWN_TENANTS_ENV = "VC_PARTNER_OWN_TENANTS";
const OWN_TENANT_ENTRY_PATTERN = /^([a-z0-9-]{2,32}):([A-Za-z0-9][A-Za-z0-9_-]{0,63})$/;

/** The partner ids bound to their own tenant by VC_PARTNER_OWN_TENANTS (empty when unset). A malformed entry is a config error naming the variable, never a silent skip. */
export function partnerOwnTenantsFromEnv(env: Record<string, string | undefined>): string[] {
  const raw = env[PARTNER_OWN_TENANTS_ENV];
  if (raw === undefined || raw.trim() === "") return [];
  const ids: string[] = [];
  for (const entry of raw.split(/[\s,]+/).filter((s) => s !== "")) {
    const m = OWN_TENANT_ENTRY_PATTERN.exec(entry);
    if (!m || m[1] !== m[2]) {
      throw new PartnerConfigError(`${PARTNER_OWN_TENANTS_ENV} entries must be <partner>:<tenant> with both halves the same id (a partner reaches only the tenant named by its own id)`);
    }
    if (isReservedPartnerId(m[1]!)) {
      throw new PartnerConfigError(`${PARTNER_OWN_TENANTS_ENV} cannot bind a built-in reserved name or a tenant this repo writes under`);
    }
    ids.push(m[1]!);
  }
  return [...new Set(ids)];
}

/** What `partner add` / `partner list` (stderr) and startApi (log) say when VC_RESERVED_TENANT_IDS is empty (pc-reserved-ids-2 S1). */
export function reservedTenantIdsWarning(): string {
  return `${RESERVED_TENANT_IDS_ENV} is empty or unset: only the built-in reserved names, this repo's own tenants and the sandbox tenant are protected, so the real student-JWT tenants are unprotected (a partner id equal to one of them would be accepted and its server key would reach that tenant's students). List every "tenant" your student JWTs carry in ${RESERVED_TENANT_IDS_ENV}.`;
}
export const PARTNER_KEY_PREFIX = "vck_";
/** pub = the page key (public chat route only); srv = the server key (student routes only). */
export type KeyScope = "pub" | "srv";
export const KEY_SCOPES: readonly KeyScope[] = ["pub", "srv"];
const SECRET_LENGTH = 43; // base64url of 32 random bytes
const PARTNER_KEY_PATTERN = new RegExp(`^vck_(pub|srv)_([a-z0-9-]{2,32})_([A-Za-z0-9_-]{${SECRET_LENGTH}})$`);
/** How many characters of the secret are kept, with `vck_<id>_`, as the listing prefix. */
const PREFIX_SECRET_CHARS = 4;
export const MIN_PEPPER_LENGTH = 32;
/** A cached partner list is never older than this (K2: a revoke takes effect within 60 s). */
export const PARTNER_CACHE_TTL_MS = 60_000;
export const PARTNER_COLLECTION = "partners";
export const PARTNER_PREFLIGHT_MAX_AGE_SEC = 600;

export type PartnerErrorCode =
  | "usage"
  | "reserved_ids"
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

/** One scope's stored key: only the HMAC and a prefix, never the key. */
export interface PartnerKeyRecord {
  /** HMAC-SHA256(key, pepper), hex. */
  hash: string;
  /** `vck_<scope>_<partnerId>_` plus the first characters of the secret: enough to tell keys apart in a listing, useless as a credential. */
  prefix: string;
  rotatedAt: string | null;
}

export interface PartnerDoc {
  _id: string;
  partnerId: string;
  name: string;
  keys: Record<KeyScope, PartnerKeyRecord>;
  allowedOrigins: string[];
  status: "active" | "revoked";
  createdAt: string;
}

/** What a listing and a command result show: a partner without its hashes. */
export interface PartnerSummary {
  partnerId: string;
  name: string;
  keys: Record<KeyScope, { prefix: string; rotatedAt: string | null }>;
  allowedOrigins: string[];
  status: "active" | "revoked";
  createdAt: string;
}

export interface PartnerStore {
  get(partnerId: string): Promise<PartnerDoc | null>;
  list(): Promise<PartnerDoc[]>;
  /** Rejects with code 11000 (or PartnerError partner_exists) when the id is taken. */
  insert(doc: PartnerDoc): Promise<void>;
  /**
   * Merges `patch` into the partner; resolves false when there is no such partner. A key record is written by its dotted path (`"keys.pub"`,
   * `"keys.srv"`), never as the whole `keys` object, so two writers of different scopes cannot overwrite each other (fix cycle 1, K1).
   */
  update(partnerId: string, patch: PartnerPatch): Promise<boolean>;
}

/** What `update` may write: any top-level field except the ids and the whole `keys` object, plus ONE scope's key record by dotted path. */
export type PartnerPatch = Partial<Omit<PartnerDoc, "_id" | "partnerId" | "keys">> & Partial<Record<`keys.${KeyScope}`, PartnerKeyRecord>>;

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

/** The partner id and secret of a well-formed key, or undefined. A key splits on its first three underscores; an id has none. */
export function parsePartnerKey(key: string): { scope: KeyScope; partnerId: string; secret: string } | undefined {
  const m = PARTNER_KEY_PATTERN.exec(key);
  return m ? { scope: m[1] as KeyScope, partnerId: m[2]!, secret: m[3]! } : undefined;
}

/** HMAC-SHA256(key, pepper) as hex: the only form of a key that is ever stored. */
export function hashPartnerKey(key: string, pepper: string): string {
  return createHmac("sha256", pepper).update(key).digest("hex");
}

function newKey(scope: KeyScope, partnerId: string, ctx: PartnerOpContext, at: string): { key: string; record: PartnerKeyRecord } {
  const secret = (ctx.randomBytes ?? randomBytes)(32).toString("base64url");
  const head = `${PARTNER_KEY_PREFIX}${scope}_${partnerId}_`;
  const key = `${head}${secret}`;
  return { key, record: { hash: hashPartnerKey(key, ctx.pepper), prefix: `${head}${secret.slice(0, PREFIX_SECRET_CHARS)}`, rotatedAt: at === "" ? null : at } };
}

const summaryOf = (doc: PartnerDoc): PartnerSummary => ({
  partnerId: doc.partnerId,
  name: doc.name,
  keys: {
    pub: { prefix: doc.keys?.pub?.prefix ?? "(none)", rotatedAt: doc.keys?.pub?.rotatedAt ?? null },
    srv: { prefix: doc.keys?.srv?.prefix ?? "(none)", rotatedAt: doc.keys?.srv?.rotatedAt ?? null },
  },
  allowedOrigins: [...doc.allowedOrigins],
  status: doc.status,
  createdAt: doc.createdAt,
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
  /** More tenant ids addPartner must refuse (beyond RESERVED_PARTNER_IDS), for a caller that knows the configured tenants. The CLI fills it from VC_RESERVED_TENANT_IDS (reservedTenantIdsFromEnv). */
  reservedIds?: readonly string[];
  /** Partner ids explicitly bound to their own tenant (VC_PARTNER_OWN_TENANTS, partnerOwnTenantsFromEnv): exempt from `reservedIds` only, never from the built-in names. */
  ownTenants?: readonly string[];
  /** CLI only: where `add` and `list` print the empty-list warning (the script passes stderr). */
  warn?: (line: string) => void;
}

function requirePepper(ctx: PartnerOpContext): void {
  if (typeof ctx.pepper !== "string" || ctx.pepper.length < MIN_PEPPER_LENGTH) throw new PartnerConfigError(`${PARTNER_PEPPER_ENV} must be at least ${MIN_PEPPER_LENGTH} characters`);
}

/** Adds a partner and returns its two raw keys (page and server). They are shown to the caller once; only their HMACs and prefixes are stored. */
export async function addPartner(
  store: PartnerStore,
  input: { name: string; origins?: readonly string[]; id?: string },
  ctx: PartnerOpContext,
): Promise<{ partner: PartnerSummary; keys: Record<KeyScope, string> }> {
  requirePepper(ctx);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "" || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new PartnerError("usage", "a partner needs a name of 1 to 120 printable characters");
  const partnerId = input.id ?? slugOf(name);
  // The reserved check runs first and on the folded id (case, width), so `SANDBOX` is refused as reserved, not just as badly formed. Ids are ASCII-validated right after,
  // so a look-alike in another script never reaches a key.
  if (typeof partnerId === "string" && isReservedPartnerId(partnerId, ctx.reservedIds ?? [], ctx.ownTenants ?? [])) {
    throw new PartnerError("invalid_partner_id", `the partner id "${partnerId.slice(0, 80)}" is reserved (it is, or looks like, an existing tenant id); choose another with --id`);
  }
  if (!PARTNER_ID_PATTERN.test(partnerId) || !PATH_ID_PATTERN.test(partnerId)) {
    throw new PartnerError("invalid_partner_id", `the partner id must match ${PARTNER_ID_PATTERN.source} (lower-case letters, digits and hyphens); pass --id to choose one`);
  }
  const allowedOrigins = normalizeOrigins(input.origins ?? []);
  if (await store.get(partnerId)) throw new PartnerError("partner_exists", `partner "${partnerId}" already exists (rotate its key, or choose another id)`);
  const pub = newKey("pub", partnerId, ctx, "");
  const srv = newKey("srv", partnerId, ctx, "");
  const doc: PartnerDoc = {
    _id: partnerId,
    partnerId,
    name,
    keys: { pub: pub.record, srv: srv.record },
    allowedOrigins,
    status: "active",
    createdAt: (ctx.now?.() ?? new Date()).toISOString(),
  };
  await store.insert(doc);
  return { partner: summaryOf(doc), keys: { pub: pub.key, srv: srv.key } };
}

/** Replaces ONE scope's key of an active partner; the other scope's key is untouched. The old hash is gone from the store at once. */
export async function rotatePartner(
  store: PartnerStore,
  partnerId: string,
  scope: KeyScope,
  ctx: PartnerOpContext,
): Promise<{ partner: PartnerSummary; key: string; scope: KeyScope }> {
  requirePepper(ctx);
  if (!KEY_SCOPES.includes(scope)) throw new PartnerError("usage", "rotate needs --scope pub or --scope srv");
  const existing = await store.get(partnerId);
  if (!existing) throw new PartnerError("partner_not_found", `no partner "${partnerId}"`);
  if (existing.status === "revoked") throw new PartnerError("partner_revoked", `partner "${partnerId}" is revoked; add a new partner instead of rotating`);
  // S5: a key for a reserved partner id could never authenticate (the registry refuses it on every request), so none is minted. Revoke still works.
  if (isReservedPartnerId(existing.partnerId, ctx.reservedIds ?? [], ctx.ownTenants ?? [])) {
    throw new PartnerError("invalid_partner_id", `the partner id "${partnerId.slice(0, 80)}" is reserved (it is, or looks like, an existing tenant id), so its keys are refused on every request and no key was minted; revoke it and add the partner under another id with --id`);
  }
  const { key, record } = newKey(scope, partnerId, ctx, (ctx.now?.() ?? new Date()).toISOString());
  // K1 (fix cycle 1): write ONLY keys.<scope>. The old whole-`keys` write let two overlapping rotates of different scopes restore each other's old key.
  const patch: PartnerPatch = scope === "pub" ? { "keys.pub": record } : { "keys.srv": record };
  if (!(await store.update(partnerId, patch))) throw new PartnerError("partner_not_found", `no partner "${partnerId}"`);
  const keys = { ...existing.keys, [scope]: record } as Record<KeyScope, PartnerKeyRecord>;
  return { partner: summaryOf({ ...existing, keys }), key, scope };
}

/** Revokes a partner (idempotent): BOTH keys stop working on a running server within PARTNER_CACHE_TTL_MS. */
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
  "  partner add <name> [--id <partner-id>] [--origin <https://site>]...   register a partner; prints its page key and server key once",
  "  partner rotate <partner-id> --scope pub|srv                          new page or server key (printed once); the old one stops working",
  "  partner revoke <partner-id>                                          both keys stop working (within 60 s on a running server)",
  "  partner list [--check]                                               partners, status and key prefixes (never a key); an id that is now reserved is marked RESERVED; --check exits 1 when any active partner is",
];

const usageError = (extra?: string) => new PartnerError("usage", [...(extra ? [extra] : []), ...PARTNER_USAGE].join("\n"));

const RESERVED_REASON_TEXT: Record<ReservedIdReason, string> = {
  builtin: "a built-in reserved name or its family",
  repo: "a tenant this repo writes under",
  configured: `listed in ${RESERVED_TENANT_IDS_ENV}`,
};

function row(p: PartnerSummary): string {
  return `${p.partnerId}  ${p.status}  pub ${p.keys.pub.prefix}...  srv ${p.keys.srv.prefix}...  origins: ${p.allowedOrigins.length > 0 ? p.allowedOrigins.join(", ") : "(none)"}  name: ${p.name}`;
}

/** Runs one CLI command and returns the lines to print. Throws PartnerError (code "usage" for a bad command line). */
export async function runPartnerCli(argv: readonly string[], deps: { store: PartnerStore } & PartnerOpContext): Promise<string[]> {
  const [command, ...rest] = argv;
  // S1: an empty VC_RESERVED_TENANT_IDS leaves the real JWT tenants unprotected, so the two commands that choose or show ids say so, on stderr.
  if ((command === "add" || command === "list") && (deps.reservedIds ?? []).length === 0) deps.warn?.(reservedTenantIdsWarning());
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
      const { partner, keys } = await addPartner(deps.store, { name: positional[0]!, origins, ...(id !== undefined ? { id } : {}) }, deps);
      return [
        `added ${row(partner)}`,
        `page key (public: goes in the web page; works only on the public chat route, only from the origins above): ${keys.pub}`,
        `server key (secret: stays on the partner's backend; works only on the student chat routes): ${keys.srv}`,
        "Both keys are shown once and are not stored. Copy them now; to replace one run: partner rotate " + partner.partnerId + " --scope pub|srv",
      ];
    }
    case "rotate": {
      const args = [...rest];
      const at = args.indexOf("--scope");
      const scope = at >= 0 ? args[at + 1] : undefined;
      if (at >= 0) args.splice(at, 2);
      if (args.length !== 1 || (scope !== "pub" && scope !== "srv")) throw usageError("rotate needs exactly one <partner-id> and --scope pub or --scope srv");
      const { partner, key } = await rotatePartner(deps.store, args[0]!, scope, deps);
      return [`rotated ${scope} key of ${row(partner)}`, `${scope === "pub" ? "page" : "server"} key: ${key}`, "This key is shown once and is not stored. The old one stops working (within 60 s on a running server); the partner's other key is unchanged."];
    }
    case "revoke": {
      if (rest.length !== 1) throw usageError("revoke needs exactly one <partner-id>");
      return [`revoked ${row(await revokePartner(deps.store, rest[0]!))}`];
    }
    case "list": {
      const check = rest.length === 1 && rest[0] === "--check";
      if (rest.length !== 0 && !check) throw usageError("list takes no arguments except --check");
      const rows = await listPartners(deps.store);
      // pc-hardening H5: mark every partner whose id is reserved by the CURRENT configuration (made before the tenant was listed, or before a built-in name was added), so the
      // pre-deploy step is this command and not a manual comparison. --check turns an active flagged partner into a failure (exit 1). Ids and reasons only: no key material.
      const flagged = rows.map((p) => ({ p, reason: reservedPartnerIdReason(p.partnerId, deps.reservedIds ?? [], deps.ownTenants ?? []) })).filter((x) => x.reason !== undefined);
      if (check) {
        const active = flagged.filter((x) => x.p.status !== "revoked");
        if (active.length > 0) {
          throw new PartnerError(
            "reserved_ids",
            `${active.length} active partner(s) have an id that is currently reserved and would be refused on a server with this configuration: ${active.map((x) => `${x.p.partnerId} (${RESERVED_REASON_TEXT[x.reason!]})`).join("; ")}. Bind the partner in ${PARTNER_OWN_TENANTS_ENV} if it IS that tenant, otherwise take the tenant out of ${RESERVED_TENANT_IDS_ENV} or revoke the partner, then run this check again.`,
          );
        }
      }
      const reasonOf = new Map(flagged.map((x) => [x.p.partnerId, x.reason!]));
      return rows.length === 0 ? ["(no partners)"] : rows.map((p) => (reasonOf.has(p.partnerId) ? `${row(p)}  ** RESERVED: ${RESERVED_REASON_TEXT[reasonOf.get(p.partnerId)!]} **` : row(p)));
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
  /**
   * The partner a key belongs to when the key is valid AND of the given scope, or undefined (malformed, unknown, revoked, wrong-secret and wrong-scope are
   * indistinguishable). Rejects with PartnerRegistryUnavailableError when the store cannot be read.
   */
  authenticate(key: string, scope: KeyScope): Promise<PartnerIdentity | undefined>;
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
  /**
   * The configured tenant ids (R2): a key whose partner id is one of these, or is a built-in reserved name or a name+separator+suffix of one (isReservedPartnerId), is
   * refused as an unknown key, on every request. A function is asked on every request, so a tenant configured after the partner was added is covered at once.
   */
  reservedIds?: readonly string[] | (() => readonly string[]);
  /** Partner ids explicitly bound to their own tenant (VC_PARTNER_OWN_TENANTS): exempt from `reservedIds`, never from the built-in names or the repo tenants. */
  ownTenants?: readonly string[];
}

const DUMMY_HASH = Buffer.alloc(32);

export function createPartnerRegistry(options: PartnerRegistryOptions): PartnerRegistry {
  if (typeof options.pepper !== "string" || options.pepper.length < MIN_PEPPER_LENGTH) throw new PartnerConfigError(`${PARTNER_PEPPER_ENV} must be at least ${MIN_PEPPER_LENGTH} characters`);
  const nowMs = options.nowMs ?? Date.now;
  const ttlMs = Math.min(options.ttlMs ?? PARTNER_CACHE_TTL_MS, PARTNER_CACHE_TTL_MS);
  const pepper = options.pepper;
  const ownTenants = options.ownTenants ?? [];
  const turns = new Map<string, { turns: number }>();
  const reservedNow = (): readonly string[] => (typeof options.reservedIds === "function" ? options.reservedIds() : (options.reservedIds ?? []));
  let snapshot: { at: number; byId: Map<string, PartnerDoc> } | undefined;
  let inflight: Promise<Map<string, PartnerDoc>> | undefined;

  async function partners(): Promise<Map<string, PartnerDoc>> {
    if (snapshot && nowMs() - snapshot.at < ttlMs && nowMs() >= snapshot.at) return snapshot.byId;
    // One read serves every concurrent caller; a flood of random ids costs one read per window, not one per request.
    // The load starts in a microtask (Promise.resolve().then), so a store.list() that throws SYNCHRONOUSLY becomes a rejection of this promise, and the
    // `finally` that clears `inflight` always runs after the assignment (an immediate throw used to leave a rejected promise pinned in `inflight` forever).
    const load = async (): Promise<Map<string, PartnerDoc>> => {
      try {
        const at = nowMs();
        const docs = await options.store.list();
        const byId = new Map(docs.map((d) => [d.partnerId, d]));
        snapshot = { at, byId };
        return byId;
      } catch {
        snapshot = undefined; // never serve a stale list past its window (fail closed)
        throw new PartnerRegistryUnavailableError();
      }
    };
    inflight ??= Promise.resolve()
      .then(load)
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  }

  return {
    async authenticate(key, scope) {
      const parsed = typeof key === "string" ? parsePartnerKey(key) : undefined;
      if (!parsed) return undefined;
      const doc = (await partners()).get(parsed.partnerId);
      // The same work whether or not the partner exists or the scope fits: one HMAC and one constant-time compare against the key's OWN scope's hash.
      const presented = createHmac("sha256", pepper).update(key).digest();
      const hash = doc?.keys?.[parsed.scope]?.hash;
      const stored = typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash) ? Buffer.from(hash, "hex") : DUMMY_HASH;
      const equal = timingSafeEqual(presented, stored);
      if (!doc || !equal || doc.status !== "active" || parsed.scope !== scope) return undefined;
      // R2: the partner id is the tenant id of everything this key reaches, so a record whose id is (or looks like) an existing tenant is refused here even though
      // its HMAC is right (a record made before addPartner checked, or a tenant configured later). Same undefined as any bad key: the caller sends one uniform 401.
      if (isReservedPartnerId(doc.partnerId, reservedNow(), ownTenants)) return undefined;
      return { partnerId: doc.partnerId, name: doc.name, allowedOrigins: [...doc.allowedOrigins] };
    },
    async originAllowedByAnyPartner(origin) {
      const reserved = reservedNow();
      for (const doc of (await partners()).values()) if (doc.status === "active" && doc.allowedOrigins.includes(origin) && !isReservedPartnerId(doc.partnerId, reserved, ownTenants)) return true;
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
const CORS_METHODS = "POST,GET,OPTIONS";
const CORS_HEADERS = "Content-Type,X-VC-Key,Authorization";

/** pc-voice V2: where a visitor's browser mints an anonymous voice session (page key only). The voice stream is a WebSocket, which has no CORS. */
export const PUBLIC_VOICE_SESSIONS_PATH = "/v1/public/voice/sessions";

/**
 * The routes that take part in CORS: the public chat route, the public (anonymous) voice session route and the partner openapi route. Student routes
 * (chat, voice session, voice stream) take only a server key, which never gets CORS, so they are not here.
 */
export function isCorsEligiblePath(pathname: string): boolean {
  return pathname === ANONYMOUS_CHAT_PATH || pathname === PUBLIC_VOICE_SESSIONS_PATH || pathname === PARTNER_OPENAPI_PATH;
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

/** The key a CORS decision is made from: the page key in X-VC-Key. A server key (X-VC-Key or Bearer) never gets CORS, so nothing else is read. */
function keyForCors(req: ApiRequest): string | undefined {
  const k = partnerKeyFromRequest(req);
  return k.kind === "key" ? k.key : undefined;
}

/**
 * Wraps the whole handler (outermost). With a registry it answers preflights and adds Access-Control-Allow-Origin to a page-keyed response; without
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
        const partner = await registry.authenticate(key, "pub");
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
