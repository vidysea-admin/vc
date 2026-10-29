/**
 * vc-admin-control VA2 / VA9a / VA16 / VA17 (S2): the admin store, the AES-256-GCM secrets, the text-free
 * usage record and the metrics aggregation, against the in-process fake Db (no network, B8).
 * Every secret-looking value is an obvious dummy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { COLLECTION_NAMES } from "../src/collections.js";
import { ERASURE_EXEMPT_COLLECTIONS } from "../src/erasure.js";
import { INDEX_PLAN } from "../scripts/db-init.js";
import { decryptSecret, encryptSecret, parseMasterKey, SecretsError, type EncryptedSecret } from "../src/secrets.js";
import {
  AdminStoreError,
  DEFAULT_USD_INR_RATE,
  aggregateMetrics,
  createAdminStore,
  nearestRank,
  studentKeyOf,
} from "../src/admin-store.js";
import { createFakeDb } from "./fakes.js";

const KEY = randomBytes(32);
const KEY_B64 = KEY.toString("base64");
const DUMMY_SECRET = "test-secret-not-real-0123456789";
const HMAC_KEY = "test-hmac-key-not-real-0123456789-abcdef";

function flipBit(b64: string, byteIndex: number): string {
  const b = Buffer.from(b64, "base64");
  b[byteIndex % b.length]! ^= 0x01;
  return b.toString("base64");
}
function allDocs(fakeDb: ReturnType<typeof createFakeDb>["fakeDb"]): string {
  const names = ["admin_users", "sources", "source_artifacts", "audit_log", "turn_usage"];
  return JSON.stringify(names.map((n) => fakeDb.collection<{ _id: string }>(n).all()));
}
const newStore = (opts: { masterKey?: string } = { masterKey: KEY_B64 }) => {
  const { fakeDb, db } = createFakeDb();
  return { fakeDb, db, store: createAdminStore(db, opts) };
};

// ---------------------------------------------------------------- VA2: crypto
test("VA2: encryptSecret/decryptSecret round trip, including unicode and long plaintext", () => {
  for (const plain of [DUMMY_SECRET, "x", "pässwörd-日本-🙂-not-real", "a".repeat(5000)]) {
    const enc = encryptSecret(plain, KEY);
    assert.deepEqual(Object.keys(enc).sort(), ["ct", "iv", "tag"]);
    assert.equal(decryptSecret(enc, KEY), plain);
  }
});

test("VA2: a fresh random 12-byte iv per call (50 encryptions of one plaintext are all different)", () => {
  const seen = new Set<string>();
  const cts = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const enc = encryptSecret(DUMMY_SECRET, KEY);
    assert.equal(Buffer.from(enc.iv, "base64").length, 12);
    assert.equal(Buffer.from(enc.tag, "base64").length, 16);
    seen.add(enc.iv);
    cts.add(enc.ct);
  }
  assert.equal(seen.size, 50);
  assert.equal(cts.size, 50);
});

test("VA2: a flipped bit in ct, tag or iv throws and returns no plaintext", () => {
  const enc = encryptSecret(DUMMY_SECRET, KEY);
  for (const field of ["ct", "tag", "iv"] as const) {
    for (const byte of [0, 3, 7]) {
      const bad: EncryptedSecret = { ...enc, [field]: flipBit(enc[field], byte) };
      assert.throws(() => decryptSecret(bad, KEY), SecretsError, `${field}[${byte}]`);
    }
  }
  assert.equal(decryptSecret(enc, KEY), DUMMY_SECRET, "the untouched triple still decrypts");
});

test("VA2: a truncated or padded tag, a wrong-length iv, a missing/extra field and non-canonical base64 all throw", () => {
  const enc = encryptSecret(DUMMY_SECRET, KEY);
  const tag = Buffer.from(enc.tag, "base64");
  const iv = Buffer.from(enc.iv, "base64");
  const bad: unknown[] = [
    { ...enc, tag: tag.subarray(0, 8).toString("base64") },
    { ...enc, tag: tag.subarray(0, 4).toString("base64") },
    { ...enc, tag: Buffer.concat([tag, Buffer.from([0])]).toString("base64") },
    { ...enc, tag: "" },
    { ...enc, iv: iv.subarray(0, 8).toString("base64") },
    { ...enc, iv: Buffer.concat([iv, Buffer.from([0])]).toString("base64") },
    { iv: enc.iv, tag: enc.tag },
    { ...enc, extra: "x" },
    { ...enc, ct: enc.ct.replace(/=+$/, "") + "\n" },
    { ...enc, ct: 5 },
    null,
    "not-an-object",
  ];
  for (const b of bad) assert.throws(() => decryptSecret(b as EncryptedSecret, KEY), SecretsError);
});

test("VA2: a wrong key throws; a key that is not exactly 32 bytes is refused by encrypt and decrypt", () => {
  const enc = encryptSecret(DUMMY_SECRET, KEY);
  assert.throws(() => decryptSecret(enc, randomBytes(32)), SecretsError);
  for (const n of [0, 16, 31, 33, 64]) {
    assert.throws(() => encryptSecret(DUMMY_SECRET, randomBytes(n)), SecretsError, `encrypt ${n}`);
    assert.throws(() => decryptSecret(enc, randomBytes(n)), SecretsError, `decrypt ${n}`);
  }
});

test("VA2: the master key must be base64 of exactly 32 bytes; the refusal never echoes the value", () => {
  assert.equal(parseMasterKey(KEY_B64).length, 32);
  const badStrings = [
    randomBytes(31).toString("base64"),
    randomBytes(33).toString("base64"),
    randomBytes(16).toString("base64"),
    "not base64 at all !!",
    KEY_B64.replace(/\+/g, "-").replace(/\//g, "_") + "!",
  ];
  for (const b of badStrings) {
    assert.throws(() => parseMasterKey(b), (e: unknown) => e instanceof SecretsError && !(e as Error).message.includes(b));
  }
  for (const b of ["", undefined, 42, null]) assert.throws(() => parseMasterKey(b), SecretsError);
  const wrong = randomBytes(31).toString("base64");
  const { db } = createFakeDb();
  assert.throws(() => createAdminStore(db, { masterKey: wrong }), (e: unknown) => e instanceof SecretsError && !(e as Error).message.includes(wrong));
});

test("VA2: setSecret without a configured master key fails closed, naming the env var only", async () => {
  const saved = process.env.VC_ADMIN_MASTER_KEY;
  delete process.env.VC_ADMIN_MASTER_KEY;
  try {
    const { store } = newStore({});
    await store.sources.upsert({ id: "src-a", siteId: "pathlynks", kind: "postgres", config: { host: "h" } });
    await assert.rejects(
      store.sources.setSecret("src-a", DUMMY_SECRET),
      (e: unknown) => e instanceof SecretsError && /VC_ADMIN_MASTER_KEY/.test((e as Error).message) && !(e as Error).message.includes(DUMMY_SECRET),
    );
  } finally {
    if (saved !== undefined) process.env.VC_ADMIN_MASTER_KEY = saved;
  }
});

test("VA2: setSecret stores only the encrypted triple; the fake Db holds no plaintext substring; get/list show hasSecret only", async () => {
  const { fakeDb, store } = newStore();
  await store.sources.upsert({ id: "src-a", siteId: "pathlynks", kind: "postgres", config: { host: "db.example.invalid", port: 5432 } });
  assert.equal((await store.sources.get("src-a"))?.hasSecret, false);
  await store.sources.setSecret("src-a", DUMMY_SECRET);
  const raw = fakeDb.collection<{ _id: string; secretEnc?: EncryptedSecret }>("sources").all()[0]!;
  assert.deepEqual(Object.keys(raw.secretEnc ?? {}).sort(), ["ct", "iv", "tag"]);
  assert.equal(decryptSecret(raw.secretEnc!, KEY), DUMMY_SECRET);
  assert.equal(allDocs(fakeDb).includes(DUMMY_SECRET), false);
  assert.equal(allDocs(fakeDb).includes(Buffer.from(DUMMY_SECRET).toString("base64")), false);
  const got = await store.sources.get("src-a");
  const listed = await store.sources.list();
  for (const view of [got, ...listed]) {
    assert.equal(view?.hasSecret, true);
    assert.equal(JSON.stringify(view).includes("secretEnc"), false);
    assert.equal(JSON.stringify(view).includes(raw.secretEnc!.ct), false);
  }
  assert.equal(await store.sources.readSecret("src-a"), DUMMY_SECRET);
  // S12: metadata updates keep the secret, but a destination change is refused.
  await assert.rejects(store.sources.upsert({ id: "src-a", siteId: "pathlynks", kind: "postgres", config: { host: "db2.example.invalid" } }), AdminStoreError);
  await store.sources.upsert({ id: "src-a", siteId: "pathlynks", kind: "postgres", config: { host: "db.example.invalid", port: 5432, enabled: false } });
  assert.equal((await store.sources.get("src-a"))?.hasSecret, true);
  assert.equal(await store.sources.readSecret("src-a"), DUMMY_SECRET);
});

test("VA2: setSecret on an unknown source, with an empty or oversized value, is refused and writes nothing", async () => {
  const { fakeDb, store } = newStore();
  await assert.rejects(store.sources.setSecret("nope", DUMMY_SECRET), AdminStoreError);
  await store.sources.upsert({ id: "src-a", siteId: "s1", kind: "github", config: { owner: "acme" } });
  await assert.rejects(store.sources.setSecret("src-a", ""), AdminStoreError);
  await assert.rejects(store.sources.setSecret("src-a", "x".repeat(5000)), AdminStoreError);
  assert.equal((await store.sources.get("src-a"))?.hasSecret, false);
  assert.equal(allDocs(fakeDb).includes("secretEnc"), false);
});

test("VA2: a source config carrying a secret-like field or a credential URL is refused at upsert", async () => {
  const { fakeDb, store } = newStore();
  await assert.rejects(store.sources.upsert({ id: "src-a", siteId: "s1", kind: "postgres", config: { password: DUMMY_SECRET } }), AdminStoreError);
  await assert.rejects(store.sources.upsert({ id: "src-a", siteId: "s1", kind: "postgres", config: { url: "postgres://u:dummy-not-real@h/db" } }), AdminStoreError);
  assert.equal(fakeDb.collection("sources").size(), 0);
});

// ---------------------------------------------------------------- admin users
test("S2 users: create normalises the email, refuses a duplicate and an invalid role/email, never lists the hash", async () => {
  const { store } = newStore();
  const made = await store.users.create({ email: "  Boss@Example.TEST ", passwordHash: "scrypt$dummy-hash-not-real", role: "super-admin" });
  assert.equal(made.email, "boss@example.test");
  assert.equal(JSON.stringify(made).includes("scrypt$"), false);
  await assert.rejects(
    store.users.create({ email: "BOSS@example.test", passwordHash: "x", role: "viewer" }),
    (e: unknown) => e instanceof AdminStoreError && (e as AdminStoreError).code === "exists",
  );
  await assert.rejects(store.users.create({ email: "a@b.test", passwordHash: "x", role: "root" as never }), AdminStoreError);
  await assert.rejects(store.users.create({ email: "not-an-email", passwordHash: "x", role: "viewer" }), AdminStoreError);
  await assert.rejects(store.users.create({ email: "c@d.test", passwordHash: "", role: "viewer" }), AdminStoreError);
  const found = await store.users.findByEmail("BOSS@EXAMPLE.TEST");
  assert.equal(found?.passwordHash, "scrypt$dummy-hash-not-real");
  assert.equal(found?.disabled, false);
  assert.equal(await store.users.findByEmail("nobody@example.test"), null);
  const listed = await store.users.list();
  assert.equal(listed.length, 1);
  assert.equal(JSON.stringify(listed).includes("passwordHash"), false);
  assert.equal(JSON.stringify(listed).includes("scrypt$"), false);
});

test("S2 users: setRole and disable change the stored user; an unknown email reports false", async () => {
  const { store } = newStore();
  await store.users.create({ email: "v@example.test", passwordHash: "h", role: "viewer" });
  assert.equal(await store.users.setRole("V@example.test", "admin"), true);
  assert.equal((await store.users.findByEmail("v@example.test"))?.role, "admin");
  assert.equal(await store.users.disable("v@example.test"), true);
  assert.equal((await store.users.findByEmail("v@example.test"))?.disabled, true);
  assert.equal(await store.users.setRole("ghost@example.test", "admin"), false);
  assert.equal(await store.users.disable("ghost@example.test"), false);
  await assert.rejects(store.users.setRole("v@example.test", "owner" as never), AdminStoreError);
});

// ---------------------------------------------------------------- audit + artifacts + sync
test("S2 audit: append-only (no update/delete on the surface), newest first, extra or oversized fields refused", async () => {
  const { store } = newStore();
  assert.deepEqual(Object.keys(store.audit).sort(), ["append", "list"]);
  await store.audit.append({ actorId: "a@example.test", action: "sites.create", target: "site-1", ok: true, at: "2026-10-01T00:00:00.000Z" });
  await store.audit.append({ actorId: "a@example.test", action: "sources.sync", target: "src-a", ok: false, at: "2026-10-02T00:00:00.000Z" });
  const rows = await store.audit.list({ limit: 10 });
  assert.deepEqual(rows.map((r) => r.action), ["sources.sync", "sites.create"]);
  assert.equal(rows[0]?.ok, false);
  assert.equal((await store.audit.list({ limit: 1 })).length, 1);
  assert.equal((await store.audit.list({ before: "2026-10-02T00:00:00.000Z" })).length, 1);
  await assert.rejects(store.audit.append({ actorId: "a", action: "x", target: "t", ok: true, detail: "free text" } as never), AdminStoreError);
  await assert.rejects(store.audit.append({ actorId: "a", action: "x".repeat(300), target: "t", ok: true }), AdminStoreError);
  await assert.rejects(store.audit.append({ actorId: "a", action: "x", target: "t", ok: "yes" as never }), AdminStoreError);
});

test("S2 artifacts: getLatest returns the newest build; a payload that is not a schema map / catalogue is refused", async () => {
  const { store } = newStore();
  await store.artifacts.put({ sourceId: "src-a", kind: "schema_map", data: { tables: { users: { columns: { id: { type: "UUID" } }, sourceFiles: ["m1.js"] } } }, builtAt: "2026-10-01T00:00:00.000Z" });
  await store.artifacts.put({ sourceId: "src-a", kind: "schema_map", data: { tables: { users: { columns: {}, sourceFiles: [] }, saved: { columns: {}, sourceFiles: [] } } }, builtAt: "2026-10-02T00:00:00.000Z" });
  await store.artifacts.put({ sourceId: "src-a", kind: "nav_catalogue", data: { routes: [{ path: "/careers/[id]", file: "p.jsx" }] }, builtAt: "2026-10-01T00:00:00.000Z" });
  const latest = await store.artifacts.getLatest("src-a", "schema_map");
  assert.deepEqual(Object.keys((latest?.data as { tables: object }).tables).sort(), ["saved", "users"]);
  assert.equal((await store.artifacts.getLatest("src-a", "nav_catalogue"))?.kind, "nav_catalogue");
  assert.equal(await store.artifacts.getLatest("src-b", "schema_map"), null);
  await assert.rejects(store.artifacts.put({ sourceId: "src-a", kind: "schema_map", data: { rows: [{ name: "a student" }] } as never }), AdminStoreError);
  await assert.rejects(store.artifacts.put({ sourceId: "src-a", kind: "nav_catalogue", data: { routes: "nope" } as never }), AdminStoreError);
  await assert.rejects(store.artifacts.put({ sourceId: "src-a", kind: "rows" as never, data: {} as never }), AdminStoreError);
});

test("S2 sources.recordSync: stores at/status/counts only; counts must be non-negative integers; unknown source reports false", async () => {
  const { store } = newStore();
  await store.sources.upsert({ id: "src-a", siteId: "s1", kind: "github", config: { owner: "acme" } });
  assert.equal(await store.sources.recordSync("src-a", { at: "2026-10-03T00:00:00.000Z", status: "ok", counts: { files: 12, tables: 3 } }), true);
  assert.deepEqual((await store.sources.get("src-a"))?.lastSync, { at: "2026-10-03T00:00:00.000Z", status: "ok", counts: { files: 12, tables: 3 } });
  assert.equal(await store.sources.recordSync("ghost", { status: "ok", counts: {} }), false);
  await assert.rejects(store.sources.recordSync("src-a", { status: "ok", counts: { files: -1 } }), AdminStoreError);
  await assert.rejects(store.sources.recordSync("src-a", { status: "ok", counts: { files: 1.5 } }), AdminStoreError);
  await assert.rejects(store.sources.recordSync("src-a", { status: "weird" as never, counts: {} }), AdminStoreError);
  await assert.rejects(store.sources.recordSync("src-a", { status: "error", counts: {}, message: "boom" } as never), AdminStoreError);
});

// ---------------------------------------------------------------- VA9a: the collections are wired
test("VA9a: the five admin collections are named, indexed and erasure-exempt with a reason; none has a TTL", () => {
  const names = ["admin_users", "sources", "source_artifacts", "audit_log", "turn_usage"] as const;
  for (const n of names) {
    assert.equal((COLLECTION_NAMES as Record<string, string>)[n], n);
    assert.ok(INDEX_PLAN.some((s) => s.collection === n), `${n} has an INDEX_PLAN entry`);
    const reason = (ERASURE_EXEMPT_COLLECTIONS as Record<string, string>)[n];
    assert.ok(typeof reason === "string" && reason.length > 10, `${n} exempt reason`);
    assert.ok(INDEX_PLAN.filter((s) => s.collection === n).every((s) => !("expireAfterSeconds" in s)), `${n} has no expiry index`);
  }
});

// ---------------------------------------------------------------- VA16: text-free usage
const usage = (over: Record<string, unknown> = {}) => ({
  at: "2026-10-01T10:00:00.000Z",
  siteId: "site-a",
  studentKey: studentKeyOf(HMAC_KEY, "site-a", "student-123"),
  mode: "chat",
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
  latencyMs: 250,
  answered: true,
  ...over,
});

test("VA16: studentKeyOf is an HMAC (64 hex), deterministic, never the raw id, and differs per site and per student", () => {
  const k = studentKeyOf(HMAC_KEY, "site-a", "student-123");
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.notEqual(k, "student-123");
  assert.equal(k.includes("student-123"), false);
  assert.equal(k, studentKeyOf(HMAC_KEY, "site-a", "student-123"));
  assert.notEqual(k, studentKeyOf(HMAC_KEY, "site-b", "student-123"));
  assert.notEqual(k, studentKeyOf(HMAC_KEY, "site-a", "student-124"));
  assert.notEqual(k, studentKeyOf(HMAC_KEY + "x", "site-a", "student-123"));
  assert.throws(() => studentKeyOf("short", "site-a", "s"), AdminStoreError);
  assert.throws(() => studentKeyOf(HMAC_KEY, "site-a", ""), AdminStoreError);
});

test("VA16: usage.record stores exactly the schema fields; every extra field (text, reply, claims, raw id, email) throws and writes nothing", async () => {
  const { fakeDb, store } = newStore();
  await store.usage.record(usage({ guardrail: "citation" }) as never);
  const row = fakeDb.collection<Record<string, unknown>>("turn_usage").all()[0]!;
  assert.deepEqual(Object.keys(row).sort(), ["_id", "answered", "at", "costUsd", "guardrail", "inputTokens", "latencyMs", "mode", "outputTokens", "siteId", "studentKey"]);
  const before = fakeDb.collection("turn_usage").size();
  for (const extra of ["text", "message", "reply", "claims", "snippets", "profileFacts", "studentId", "email", "name", "threadId", "prompt"]) {
    await assert.rejects(store.usage.record(usage({ [extra]: "canary sentence" }) as never), AdminStoreError, extra);
  }
  assert.equal(fakeDb.collection("turn_usage").size(), before);
});

test("VA16: a raw student id, an email or a name in studentKey is refused (must be the 64-hex HMAC); bad numbers/enums are refused", async () => {
  const { store } = newStore();
  for (const bad of ["student-123", "a@b.test", "Asha Rao", "G".repeat(64), "a".repeat(63), "A".repeat(64)]) {
    await assert.rejects(store.usage.record(usage({ studentKey: bad }) as never), AdminStoreError, bad);
  }
  const invalid: Record<string, unknown>[] = [
    { mode: "email" },
    { inputTokens: -1 },
    { outputTokens: 1.5 },
    { costUsd: -0.1 },
    { costUsd: Number.NaN },
    { latencyMs: -5 },
    { answered: "yes" },
    { siteId: "" },
    { at: "not a date" },
    { guardrail: "the user said something long and free-form here" },
    { guardrail: "x".repeat(65) },
  ];
  for (const over of invalid) await assert.rejects(store.usage.record(usage(over) as never), AdminStoreError, JSON.stringify(over));
});

test("VA16: an anonymous turn may omit studentKey (no identifier at all) and is stored with none", async () => {
  const { fakeDb, store } = newStore();
  const { studentKey: _drop, ...anon } = usage();
  await store.usage.record(anon as never);
  assert.equal("studentKey" in fakeDb.collection<Record<string, unknown>>("turn_usage").all()[0]!, false);
});

test("VA16: a canary sentence handed alongside a turn never reaches any stored document", async () => {
  const { fakeDb, store } = newStore();
  const canary = "CANARY-sentence-purple-elephant-7731";
  await assert.rejects(store.usage.record(usage({ text: canary }) as never));
  await store.usage.record(usage() as never);
  assert.equal(allDocs(fakeDb).includes(canary), false);
  assert.equal(allDocs(fakeDb).includes("student-123"), false);
});

// ---------------------------------------------------------------- VA17: metrics golden table
interface Seed {
  at: string;
  siteId: string;
  k: string | null;
  mode: "chat" | "voice";
  i: number;
  o: number;
  c: number;
  l: number;
  g?: string;
  a: boolean;
}
const S: Seed[] = [
  { at: "2026-10-01T00:00:00.000Z", siteId: "site-a", k: "k1", mode: "chat", i: 100, o: 50, c: 0.01, l: 400, a: true },
  { at: "2026-10-01T09:00:00.000Z", siteId: "site-a", k: "k1", mode: "chat", i: 120, o: 60, c: 0.012, l: 800, a: true },
  { at: "2026-10-01T23:59:59.999Z", siteId: "site-a", k: "k2", mode: "voice", i: 200, o: 100, c: 0.02, l: 1200, g: "citation", a: true },
  { at: "2026-10-01T10:00:00.000Z", siteId: "site-b", k: "k3", mode: "chat", i: 80, o: 40, c: 0.008, l: 300, a: true },
  { at: "2026-10-02T08:00:00.000Z", siteId: "site-a", k: "k2", mode: "chat", i: 90, o: 45, c: 0.009, l: 500, a: false },
  { at: "2026-10-02T09:00:00.000Z", siteId: "site-a", k: "k4", mode: "voice", i: 300, o: 150, c: 0.03, l: 1500, a: true },
  { at: "2026-10-02T11:00:00.000Z", siteId: "site-b", k: "k3", mode: "chat", i: 110, o: 55, c: 0.011, l: 700, g: "crisis", a: true },
  { at: "2026-10-02T12:00:00.000Z", siteId: "site-b", k: "k5", mode: "voice", i: 250, o: 125, c: 0.025, l: 1000, a: false },
  { at: "2026-10-03T01:00:00.000Z", siteId: "site-a", k: "k1", mode: "chat", i: 70, o: 35, c: 0.007, l: 200, a: true },
  { at: "2026-10-03T02:00:00.000Z", siteId: "site-a", k: "k6", mode: "chat", i: 60, o: 30, c: 0.006, l: 100, a: true },
  { at: "2026-10-03T03:00:00.000Z", siteId: "site-b", k: "k5", mode: "chat", i: 130, o: 65, c: 0.013, l: 900, g: "claims", a: true },
  { at: "2026-10-03T04:00:00.000Z", siteId: "site-b", k: "k7", mode: "voice", i: 140, o: 70, c: 0.014, l: 600, a: true },
  { at: "2026-10-03T23:00:00.000Z", siteId: "site-b", k: "k3", mode: "chat", i: 50, o: 25, c: 0.005, l: 250, a: false },
  { at: "2026-10-03T12:00:00.000Z", siteId: "site-a", k: "k2", mode: "chat", i: 40, o: 20, c: 0.004, l: 150, a: true },
  // outside the range: just before `from`, and exactly at `to` (exclusive)
  { at: "2026-09-30T23:59:59.999Z", siteId: "site-a", k: "k9", mode: "chat", i: 1000, o: 1000, c: 9, l: 99999, g: "citation", a: false },
  { at: "2026-10-04T00:00:00.000Z", siteId: "site-b", k: "k8", mode: "voice", i: 1000, o: 1000, c: 9, l: 99999, g: "citation", a: false },
];
const RANGE = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-04T00:00:00.000Z", usdInrRate: 84 };

async function seeded(rows: Seed[] = S) {
  const { db, store } = newStore();
  for (const r of rows) {
    await store.usage.record({
      at: r.at,
      siteId: r.siteId,
      ...(r.k === null ? {} : { studentKey: studentKeyOf(HMAC_KEY, r.siteId, r.k) }),
      mode: r.mode,
      inputTokens: r.i,
      outputTokens: r.o,
      costUsd: r.c,
      latencyMs: r.l,
      ...(r.g ? { guardrail: r.g } : {}),
      answered: r.a,
    } as never);
  }
  return db;
}

test("VA17: aggregateMetrics golden table, all sites (values hand-computed from the seed above)", async () => {
  const m = await aggregateMetrics(await seeded(), RANGE);
  assert.deepEqual(m.perSiteDay, [
    { siteId: "site-a", day: "2026-10-01", conversations: 3 },
    { siteId: "site-b", day: "2026-10-01", conversations: 1 },
    { siteId: "site-a", day: "2026-10-02", conversations: 2 },
    { siteId: "site-b", day: "2026-10-02", conversations: 2 },
    { siteId: "site-a", day: "2026-10-03", conversations: 3 },
    { siteId: "site-b", day: "2026-10-03", conversations: 3 },
  ]);
  assert.equal(m.activeStudents, 7);
  assert.deepEqual(m.chatVsVoice, { chat: 10, voice: 4 });
  assert.equal(m.tokens, 2610); // 1740 input + 870 output
  assert.equal(m.costUsd, 0.174);
  assert.equal(m.costPerStudentInr, 2.088); // 0.174 x 84 / 7
  assert.equal(m.latencyP50, 500); // nearest-rank, n=14: ceil(0.50 x 14) = 7th of 100,150,200,250,300,400,500,...
  assert.equal(m.latencyP95, 1500); // ceil(0.95 x 14) = 14th
  assert.equal(m.guardrailHits, 3);
  assert.equal(m.unanswered, 3);
});

test("VA17: siteId filters; rows outside the range and other sites are excluded", async () => {
  const m = await aggregateMetrics(await seeded(), { ...RANGE, siteId: "site-a" });
  assert.deepEqual(m.perSiteDay, [
    { siteId: "site-a", day: "2026-10-01", conversations: 3 },
    { siteId: "site-a", day: "2026-10-02", conversations: 2 },
    { siteId: "site-a", day: "2026-10-03", conversations: 3 },
  ]);
  assert.equal(m.activeStudents, 4);
  assert.deepEqual(m.chatVsVoice, { chat: 6, voice: 2 });
  assert.equal(m.tokens, 1470);
  assert.equal(m.costUsd, 0.098);
  assert.equal(m.costPerStudentInr, 2.058); // 0.098 x 84 / 4
  assert.equal(m.latencyP50, 400); // n=8: 4th of 100,150,200,400,...
  assert.equal(m.latencyP95, 1500);
  assert.equal(m.guardrailHits, 1);
  assert.equal(m.unanswered, 1);
});

test("VA17: from is inclusive and to is exclusive (the boundary rows prove both)", async () => {
  const db = await seeded();
  const exactFrom = await aggregateMetrics(db, { from: "2026-10-01T00:00:00.000Z", to: "2026-10-01T00:00:00.001Z", usdInrRate: 84 });
  assert.equal(exactFrom.chatVsVoice.chat + exactFrom.chatVsVoice.voice, 1, "the row at exactly `from` is in");
  const justBeforeTo = await aggregateMetrics(db, { from: "2026-10-03T23:59:59.999Z", to: "2026-10-04T00:00:00.000Z", usdInrRate: 84 });
  assert.equal(justBeforeTo.chatVsVoice.chat + justBeforeTo.chatVsVoice.voice, 0, "the row at exactly `to` is out");
  const upToTo = await aggregateMetrics(db, { from: "2026-10-04T00:00:00.000Z", to: "2026-10-04T00:00:00.001Z", usdInrRate: 84 });
  assert.equal(upToTo.chatVsVoice.voice, 1, "and it is in the next range");
});

test("VA17: an empty range returns zeros (no NaN, no Infinity); rows without a studentKey give 0 INR per student", async () => {
  const db = await seeded();
  const empty = await aggregateMetrics(db, { from: "2027-01-01T00:00:00.000Z", to: "2027-01-02T00:00:00.000Z", usdInrRate: 84 });
  assert.deepEqual(empty, {
    perSiteDay: [],
    activeStudents: 0,
    chatVsVoice: { chat: 0, voice: 0 },
    tokens: 0,
    costUsd: 0,
    costPerStudentInr: 0,
    latencyP50: 0,
    latencyP95: 0,
    guardrailHits: 0,
    unanswered: 0,
  });
  const anon = await seeded([{ at: "2026-10-01T00:00:00.000Z", siteId: "site-a", k: null, mode: "chat", i: 1, o: 1, c: 0.5, l: 10, a: true }]);
  const m = await aggregateMetrics(anon, RANGE);
  assert.equal(m.activeStudents, 0);
  assert.equal(m.costUsd, 0.5);
  assert.equal(m.costPerStudentInr, 0);
  assert.ok(Number.isFinite(m.costPerStudentInr));
});

test("VA17: the INR rate is a config value; the default is exported and used when none is passed", async () => {
  assert.ok(Number.isFinite(DEFAULT_USD_INR_RATE) && DEFAULT_USD_INR_RATE > 0);
  const db = await seeded();
  const withDefault = await aggregateMetrics(db, { from: RANGE.from, to: RANGE.to });
  assert.equal(withDefault.costPerStudentInr, Number(((0.174 * DEFAULT_USD_INR_RATE) / 7).toFixed(9)));
  await assert.rejects(aggregateMetrics(db, { ...RANGE, usdInrRate: 0 }), AdminStoreError);
  await assert.rejects(aggregateMetrics(db, { ...RANGE, usdInrRate: Number.NaN }), AdminStoreError);
});

test("VA17: an inverted, equal or unparseable range is refused", async () => {
  const db = await seeded();
  for (const q of [
    { from: RANGE.to, to: RANGE.from },
    { from: RANGE.from, to: RANGE.from },
    { from: "garbage", to: RANGE.to },
    { from: RANGE.from, to: "" },
  ]) {
    await assert.rejects(aggregateMetrics(db, q), (e: unknown) => e instanceof AdminStoreError && (e as AdminStoreError).code === "range");
  }
});

test("VA17: nearest-rank percentile edge cases (n=0, 1, 2, 20, 100, unsorted input)", () => {
  assert.equal(nearestRank([], 50), 0);
  assert.equal(nearestRank([7], 50), 7);
  assert.equal(nearestRank([7], 95), 7);
  assert.equal(nearestRank([1, 2], 50), 1);
  assert.equal(nearestRank([1, 2], 95), 2);
  const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.equal(nearestRank(twenty, 50), 10);
  assert.equal(nearestRank(twenty, 95), 19);
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(nearestRank(hundred, 95), 95);
  assert.equal(nearestRank(hundred, 50), 50);
  assert.equal(nearestRank([5, 1, 4, 2, 3], 50), 3);
});


test('S12 encrypted credentials cannot survive a kind/site/destination/ref retarget', async()=>{
 const original={id:'bound-db',siteId:'vidysea',kind:'postgres' as const,config:{platform:'vidysea',host:'trusted.example',port:5432,database:'fixture',user:'reader',sslmode:'require',passwordRef:'VIDYSEA_DB_PASSWORD'}};
 for(const patch of [{siteId:'other'}, {kind:'github' as const}, {config:{host:'attacker.example'}}, {config:{database:'other'}}, {config:{user:'other'}}, {config:{port:9999}}, {config:{sslmode:'verify-full'}}, {config:{platform:'pathlynks'}}, {config:{passwordRef:'VIDYSEA_DB_OTHER'}}]){
  const {store}=newStore(); await store.sources.upsert(original); await store.sources.setSecret(original.id,DUMMY_SECRET);
  await assert.rejects(store.sources.upsert({...original,...patch,config:{...original.config,...patch.config}}),AdminStoreError);
  assert.equal(await store.sources.readSecret(original.id),DUMMY_SECRET); assert.equal((await store.sources.get(original.id))!.config.host,'trusted.example');
 }
 const {store}=newStore(); await store.sources.upsert(original); await store.sources.setSecret(original.id,DUMMY_SECRET);
 await store.sources.upsert({...original,config:{...original.config,enabled:false}}); assert.equal((await store.sources.get(original.id))!.config.enabled,false);
});


test('S12 source retarget racing secret provisioning cannot attach old secret to new destination',async()=>{
 for(const first of ['retarget','secret']){
  const {store,db}=newStore();const original={id:'race-db',siteId:'vidysea',kind:'postgres' as const,config:{platform:'vidysea',host:'trusted.example',port:5432,database:'fixture',user:'reader',sslmode:'require',passwordRef:'VIDYSEA_DB_PASSWORD'}};
  await store.sources.upsert(original);const collection=db.collection('sources');const update=collection.updateOne.bind(collection);let injected=false;
  collection.updateOne=(async(...args:Parameters<typeof update>)=>{
   if(!injected){injected=true;if(first==='retarget')await store.sources.setSecret(original.id,DUMMY_SECRET);else await store.sources.upsert({...original,config:{...original.config,host:'new.example'}});}
   return update(...args);
  }) as typeof collection.updateOne;
  try {
   if(first==='retarget'){
    await assert.rejects(store.sources.upsert({...original,config:{...original.config,host:'new.example'}}),AdminStoreError);
    assert.equal((await store.sources.get(original.id))!.config.host,'trusted.example');assert.equal(await store.sources.readSecret(original.id),DUMMY_SECRET);
   }else{
    await assert.rejects(store.sources.setSecret(original.id,DUMMY_SECRET),AdminStoreError);assert.equal((await store.sources.get(original.id))!.hasSecret,false);assert.equal((await store.sources.get(original.id))!.config.host,'new.example');
   }
  }finally{collection.updateOne=update;}
 }
});
