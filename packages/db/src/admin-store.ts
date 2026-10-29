/**
 * vc-admin-control S2 (VA1, VA2, VA9a, VA16, VA17): the Admin Console's store, in the `virtual_counsellor`
 * database (unscoped Db, like the partner registry).
 *
 *   admin_users       {_id = lower-cased email, email, passwordHash, role, disabled, createdAt}
 *   sources           {_id = source id, siteId, kind, config (non-secret), secretEnc? {iv,tag,ct}, lastSync?}
 *   source_artifacts  {_id, sourceId, kind: schema_map | nav_catalogue, data, builtAt}
 *   audit_log         {_id, at, actorId, action, target, ok}   append-only: the surface has no update or delete
 *   turn_usage        {_id, at, siteId, studentKey (HMAC), mode, tokens, costUsd, latencyMs, guardrail?, answered}
 *                     NO message text, reply text, claims, snippets, profile facts or raw student id
 *
 * Invariants this file enforces (each has a test in tests/admin-store.test.ts):
 *   - A secret is written only by `sources.setSecret`, only as the AES-256-GCM triple (secrets.ts); no read
 *     path returns it: `get`/`list` carry `hasSecret: boolean`, and `readSecret` (server-side callers such as
 *     the connection test and the sync) is the only place a plaintext leaves the store.
 *   - A source `config` carrying a secret-like field or a credential URL is refused.
 *   - `usage.record` is an allow-list: any extra field throws and nothing is written.
 *   - Errors name the rule and the field, never a value.
 *
 * Collections are reached through LITERAL names only (never a computed name), as the fence scanner in
 * tests/db-scope.test.ts requires; tests/admin-store.test.ts asserts the literals equal COLLECTION_NAMES.
 */
import { createHmac, randomUUID } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { findSecretLikeFields } from "@vc/schemas";
import {
  MASTER_KEY_ENV,
  SecretsError,
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  parseMasterKey,
  type EncryptedSecret,
} from "./secrets.js";

export { decryptSecret, encryptSecret, parseMasterKey, SecretsError, type EncryptedSecret };

export type AdminStoreErrorCode = "invalid" | "exists" | "not_found" | "range";
export class AdminStoreError extends Error {
  constructor(
    readonly code: AdminStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminStoreError";
  }
}
const invalid = (message: string): never => {
  throw new AdminStoreError("invalid", message);
};

export const ADMIN_ROLES = ["super-admin", "admin", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const SOURCE_KINDS = ["github", "postgres"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const ARTIFACT_KINDS = ["schema_map", "nav_catalogue"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
export const SYNC_STATUSES = ["ok", "error", "held"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];
export const USAGE_MODES = ["chat", "voice"] as const;
export type UsageMode = (typeof USAGE_MODES)[number];

/** The USD to INR rate used when the caller passes none (the API passes the configured VC_USD_INR_RATE). */
export const DEFAULT_USD_INR_RATE = 85;

const MAX_SECRET_CHARS = 4096;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;

export interface AdminUserDoc {
  _id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  disabled: boolean;
  createdAt: string;
}
/** An admin user as listed: never the hash. */
export interface AdminUserSummary {
  email: string;
  role: AdminRole;
  disabled: boolean;
  createdAt: string;
}
export interface SourceSyncRecord {
  at: string;
  status: SyncStatus;
  counts: Record<string, number>;
}
export interface SourceDoc {
  _id: string;
  siteId: string;
  kind: SourceKind;
  config: Record<string, unknown>;
  secretEnc?: EncryptedSecret;
  lastSync?: SourceSyncRecord;
}
/** A source as returned: `hasSecret` is the only secret signal. */
export interface SourceSummary {
  id: string;
  siteId: string;
  kind: SourceKind;
  config: Record<string, unknown>;
  hasSecret: boolean;
  lastSync?: SourceSyncRecord;
}
export interface SourceArtifactDoc {
  _id: string;
  sourceId: string;
  kind: ArtifactKind;
  data: Record<string, unknown>;
  builtAt: string;
}
export interface AuditLogDoc {
  _id: string;
  at: string;
  actorId: string;
  action: string;
  target: string;
  ok: boolean;
}
export interface TurnUsageDoc {
  _id: string;
  at: string;
  siteId: string;
  studentKey?: string;
  mode: UsageMode;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  guardrail?: string;
  answered: boolean;
}
/** What a caller hands `usage.record`. No text of any kind. `studentKey` is omitted for an anonymous turn. */
export type TurnUsageInput = Omit<TurnUsageDoc, "_id" | "at"> & { at?: string };

export interface MetricsQuery {
  from: string | Date;
  to: string | Date;
  siteId?: string;
  /** USD to INR for `costPerStudentInr`; a config value (default DEFAULT_USD_INR_RATE). */
  usdInrRate?: number;
}
export interface MetricsResult {
  perSiteDay: Array<{ siteId: string; day: string; conversations: number }>;
  activeStudents: number;
  chatVsVoice: { chat: number; voice: number };
  tokens: number;
  costUsd: number;
  costPerStudentInr: number;
  latencyP50: number;
  latencyP95: number;
  guardrailHits: number;
  unanswered: number;
}

// ------------------------------------------------------------------ validation helpers
const SITE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const STUDENT_KEY = /^[0-9a-f]{64}$/;
const GUARDRAIL_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function plainObject(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid(`${what} must be an object`);
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], what: string): void {
  const extra = Object.keys(value).filter((k) => !allowed.includes(k));
  if (extra.length > 0) invalid(`${what}: unexpected field(s) ${extra.join(", ")}`);
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) return invalid(`${what} is not one of ${allowed.join("|")}`);
  return value as T;
}
function shortText(value: unknown, what: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || CONTROL_CHARS.test(value)) {
    return invalid(`${what} must be 1-${max} printable characters`);
  }
  return value;
}
function pattern(value: unknown, re: RegExp, what: string): string {
  if (typeof value !== "string" || !re.test(value)) return invalid(`${what} is malformed`);
  return value;
}
function nonNegInt(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid(`${what} must be a non-negative integer`);
  return value;
}
function nonNegNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return invalid(`${what} must be a non-negative number`);
  return value;
}
function isoTime(value: unknown, what: string): string {
  if (typeof value !== "string" && !(value instanceof Date)) return invalid(`${what} must be a date`);
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return invalid(`${what} is not a valid date`);
  return new Date(t).toISOString();
}
function normEmail(value: unknown): string {
  if (typeof value !== "string") return invalid("email must be a string");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return invalid("email is malformed");
  return email;
}
function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;
}
/** Snap float noise from summing decimals (a tenth of a nanodollar), so a sum of 0.1 + 0.2 reads 0.3. */
const snap = (n: number): number => Number(n.toFixed(9));

/** Nearest-rank percentile: the value at 1-based rank ceil(p / 100 x n) of the ascending sort; 0 for n = 0. */
export function nearestRank(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p * sorted.length) / 100)));
  return sorted[rank - 1]!;
}

/** The HMAC-SHA256 hex key that stands for one student in turn_usage: never the id, name or email. */
export function studentKeyOf(hmacKey: string | Uint8Array, siteId: string, studentId: string): string {
  if (hmacKey.length < 32) return invalid("studentKey HMAC key must be at least 32 characters");
  pattern(siteId, SITE_ID, "siteId");
  if (typeof studentId !== "string" || studentId.length === 0) return invalid("studentId must be a non-empty string");
  return createHmac("sha256", hmacKey).update(`turn_usage:v1\0${siteId}\0${studentId}`).digest("hex");
}

// ------------------------------------------------------------------ store
export interface AdminStoreOptions {
  /** base64 of exactly 32 bytes; defaults to process.env.VC_ADMIN_MASTER_KEY. Validated at construction when present. */
  masterKey?: string;
}

export interface AdminStore {
  users: {
    create(input: { email: string; passwordHash: string; role: AdminRole }): Promise<AdminUserSummary>;
    /** Includes the hash: for the login check only; never hand the result to a route response. */
    findByEmail(email: string): Promise<AdminUserDoc | null>;
    list(): Promise<AdminUserSummary[]>;
    setRole(email: string, role: AdminRole): Promise<boolean>;
    disable(email: string): Promise<boolean>;
  };
  sources: {
    upsert(input: { id: string; siteId: string; kind: SourceKind; config: Record<string, unknown> }): Promise<SourceSummary>;
    get(id: string): Promise<SourceSummary | null>;
    list(siteId?: string): Promise<SourceSummary[]>;
    /** The ONLY write path for a secret: encrypts, stores the triple. Plaintext is never persisted. */
    setSecret(id: string, plain: string): Promise<void>;
    /** Server-side only (connection test, sync). Decrypts; never pass the result to a response, log or trace. */
    readSecret(id: string): Promise<string | undefined>;
    recordSync(id: string, sync: { at?: string; status: SyncStatus; counts: Record<string, number> }): Promise<boolean>;
  };
  artifacts: {
    put(input: { sourceId: string; kind: ArtifactKind; data: Record<string, unknown>; builtAt?: string }): Promise<SourceArtifactDoc>;
    getLatest(sourceId: string, kind: ArtifactKind): Promise<SourceArtifactDoc | null>;
  };
  audit: {
    append(input: { actorId: string; action: string; target: string; ok: boolean; at?: string }): Promise<AuditLogDoc>;
    list(query?: { limit?: number; before?: string }): Promise<AuditLogDoc[]>;
  };
  usage: {
    record(input: TurnUsageInput): Promise<void>;
  };
}

export function createAdminStore(db: Db, options: AdminStoreOptions = {}): AdminStore {
  const usersC = (): Collection<AdminUserDoc> => db.collection<AdminUserDoc>("admin_users");
  const sourcesC = (): Collection<SourceDoc> => db.collection<SourceDoc>("sources");
  const artifactsC = (): Collection<SourceArtifactDoc> => db.collection<SourceArtifactDoc>("source_artifacts");
  const auditC = (): Collection<AuditLogDoc> => db.collection<AuditLogDoc>("audit_log");
  const usageC = (): Collection<TurnUsageDoc> => db.collection<TurnUsageDoc>("turn_usage");

  // Refuse a malformed master key now (startup / construction), not at the first secret write.
  const configured = options.masterKey ?? process.env[MASTER_KEY_ENV];
  const masterKey: Buffer | undefined = configured !== undefined && configured !== "" ? parseMasterKey(configured) : undefined;
  const requireMasterKey = (): Buffer => {
    if (masterKey === undefined) throw new SecretsError(`${MASTER_KEY_ENV} is not configured`);
    return masterKey;
  };

  const summaryOfUser = (u: AdminUserDoc): AdminUserSummary => ({ email: u.email, role: u.role, disabled: u.disabled, createdAt: u.createdAt });
  const summaryOfSource = (s: SourceDoc): SourceSummary => ({
    id: s._id,
    siteId: s.siteId,
    kind: s.kind,
    config: s.config,
    hasSecret: s.secretEnc !== undefined,
    ...(s.lastSync === undefined ? {} : { lastSync: s.lastSync }),
  });

  return {
    users: {
      async create(input) {
        const email = normEmail(input.email);
        const role = oneOf(input.role, ADMIN_ROLES, "role");
        if (typeof input.passwordHash !== "string" || input.passwordHash.length === 0 || input.passwordHash.length > 1024) {
          invalid("passwordHash must be a non-empty hash string");
        }
        const doc: AdminUserDoc = { _id: email, email, passwordHash: input.passwordHash, role, disabled: false, createdAt: new Date().toISOString() };
        try {
          await usersC().insertOne(doc as never);
        } catch (err) {
          if (isDuplicateKey(err)) throw new AdminStoreError("exists", "an admin with that email already exists");
          throw err;
        }
        return summaryOfUser(doc);
      },
      async findByEmail(email) {
        return (await usersC().findOne({ _id: normEmail(email) } as never)) ?? null;
      },
      async list() {
        const rows = await usersC().find({} as never).toArray();
        return rows.map(summaryOfUser).sort((a, b) => a.email.localeCompare(b.email));
      },
      async setRole(email, role) {
        const r = oneOf(role, ADMIN_ROLES, "role");
        const res = await usersC().updateOne({ _id: normEmail(email) } as never, { $set: { role: r } } as never);
        return res.matchedCount === 1;
      },
      async disable(email) {
        const res = await usersC().updateOne({ _id: normEmail(email) } as never, { $set: { disabled: true } } as never);
        return res.matchedCount === 1;
      },
    },

    sources: {
      async upsert(input) {
        const id = pattern(input.id, SOURCE_ID, "source id");
        const siteId = pattern(input.siteId, SITE_ID, "siteId");
        const kind = oneOf(input.kind, SOURCE_KINDS, "kind");
        const config = plainObject(input.config, "config");
        const secretPaths = findSecretLikeFields(config);
        if (secretPaths.length > 0) invalid(`config holds secret-like value(s) at: ${secretPaths.join(", ")}`);
        // Bind secrets to the destination they were provisioned for. No retarget/clear API exists:
        // a new destination must use a new source and explicitly provision its own secret.
        const current = await sourcesC().findOne({ _id: id } as never);
        const keys = ['platform', 'siteId', 'host', 'port', 'database', 'user', 'sslmode', 'passwordRef', 'caFileRef', 'owner', 'repo', 'branch', 'tokenRef'];
        if (current?.secretEnc && (current.siteId !== siteId || current.kind !== kind || keys.some(k => (current.config[k] ?? (k === 'platform' ? 'pathlynks' : undefined)) !== (config[k] ?? (k === 'platform' ? 'pathlynks' : undefined))))) invalid('credential destination cannot be changed');
        if (!current) {
          await sourcesC().insertOne({ _id: id, siteId, kind, config } as never);
        } else {
          // CAS also closes the race with setSecret and a concurrent config writer.
          const filter: Record<string, unknown> = { _id: id, siteId: current.siteId, kind: current.kind };
          for (const k of keys) filter['config.' + k] = current.config[k] === undefined ? { $exists: false } : current.config[k];
          if (current.secretEnc) {
            filter['secretEnc.iv'] = current.secretEnc.iv;
            filter['secretEnc.ct'] = current.secretEnc.ct;
            filter['secretEnc.tag'] = current.secretEnc.tag;
          } else filter.secretEnc = { $exists: false };
          const changed = await sourcesC().updateOne(filter as never, { $set: { siteId, kind, config } } as never);
          if (changed.matchedCount !== 1) invalid('source changed concurrently');
        }
        const stored = await sourcesC().findOne({ _id: id } as never);
        return summaryOfSource(stored!);
      },
      async get(id) {
        const s = await sourcesC().findOne({ _id: pattern(id, SOURCE_ID, "source id") } as never);
        return s === null ? null : summaryOfSource(s);
      },
      async list(siteId) {
        const filter = siteId === undefined ? {} : { siteId: pattern(siteId, SITE_ID, "siteId") };
        const rows = await sourcesC().find(filter as never).toArray();
        return rows.map(summaryOfSource).sort((a, b) => a.id.localeCompare(b.id));
      },
      async setSecret(id, plain) {
        const sourceId = pattern(id, SOURCE_ID, "source id");
        if (typeof plain !== "string" || plain.length === 0 || plain.length > MAX_SECRET_CHARS) invalid(`secret must be 1-${MAX_SECRET_CHARS} characters`);
        const secretEnc = encryptSecret(plain, requireMasterKey());
        const current = await sourcesC().findOne({ _id: sourceId } as never);
        if (!current) throw new AdminStoreError('not_found', 'no such source');
        const filter: Record<string, unknown> = { _id: sourceId, siteId: current.siteId, kind: current.kind };
        for (const k of ['platform', 'siteId', 'host', 'port', 'database', 'user', 'sslmode', 'passwordRef', 'caFileRef', 'owner', 'repo', 'branch', 'tokenRef']) filter['config.' + k] = current.config[k] === undefined ? { $exists: false } : current.config[k];
        const res = await sourcesC().updateOne(filter as never, { $set: { secretEnc } } as never);
        if (res.matchedCount !== 1) throw new AdminStoreError("not_found", "no such source");
      },
      async readSecret(id) {
        const s = await sourcesC().findOne({ _id: pattern(id, SOURCE_ID, "source id") } as never);
        if (s === null || s.secretEnc === undefined) return undefined;
        if (!isEncryptedSecret(s.secretEnc)) throw new SecretsError("decryption failed");
        return decryptSecret(s.secretEnc, requireMasterKey());
      },
      async recordSync(id, sync) {
        const sourceId = pattern(id, SOURCE_ID, "source id");
        onlyKeys(plainObject(sync, "sync"), ["at", "status", "counts"], "sync");
        const status = oneOf(sync.status, SYNC_STATUSES, "status");
        const countsIn = plainObject(sync.counts, "counts");
        const keys = Object.keys(countsIn);
        if (keys.length > 32) invalid("counts has too many entries");
        const counts: Record<string, number> = {};
        for (const k of keys) {
          pattern(k, /^[A-Za-z0-9_.-]{1,48}$/, "counts key");
          counts[k] = nonNegInt(countsIn[k], `counts.${k}`);
        }
        const lastSync: SourceSyncRecord = { at: sync.at === undefined ? new Date().toISOString() : isoTime(sync.at, "at"), status, counts };
        const res = await sourcesC().updateOne({ _id: sourceId } as never, { $set: { lastSync } } as never);
        return res.matchedCount === 1;
      },
    },

    artifacts: {
      async put(input) {
        const sourceId = pattern(input.sourceId, SOURCE_ID, "sourceId");
        const kind = oneOf(input.kind, ARTIFACT_KINDS, "kind");
        const data = plainObject(input.data, "data");
        // Schema and navigation only: the shape of a schema map / route catalogue, never row data.
        if (kind === "schema_map") plainObject(data.tables, "data.tables");
        else if (!Array.isArray(data.routes)) invalid("data.routes must be an array");
        if (JSON.stringify(data).length > MAX_ARTIFACT_BYTES) invalid("data is too large");
        const builtAt = input.builtAt === undefined ? new Date().toISOString() : isoTime(input.builtAt, "builtAt");
        const doc: SourceArtifactDoc = { _id: `${sourceId}:${kind}:${builtAt}`, sourceId, kind, data, builtAt };
        await artifactsC().updateOne({ _id: doc._id } as never, { $set: { sourceId, kind, data, builtAt } } as never, { upsert: true });
        return doc;
      },
      async getLatest(sourceId, kind) {
        const rows = await artifactsC()
          .find({ sourceId: pattern(sourceId, SOURCE_ID, "sourceId"), kind: oneOf(kind, ARTIFACT_KINDS, "kind") } as never)
          .sort({ builtAt: -1 })
          .limit(1)
          .toArray();
        return rows[0] ?? null;
      },
    },

    audit: {
      async append(input) {
        onlyKeys(plainObject(input, "audit entry"), ["actorId", "action", "target", "ok", "at"], "audit entry");
        if (typeof input.ok !== "boolean") invalid("ok must be a boolean");
        const doc: AuditLogDoc = {
          _id: randomUUID(),
          at: input.at === undefined ? new Date().toISOString() : isoTime(input.at, "at"),
          actorId: shortText(input.actorId, "actorId"),
          action: shortText(input.action, "action", 128),
          target: shortText(input.target, "target"),
          ok: input.ok,
        };
        await auditC().insertOne(doc as never);
        return doc;
      },
      async list(query = {}) {
        const limit = query.limit === undefined ? 100 : Math.min(500, Math.max(1, nonNegInt(query.limit, "limit")));
        const filter = query.before === undefined ? {} : { at: { $lt: isoTime(query.before, "before") } };
        return auditC().find(filter as never).sort({ at: -1 }).limit(limit).toArray();
      },
    },

    usage: {
      async record(input) {
        onlyKeys(plainObject(input, "turn usage"), ["at", "siteId", "studentKey", "mode", "inputTokens", "outputTokens", "costUsd", "latencyMs", "guardrail", "answered"], "turn usage");
        if (typeof input.answered !== "boolean") invalid("answered must be a boolean");
        const doc: TurnUsageDoc = {
          _id: randomUUID(),
          at: input.at === undefined ? new Date().toISOString() : isoTime(input.at, "at"),
          siteId: pattern(input.siteId, SITE_ID, "siteId"),
          ...(input.studentKey === undefined ? {} : { studentKey: pattern(input.studentKey, STUDENT_KEY, "studentKey (must be the 64-hex HMAC, never an id)") }),
          mode: oneOf(input.mode, USAGE_MODES, "mode"),
          inputTokens: nonNegInt(input.inputTokens, "inputTokens"),
          outputTokens: nonNegInt(input.outputTokens, "outputTokens"),
          costUsd: nonNegNumber(input.costUsd, "costUsd"),
          latencyMs: nonNegNumber(input.latencyMs, "latencyMs"),
          ...(input.guardrail === undefined ? {} : { guardrail: pattern(input.guardrail, GUARDRAIL_NAME, "guardrail (a rule name, not text)") }),
          answered: input.answered,
        };
        await usageC().insertOne(doc as never);
      },
    },
  };
}

// ------------------------------------------------------------------ VA17: metrics
const USAGE_PROJECTION = { at: 1, siteId: 1, studentKey: 1, mode: 1, inputTokens: 1, outputTokens: 1, costUsd: 1, latencyMs: 1, guardrail: 1, answered: 1 } as const;

/**
 * Aggregates turn_usage over [from, to) (from inclusive, to exclusive, UTC), optionally for one site.
 * `perSiteDay.conversations` counts turn rows (one row per chat or voice turn); `tokens` = input + output;
 * latency percentiles are nearest-rank over the rows in range; `costPerStudentInr` = costUsd x rate /
 * activeStudents (0 when there are no identified students). Sums are snapped to 9 decimals.
 */
export async function aggregateMetrics(db: Db, query: MetricsQuery): Promise<MetricsResult> {
  let from: string;
  let to: string;
  try {
    from = isoTime(query.from, "from");
    to = isoTime(query.to, "to");
  } catch {
    throw new AdminStoreError("range", "from and to must be valid dates");
  }
  if (!(from < to)) throw new AdminStoreError("range", "from must be before to");
  const rate = query.usdInrRate === undefined ? DEFAULT_USD_INR_RATE : query.usdInrRate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) invalid("usdInrRate must be a positive number");
  const filter: Record<string, unknown> = { at: { $gte: from, $lt: to } };
  if (query.siteId !== undefined) filter.siteId = pattern(query.siteId, SITE_ID, "siteId");
  const rows = await db
    .collection<TurnUsageDoc>("turn_usage")
    .find(filter as never, { projection: USAGE_PROJECTION as never })
    .toArray();

  const perCell = new Map<string, { siteId: string; day: string; conversations: number }>();
  const students = new Set<string>();
  const latencies: number[] = [];
  let chat = 0;
  let voice = 0;
  let tokens = 0;
  let cost = 0;
  let guardrailHits = 0;
  let unanswered = 0;
  for (const r of rows) {
    const day = r.at.slice(0, 10);
    const cellKey = `${day}\0${r.siteId}`;
    const cell = perCell.get(cellKey) ?? { siteId: r.siteId, day, conversations: 0 };
    cell.conversations += 1;
    perCell.set(cellKey, cell);
    if (r.studentKey !== undefined) students.add(r.studentKey);
    if (r.mode === "voice") voice += 1;
    else chat += 1;
    tokens += r.inputTokens + r.outputTokens;
    cost += r.costUsd;
    latencies.push(r.latencyMs);
    if (r.guardrail !== undefined) guardrailHits += 1;
    if (r.answered === false) unanswered += 1;
  }
  const costUsd = snap(cost);
  return {
    perSiteDay: [...perCell.values()].sort((a, b) => a.day.localeCompare(b.day) || a.siteId.localeCompare(b.siteId)),
    activeStudents: students.size,
    chatVsVoice: { chat, voice },
    tokens,
    costUsd,
    costPerStudentInr: students.size === 0 ? 0 : snap((costUsd * rate) / students.size),
    latencyP50: nearestRank(latencies, 50),
    latencyP95: nearestRank(latencies, 95),
    guardrailHits,
    unanswered,
  };
}
