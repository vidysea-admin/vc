/**
 * T-025 (contract B21, D-021): the VC HTTP API. Offline (B8): the in-process @vc/db fake behind the
 * PRODUCTION tenant wiring (createTenantWiring: tenantScopedDb + the real LangGraph Mongo saver over
 * tenantScopedClient), a MockProvider, and JWTs signed here with locally generated keys. Synthetic
 * data only (B13). Assertions read the RAW fake collections (B14: outcome, not construction).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { SignJWT, type JWTPayload } from "jose";
import { COLLECTION_NAMES, VC_DB_NAME, erasureFenceKey, getVcDb, tenantScopedDb } from "@vc/db";
import { createFakeMongoClient, INDEX_PLAN, TEST_ERASURE_CONFIG, type FakeDb } from "@vc/db/testing";
import { MockProvider } from "@vc/providers";
import { InMemoryWebhookEmitGapLedger, InMemoryWebhookOutbox, type WebhookEmitGapLedger, type WebhookEvent, type WebhookOutbox } from "@vc/engine";
import { createJwtVerifier, jwtConfigFromEnv } from "../src/auth.js";
import { API_ROUTES, createApiHandler, createApiServer, createTenantWiring, type ApiDeps, type ApiLogLine, type ApiRequest } from "../src/server.js";
import { OPENAPI_DOCUMENT } from "../src/openapi.js";
import { startApi } from "../src/index.js";

const SKILLS_DIR = fileURLToPath(new URL("../../../skills", import.meta.url));
const ISSUER = "https://issuer.synthetic.test";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const verifier = createJwtVerifier(jwtConfigFromEnv({ VC_JWT_ISSUER: ISSUER, VC_JWT_PUBLIC_KEY: PEM }));

const STUDENT = "student-synthetic-1";
const SESSION = "session-synthetic-1";
const ALL_COLLECTIONS = Object.values(COLLECTION_NAMES);

type AnyDoc = Record<string, unknown>;

async function token(
  claims: Record<string, unknown>,
  opts: { key?: Parameters<SignJWT["sign"]>[0]; alg?: string; iss?: string; exp?: number } = {},
): Promise<string> {
  return new SignJWT(claims as JWTPayload)
    .setProtectedHeader({ alg: opts.alg ?? "RS256" })
    .setIssuer(opts.iss ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 300)
    .sign(opts.key ?? keys.privateKey);
}

const as = (tenant: string, counsellorId: string, role: "counsellor" | "admin" | "approver") => token({ tenant, counsellorId, role });

function mockProvider(): MockProvider {
  const cite = (key: string, value: unknown, quote: string, turnId: string) => ({
    key,
    value,
    source: { type: "transcript", quote, turnId },
    confidence: 0.85,
    purposeTags: ["profile_synthesis"],
    sensitivity: "low",
  });
  return new MockProvider({
    responses: {
      "fact-extraction": {
        facts: [
          cite("targetCountry", "Canada", "study computer science in Canada", "t1"),
          cite("budget_inr_per_year", 2000000, "around 20 lakh rupees a year", "t3"),
        ],
      },
      "session-summary": { summary: "Student wants computer science in Canada; budget around 20 lakh a year." },
    },
  });
}

const START_BODY = {
  sessionEndedAt: "2026-09-25T10:00:00.000Z",
  turns: [
    { turnId: "t1", speaker: "student", lang: "en", text: "I want to study computer science in Canada.", translatedText: "I want to study computer science in Canada.", ts: 1 },
    { turnId: "t2", speaker: "counsellor", lang: "en", text: "What budget does your family have in mind?", translatedText: "What budget does your family have in mind?", ts: 2 },
    { turnId: "t3", speaker: "student", lang: "en", text: "We can manage around 20 lakh rupees a year.", translatedText: "We can manage around 20 lakh rupees a year.", ts: 3 },
  ],
};

interface World {
  handler: ReturnType<typeof createApiHandler>;
  fakeDb: FakeDb;
  calls: { db: string[]; graph: string[] };
  logs: ApiLogLine[];
}

function world(overrides: Partial<ApiDeps> = {}): World {
  const fake = createFakeMongoClient();
  const db = getVcDb(fake.client);
  const fakeDb = fake.dbFor(VC_DB_NAME);
  for (const spec of INDEX_PLAN) {
    if (!spec.unique) continue;
    fakeDb.collection<{ _id: string }>(spec.collection).declareUniqueIndex(Object.keys(spec.keys), {
      partialFilterExpression: spec.partialFilterExpression,
    });
  }
  const wiring = createTenantWiring({ client: fake.client, db, provider: mockProvider(), skillsDir: SKILLS_DIR });
  const calls = { db: [] as string[], graph: [] as string[] };
  const logs: ApiLogLine[] = [];
  const handler = createApiHandler({
    verifier,
    dbForTenant: (t) => {
      calls.db.push(t);
      return wiring.dbForTenant(t);
    },
    graphForTenant: (t) => {
      calls.graph.push(t);
      return wiring.graphForTenant(t);
    },
    log: (l) => logs.push(l),
    // T-029: a synthetic approver-workflow config (synthetic key and address, autoDelete false).
    erasureConfig: () => TEST_ERASURE_CONFIG,
    ...overrides,
  });
  return { handler, fakeDb, calls, logs };
}

async function call(w: World, method: string, url: string, opts: { token?: string; body?: unknown; auth?: string } = {}) {
  const headers: ApiRequest["headers"] = {};
  if (opts.auth !== undefined) headers.authorization = opts.auth;
  else if (opts.token !== undefined) headers.authorization = `Bearer ${opts.token}`;
  const res = await w.handler({
    method,
    url,
    headers,
    readBody: async () => (opts.body === undefined ? "" : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)),
  });
  return { ...res, json: JSON.parse(res.body) as AnyDoc };
}

function rawAll(fakeDb: FakeDb): Record<string, AnyDoc[]> {
  const out: Record<string, AnyDoc[]> = {};
  for (const name of ALL_COLLECTIONS) {
    out[name] = fakeDb
      .collection<{ _id: string }>(name)
      .all()
      .map((d) => JSON.parse(JSON.stringify(d)) as AnyDoc)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return out;
}

function docCount(fakeDb: FakeDb): number {
  return Object.values(rawAll(fakeDb)).reduce((n, docs) => n + docs.length, 0);
}

/** Seeds consent through the tenant-scoped Db (so it is stamped like any other document). */
async function seedConsent(w: World, tenant: string, studentId = STUDENT): Promise<void> {
  await tenantScopedDb(w.fakeDb as unknown as Parameters<typeof tenantScopedDb>[0], tenant)
    .collection(COLLECTION_NAMES.consents)
    .insertOne({
      _id: `consent-${studentId}`,
      studentId,
      guardianConsent: true,
      purposes: ["profile_synthesis", "counselling_session"],
      recordedAt: "2026-09-01T00:00:00.000Z",
      minor: true,
    } as never);
}

/** Tenant A runs a whole scribe: start -> approval pending. */
async function scribeToApproval(w: World, tenant = "tenant-a"): Promise<void> {
  await seedConsent(w, tenant);
  const res = await call(w, "POST", `/v1/students/${STUDENT}/sessions/${SESSION}/scribe`, {
    token: await as(tenant, "counsellor-1", "counsellor"),
    body: START_BODY,
  });
  assert.equal(res.status, 200, res.body);
  assert.equal(res.json.kind, "awaiting_approval", res.body);
}

function concrete(path: string): string {
  return path
    .replace("{studentId}", STUDENT)
    .replace("{sessionId}", SESSION)
    .replace("{requestId}", "0123456789abcdef01234567");
}

// ---------------------------------------------------------------------------
// 401: every failure identical, nothing read or written
// ---------------------------------------------------------------------------

test("T-025 api: every auth failure on every protected route is the same 401, and no Db or graph is touched", async () => {
  const w = world();
  await scribeToApproval(w);
  w.calls.db.length = 0;
  w.calls.graph.length = 0;
  const before = rawAll(w.fakeDb);
  const now = Math.floor(Date.now() / 1000);
  const bad: [string, { auth?: string; token?: string }][] = [
    ["no header", {}],
    ["Basic", { auth: "Basic dXNlcjpwYXNz" }],
    ["bearer, empty", { auth: "Bearer " }],
    ["garbage", { token: "not.a.jwt" }],
    ["expired", { token: await token({ tenant: "tenant-a", counsellorId: "c1", role: "admin" }, { exp: now - 3600 }) }],
    ["wrong issuer", { token: await token({ tenant: "tenant-a", counsellorId: "c1", role: "admin" }, { iss: "https://evil.test" }) }],
    ["wrong key", { token: await token({ tenant: "tenant-a", counsellorId: "c1", role: "admin" }, { key: otherKeys.privateKey }) }],
    [
      "alg confusion",
      { token: await token({ tenant: "tenant-a", counsellorId: "c1", role: "admin" }, { key: new TextEncoder().encode(PEM), alg: "HS256" }) },
    ],
    ["bad tenant claim", { token: await token({ tenant: "tenant:a", counsellorId: "c1", role: "admin" }) }],
    ["no role", { token: await token({ tenant: "tenant-a", counsellorId: "c1" }) }],
  ];
  const protectedRoutes = API_ROUTES.filter((r) => r.roles !== "public");
  assert.equal(protectedRoutes.length, 13, "T-025's 10 routes + T-029's reconfirm, approve and reject");
  let first: { body: string; headers: Record<string, string> } | undefined;
  for (const route of protectedRoutes) {
    for (const [label, cred] of bad) {
      const res = await call(w, route.method, concrete(route.path), { ...cred, body: route.body ? { action: "approve", reason: "student_request" } : undefined });
      assert.equal(res.status, 401, `${route.id} / ${label}`);
      first ??= { body: res.body, headers: res.headers };
      assert.equal(res.body, first.body, `${route.id} / ${label}: identical body`);
      assert.deepEqual(res.headers, first.headers, `${route.id} / ${label}: identical headers`);
    }
  }
  assert.equal(first!.body, '{"error":"unauthorized"}');
  assert.equal(first!.headers["www-authenticate"], 'Bearer realm="vc-api"');
  assert.deepEqual(w.calls, { db: [], graph: [] }, "no Db and no graph was requested for any 401");
  assert.deepEqual(rawAll(w.fakeDb), before, "no document changed");
});

test("T-025 api: a role outside a route's roles is 403 before any Db access; unknown paths 404; wrong method 405 + Allow", async () => {
  const w = world();
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  for (const route of API_ROUTES.filter((r) => Array.isArray(r.roles) && !r.roles.includes("counsellor"))) {
    const res = await call(w, route.method, concrete(route.path), { token: counsellor });
    assert.equal(res.status, 403, route.id);
    assert.deepEqual(res.json, { error: "forbidden" });
  }
  // T-029: the approver role reaches ONLY approve / reject; counsellor and admin never reach those.
  const approver = await as("tenant-a", "approver-1", "approver");
  const admin = await as("tenant-a", "admin-1", "admin");
  for (const route of API_ROUTES.filter((r) => Array.isArray(r.roles) && !r.roles.includes("approver"))) {
    const res = await call(w, route.method, concrete(route.path), { token: approver });
    assert.equal(res.status, 403, `approver on ${route.id}`);
  }
  for (const id of ["approveErasure", "rejectErasure"]) {
    const route = API_ROUTES.find((r) => r.id === id)!;
    assert.deepEqual(route.roles, ["approver"], id);
    assert.equal((await call(w, route.method, concrete(route.path), { token: admin })).status, 403, `admin on ${id}`);
  }
  assert.deepEqual(w.calls, { db: [], graph: [] });
  assert.equal((await call(w, "GET", "/v1/nothing", { token: counsellor })).status, 404);
  assert.equal((await call(w, "GET", `/v1/students/${STUDENT}/profile/`, { token: counsellor })).status, 404, "a trailing slash is not the route");
  const wrong = await call(w, "DELETE", `/v1/students/${STUDENT}/sessions/${SESSION}/approval`, { token: counsellor });
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.allow, "GET, POST");
});

test("T-025 api: bad ids, bad JSON and bad bodies are 400 before any Db access, with issue paths but no values", async () => {
  const w = world();
  const admin = await as("tenant-a", "admin-1", "admin");
  const cases: [string, string, unknown][] = [
    ["GET", "/v1/students/-bad/export", undefined],
    ["GET", "/v1/students/a%2Fb/export", undefined],
    ["GET", `/v1/students/${"x".repeat(129)}/export`, undefined],
    ["POST", "/v1/erasure-requests/not-an-object-id/confirm", undefined],
    ["GET", `/v1/students/${STUDENT}/profile`, undefined],
    ["GET", `/v1/students/${STUDENT}/profile?purpose=Bad-Purpose`, undefined],
    ["POST", `/v1/students/${STUDENT}/sessions/${SESSION}/scribe`, "{not json"],
    ["POST", `/v1/students/${STUDENT}/sessions/${SESSION}/scribe`, { ...START_BODY, studentId: "someone-else" }],
    ["POST", `/v1/students/${STUDENT}/sessions/${SESSION}/scribe`, { ...START_BODY, turns: [] }],
    ["POST", `/v1/students/${STUDENT}/sessions/${SESSION}/approval`, { action: "delete-everything" }],
    ["POST", `/v1/students/${STUDENT}/erasure-requests`, { reason: "because SECRET-VALUE" }],
  ];
  for (const [method, url, body] of cases) {
    const res = await call(w, method, url, { token: admin, body });
    assert.equal(res.status, 400, `${method} ${url}: ${res.body}`);
    assert.doesNotMatch(res.body, /SECRET-VALUE|someone-else/);
  }
  assert.equal(docCount(w.fakeDb), 0, "nothing was written");
  assert.deepEqual(w.calls.graph, []);
});

// ---------------------------------------------------------------------------
// The scribe flow over the tenant-scoped wiring
// ---------------------------------------------------------------------------

test("T-025 api: scribe start -> approval diff -> approve -> profile, with every stored document stamped with the token's tenant", async () => {
  const w = world();
  await scribeToApproval(w, "tenant-a");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;

  const pending = await call(w, "GET", `${base}/approval`, { token: counsellor });
  assert.equal(pending.status, 200);
  assert.equal(pending.json.kind, "awaiting_approval");
  const request = pending.json.request as { facts: { key: string }[] };
  assert.deepEqual(request.facts.map((f) => f.key).sort(), ["budget_inr_per_year", "targetCountry"]);

  const transcript = await call(w, "GET", `${base}/transcript`, { token: counsellor });
  assert.equal(transcript.status, 200);
  assert.equal((transcript.json.turns as unknown[]).length, 3);

  const decided = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "approve" } });
  assert.equal(decided.status, 200, decided.body);
  assert.equal(decided.json.kind, "done");

  const again = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "reject" } });
  assert.equal(again.status, 200);
  assert.equal(again.json.kind, "already_resolved", "a second decision is not applied");

  const profile = await call(w, "GET", `/v1/students/${STUDENT}/profile?purpose=profile_synthesis`, { token: counsellor });
  assert.equal(profile.status, 200, profile.body);
  assert.deepEqual((profile.json.facts as { key: string }[]).map((f) => f.key), ["budget_inr_per_year", "targetCountry"]);

  const resumed = await call(w, "POST", `${base}/scribe/resume`, { token: counsellor });
  assert.equal(resumed.status, 200);

  // Outcome: every raw document the flow wrote carries tenantId "tenant-a", checkpoints included.
  const raw = rawAll(w.fakeDb);
  const written = Object.entries(raw).flatMap(([name, docs]) => docs.map((d) => ({ name, d })));
  assert.ok(written.some((x) => x.name === "facts") && written.some((x) => x.name === "scribe_checkpoints"));
  for (const { name, d } of written) assert.equal(d.tenantId, "tenant-a", `${name} document not stamped`);
  assert.deepEqual([...new Set(w.calls.db)], ["tenant-a"]);
  assert.deepEqual([...new Set(w.calls.graph)], ["tenant-a"]);
});

// ---------------------------------------------------------------------------
// T-034: webhook emission hooks (B21 "Events")
// ---------------------------------------------------------------------------

test("T-034 api: decideApproval enqueues one fact.approved webhook event per DURABLY WRITTEN fact (read back via getFactsByIds, not re-derived from the response), carrying B2 provenance", async () => {
  const outbox = new InMemoryWebhookOutbox();
  const w = world({ webhooks: { outboxForTenant: () => outbox, destinationUrl: "http://client.invalid/hook" } });
  await scribeToApproval(w, "tenant-a");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;

  const decided = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "approve" } });
  assert.equal(decided.status, 200, decided.body);
  assert.equal(decided.json.kind, "done");

  const records = await outbox.list();
  assert.equal(records.length, 2, "one event per written fact");
  const events = records.map((r) => r.event as WebhookEvent & { type: "fact.approved" });
  assert.deepEqual(
    events.map((e) => e.data.fact.key).sort(),
    ["budget_inr_per_year", "targetCountry"],
  );
  for (const event of events) {
    assert.equal(event.type, "fact.approved");
    assert.equal(event.tenantId, "tenant-a");
    assert.equal(event.data.studentId, STUDENT);
    assert.equal(event.data.sessionId, SESSION);
    assert.equal(event.data.fact.source.type, "transcript", "the fact's own persisted citation, unchanged");
  }
  assert.ok(records.every((r) => r.destinationUrl === "http://client.invalid/hook"));

  // A retried decision ("already_resolved") is not applied, so it must not enqueue a second time.
  const again = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "reject" } });
  assert.equal(again.json.kind, "already_resolved");
  assert.equal((await outbox.list()).length, 2, "no extra event from the loser's request");
});

test("T-034 api: with no webhooks configured, an approve decision writes facts exactly as before and enqueues nothing (the emission hook is a pure no-op)", async () => {
  const w = world();
  await scribeToApproval(w, "tenant-a");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;
  const decided = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "approve" } });
  assert.equal(decided.status, 200, decided.body);
  assert.equal(w.fakeDb.collection<{ _id: string }>("facts").size(), 2);
});

test("T-034 api: a webhook enqueue failure is logged (webhook_enqueue_failed) but never turns an already-successful approval into an error response", async () => {
  const failingOutbox: WebhookOutbox = {
    enqueue: async () => {
      throw new Error("boom: destination store unavailable");
    },
    get: async () => undefined,
    update: async () => {
      throw new Error("unused");
    },
    list: async () => [],
  };
  const w = world({ webhooks: { outboxForTenant: () => failingOutbox, destinationUrl: "http://client.invalid/hook" } });
  await scribeToApproval(w, "tenant-a");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;
  const decided = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "approve" } });
  assert.equal(decided.status, 200, decided.body);
  assert.equal(decided.json.kind, "done");
  assert.equal(w.fakeDb.collection<{ _id: string }>("facts").size(), 2, "the write itself is unaffected by the enqueue failure");
  assert.ok(
    w.logs.some((l) => l.event === "api_request_failed" && l.route === "decideApproval" && l.error.startsWith("webhook_enqueue_failed:")),
    "the failure is logged",
  );
});

// ---------------------------------------------------------------------------
// T-042 (ISS-085): the two webhook fact-loss leaks -- a short read-back (leak 1) and a swallowed
// enqueue failure (leak 2) -- are now detected, alerted and, when a gap ledger is configured,
// recorded somewhere recoverable, while never turning an already-successful write into an error
// response and never alerting on a legitimate B15 erasure race.
// ---------------------------------------------------------------------------

/**
 * Makes the NEXT `_id: {$in: [...]}` read against `name` return one fewer document than actually
 * matches -- exactly (and only) getFactsByIds' own query shape (packages/db/src/facts.ts:1004
 * `find({studentId, _id: {$in: ids}})`); no other caller in this flow queries facts by `_id.$in`,
 * so every OTHER find() against this collection (readActiveProfile, applyApprovedDiff's own reads,
 * etc.) is untouched. This simulates ISS-085 leak 1 (an id written but not found on read-back --
 * replication lag, a concurrent write, an applyApprovedDiff defect) without needing to know the
 * fact's actual generated _id ahead of time. `onTrigger`, when given, runs (and is awaited) at the
 * exact moment the short read fires -- used by the erasure-race test below to plant the fence
 * AFTER the write has already succeeded but BEFORE getFactsByIds' own read-back, which is the only
 * ordering that is a real race (a fence already up at request start makes applyApprovedDiff itself
 * refuse the whole approval as `kind: "fenced"` before any write happens, never reaching this path).
 */
function dropOneFromNextIdInRead(fakeDb: FakeDb, name: string, onTrigger?: () => Promise<void>): void {
  const coll = fakeDb.collection<{ _id: string }>(name);
  const originalFind = coll.find.bind(coll);
  coll.find = ((...args: Parameters<typeof originalFind>) => {
    const cursor = originalFind(...args);
    const filter = args[0] as { _id?: { $in?: unknown[] } } | undefined;
    if (filter?._id && Array.isArray(filter._id.$in)) {
      const originalToArray = cursor.toArray.bind(cursor);
      cursor.toArray = async () => {
        if (onTrigger) await onTrigger();
        return (await originalToArray()).slice(0, -1);
      };
    }
    return cursor;
  }) as typeof coll.find;
}

test("T-042 api (ISS-085 leak 1): a short read-back NOT explained by an erasure fence is alerted and recorded as a recoverable gap; the facts that WERE found still emit their events", async () => {
  const outbox = new InMemoryWebhookOutbox();
  const gapLedgers = new Map<string, WebhookEmitGapLedger>();
  const gapsForTenant = (tenantId: string): WebhookEmitGapLedger => {
    let ledger = gapLedgers.get(tenantId);
    if (!ledger) {
      ledger = new InMemoryWebhookEmitGapLedger();
      gapLedgers.set(tenantId, ledger);
    }
    return ledger;
  };
  const w = world({ webhooks: { outboxForTenant: () => outbox, destinationUrl: "http://client.invalid/hook", gapsForTenant } });
  await scribeToApproval(w, "tenant-a");
  dropOneFromNextIdInRead(w.fakeDb, "facts");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;

  const decided = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "approve" } });
  assert.equal(decided.status, 200, decided.body);
  assert.equal(decided.json.kind, "done");
  assert.equal(w.fakeDb.collection<{ _id: string }>("facts").size(), 2, "both facts are durably written regardless of the read-back gap");

  // One of the two facts came back short: exactly one event enqueued, not two.
  assert.equal((await outbox.list()).length, 1, "the read-back gap must not silently claim both facts were notified");

  assert.ok(
    w.logs.some((l) => l.event === "api_request_failed" && l.route === "decideApproval" && l.error.startsWith("webhook_fact_readback_gap:1_of_2_missing")),
    "the gap is alerted, not silent",
  );

  const gaps = await gapsForTenant("tenant-a").list();
  assert.equal(gaps.length, 1, "exactly one recoverable gap entry for the one missing fact");
  assert.equal(gaps[0]!.kind, "readback-gap");
  assert.equal(gaps[0]!.studentId, STUDENT);
  assert.equal(gaps[0]!.sessionId, SESSION);
  assert.equal(gaps[0]!.detail, "missing-on-readback");
});

test("T-042 api (ISS-085 leak 1, erasure interaction): the SAME short read-back, explained by a concurrent B15 erasure fence that lands AFTER the write, is never alerted or recorded", async () => {
  const outbox = new InMemoryWebhookOutbox();
  const gapLedger = new InMemoryWebhookEmitGapLedger();
  const w = world({ webhooks: { outboxForTenant: () => outbox, destinationUrl: "http://client.invalid/hook", gapsForTenant: () => gapLedger } });
  await scribeToApproval(w, "tenant-a");
  // The fence is planted exactly when getFactsByIds' short read fires -- i.e. AFTER applyApprovedDiff's
  // own pre-write fence check already passed and the facts were durably written. This is the only
  // realistic ordering for "a concurrent erasure explains the gap": a fence already up at request
  // start would make applyApprovedDiff itself refuse the whole approval as `kind: "fenced"` first.
  // Seeded through the tenant-scoped Db (like seedConsent above) so the _id/tenantId are stamped
  // exactly as isStudentFenced's own tenant-scoped read (checkFactReadbackGap -> dbForTenant) expects
  // -- a raw, unscoped seed would carry an unprefixed _id the scoped lookup can never match.
  dropOneFromNextIdInRead(w.fakeDb, "facts", async () => {
    await tenantScopedDb(w.fakeDb as unknown as Parameters<typeof tenantScopedDb>[0], "tenant-a")
      .collection(COLLECTION_NAMES.erasure_fences)
      .insertOne({
        _id: erasureFenceKey(STUDENT),
        createdAt: new Date().toISOString(),
      } as never);
  });
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;

  const decided = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "approve" } });
  assert.equal(decided.status, 200, decided.body);
  assert.equal(decided.json.kind, "done");

  assert.equal((await outbox.list()).length, 1, "still emits for the fact that WAS found");
  assert.ok(
    !w.logs.some((l) => l.error?.startsWith("webhook_fact_readback_gap")),
    "a fence-explained gap must never be alerted as a defect",
  );
  assert.equal((await gapLedger.list()).length, 0, "a fence-explained gap must never be recorded either -- it is not a defect");
});

/**
 * Makes the erasure-fence collection's `findOne` throw, but ONLY for the options-less call shape
 * that checkFactReadbackGap's own isStudentFenced call uses (packages/db/src/erasure.ts:667-671's
 * `options: {timeoutMS?: number} = {}` default -- checkFactReadbackGap invokes it with no third
 * argument at all, so `options` is always `{}` there). The engine's own pre/post-write fence checks
 * (applyApprovedDiff's assertStudentNotFenced pre-check and its post-write check) always pass an
 * explicit `{timeoutMS: FENCE_POSTCHECK_TIMEOUT_MS}`. Current graph consent/history reads may
 * also use options-less fence calls, so this lever is installed only by the actual post-write
 * webhook read-back callback, keeping those earlier reads untouched. The write path
 * itself is provably unaffected by this lever -- isolating the ISS-090 defect to the fence check
 * `checkFactReadbackGap` itself performs, after the write has already durably succeeded.
 */
function throwOnFenceCheckOnly(fakeDb: FakeDb): void {
  const coll = fakeDb.collection<{ _id: string }>(COLLECTION_NAMES.erasure_fences);
  const originalFindOne = coll.findOne.bind(coll);
  coll.findOne = (async (filter: unknown, options?: { timeoutMS?: number }) => {
    if (!options || Object.keys(options).length === 0) {
      throw new Error("boom: erasure_fences read unavailable (ISS-090 lever)");
    }
    return originalFindOne(filter as never);
  }) as typeof coll.findOne;
}

test("T-042 api (ISS-090): a genuine read-back gap whose fence check itself throws is still a 200 (the write already succeeded), alerted twice (the fence-check failure AND the now-unexplained gap) and recorded -- never a 500", async () => {
  const outbox = new InMemoryWebhookOutbox();
  const gapLedger = new InMemoryWebhookEmitGapLedger();
  const w = world({ webhooks: { outboxForTenant: () => outbox, destinationUrl: "http://client.invalid/hook", gapsForTenant: () => gapLedger } });
  await scribeToApproval(w, "tenant-a");
  let actualReadbackReached = false;
  dropOneFromNextIdInRead(w.fakeDb, "facts", async () => {
    actualReadbackReached = true;
    throwOnFenceCheckOnly(w.fakeDb);
  });
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;

  const decided = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "approve" } });
  assert.equal(actualReadbackReached, true, "actual post-write webhook read-back phase was reached");
  assert.equal(decided.status, 200, decided.body);
  assert.equal(decided.json.kind, "done");
  assert.equal(w.fakeDb.collection<{ _id: string }>("facts").size(), 2, "both facts are durably written even though the fence check failed");

  assert.equal((await outbox.list()).length, 1, "the fact that WAS found still gets its webhook");

  assert.ok(
    w.logs.some(
      (l) => l.event === "api_request_failed" && l.route === "decideApproval" && l.error.startsWith("webhook_fact_readback_gap_fence_check_failed:"),
    ),
    "the fence-check failure itself is alerted, not swallowed",
  );
  assert.ok(
    w.logs.some((l) => l.event === "api_request_failed" && l.route === "decideApproval" && l.error.startsWith("webhook_fact_readback_gap:1_of_2_missing")),
    "with the fence status unknown, the gap must be treated as unexplained -- alerted, never silently excused",
  );

  const gaps = await gapLedger.list();
  assert.equal(gaps.length, 1, "the gap is recorded even though the fence check itself could not be evaluated");
  assert.equal(gaps[0]!.kind, "readback-gap");
  assert.equal(gaps[0]!.studentId, STUDENT);
  assert.equal(gaps[0]!.sessionId, SESSION);
  assert.equal(gaps[0]!.detail, "missing-on-readback");
});

test("T-042 api (ISS-085 leak 2): an enqueue failure records a recoverable gap entry carrying the fully built event, so it can be replayed without rebuilding it", async () => {
  const failingOutbox: WebhookOutbox = {
    enqueue: async () => {
      throw new Error("boom: destination store unavailable");
    },
    get: async () => undefined,
    update: async () => {
      throw new Error("unused");
    },
    list: async () => [],
  };
  const gapLedger = new InMemoryWebhookEmitGapLedger();
  const w = world({ webhooks: { outboxForTenant: () => failingOutbox, destinationUrl: "http://client.invalid/hook", gapsForTenant: () => gapLedger } });
  await scribeToApproval(w, "tenant-a");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;
  const decided = await call(w, "POST", `${base}/approval`, { token: counsellor, body: { action: "approve" } });
  assert.equal(decided.status, 200, decided.body);
  assert.equal(decided.json.kind, "done");

  const gaps = await gapLedger.list();
  assert.equal(gaps.length, 2, "one recoverable gap entry per fact.approved event that failed to enqueue");
  for (const gap of gaps) {
    assert.equal(gap.kind, "enqueue-failed");
    assert.equal(gap.studentId, STUDENT);
    assert.equal(gap.destinationUrl, "http://client.invalid/hook");
    assert.ok(gap.detail.startsWith("enqueue_failed:"));
    assert.ok(gap.event, "the fully built event is kept, so it can be replayed without rebuilding it");
    assert.equal((gap.event as WebhookEvent & { type: "fact.approved" }).type, "fact.approved");
  }
});

test("T-025 api: another tenant sees tenant A's student exactly as a student that never existed, and changes nothing of A's", async () => {
  const w = world();
  await scribeToApproval(w, "tenant-a");
  const aBefore = rawAll(w.fakeDb);
  const bCounsellor = await as("tenant-b", "counsellor-9", "counsellor");
  const bAdmin = await as("tenant-b", "admin-9", "admin");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;
  const ghost = `/v1/students/ghost-student/sessions/ghost-session`;

  const pairs: [string, string, string, unknown, string][] = [
    ["GET", `${base}/approval`, `${ghost}/approval`, undefined, bCounsellor],
    ["POST", `${base}/approval`, `${ghost}/approval`, { action: "approve" }, bCounsellor],
    ["GET", `${base}/transcript`, `${ghost}/transcript`, undefined, bCounsellor],
    ["POST", `${base}/scribe/resume`, `${ghost}/scribe/resume`, undefined, bCounsellor],
    ["GET", `/v1/students/${STUDENT}/profile?purpose=profile_synthesis`, `/v1/students/ghost-student/profile?purpose=profile_synthesis`, undefined, bCounsellor],
  ];
  for (const [method, aUrl, ghostUrl, body, tok] of pairs) {
    const seen = await call(w, method, aUrl, { token: tok, body });
    const never = await call(w, method, ghostUrl, { token: tok, body });
    assert.ok(seen.status >= 400, `${method} ${aUrl} leaked: ${seen.body}`);
    assert.equal(seen.status, never.status, `${method} ${aUrl}`);
    assert.equal(seen.body, never.body, `${method} ${aUrl}`);
  }

  // Export: B's view of A's student has none of A's data and equals a never-existing student's.
  const exp = await call(w, "GET", `/v1/students/${STUDENT}/export`, { token: bAdmin });
  const ghostExp = await call(w, "GET", `/v1/students/ghost-student/export`, { token: bAdmin });
  assert.equal(exp.status, 200);
  assert.doesNotMatch(exp.body, /Canada|computer science|tenant/);
  const norm = (b: AnyDoc) => JSON.stringify({ ...b, exportedAt: "X", studentId: "X" });
  assert.equal(norm(exp.json), norm(ghostExp.json));

  // A's erasure request id, confirmed from tenant B: the same 404 as an id that never existed.
  const aReq = await call(w, "POST", `/v1/students/${STUDENT}/erasure-requests`, {
    token: await as("tenant-a", "counsellor-1", "counsellor"),
    body: { reason: "student_request" },
  });
  assert.equal(aReq.status, 201, aReq.body);
  const requestId = aReq.json.requestId as string;
  const aAfterRequest = rawAll(w.fakeDb);
  const crossConfirm = await call(w, "POST", `/v1/erasure-requests/${requestId}/confirm`, { token: bAdmin });
  const ghostConfirm = await call(w, "POST", `/v1/erasure-requests/ffffffffffffffffffffffff/confirm`, { token: bAdmin });
  assert.equal(crossConfirm.status, 404);
  assert.equal(crossConfirm.body, ghostConfirm.body);
  const crossExecute = await call(w, "POST", `/v1/erasure-requests/${requestId}/execute`, { token: bAdmin });
  assert.equal(crossExecute.status, 404);

  // Nothing tenant A owns changed through any of B's calls.
  const onlyA = (snap: Record<string, AnyDoc[]>) =>
    Object.fromEntries(Object.entries(snap).map(([k, docs]) => [k, docs.filter((d) => d.tenantId === "tenant-a")]));
  assert.deepEqual(onlyA(aAfterRequest), onlyA(rawAll(w.fakeDb)));
  assert.ok(Object.values(onlyA(aBefore)).some((d) => d.length > 0));
});

test("T-025 api (T-022 merge): concern_flagged edges are stamped with the token's tenant, the same student/session in two tenants coexist, and A's erasure deletes only A's", async () => {
  const w = world();
  const CONCERN_TEXT = "Honestly, so much pressure I can't cope, everything feels like too much right now.";
  const body = {
    ...START_BODY,
    turns: [...START_BODY.turns, { turnId: "t4", speaker: "student", lang: "en", text: CONCERN_TEXT, translatedText: CONCERN_TEXT, ts: 4 }],
  };
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;
  for (const tenant of ["tenant-a", "tenant-b"]) {
    await seedConsent(w, tenant);
    const res = await call(w, "POST", `${base}/scribe`, { token: await as(tenant, "counsellor-1", "counsellor"), body });
    assert.equal(res.status, 200, res.body);
    assert.equal(res.json.kind, "awaiting_approval", `${tenant}: a concern flags and continues (D-020)`);
  }
  const concernEdges = () =>
    w.fakeDb
      .collection<{ _id: string }>(COLLECTION_NAMES.edges)
      .all()
      .map((d) => d as unknown as AnyDoc)
      .filter((d) => d.rel === "concern_flagged");
  const edges = concernEdges();
  assert.deepEqual(edges.map((e) => e.tenantId).sort(), ["tenant-a", "tenant-b"], "one concern edge per tenant, each stamped");
  for (const e of edges) assert.ok(String(e._id).startsWith(`${String(e.tenantId)}:`), "edge _id is tenant-qualified (no cross-tenant 11000)");

  // Export: A's own export carries A's concern; a third tenant's export of the same id carries none.
  const aAdmin = await as("tenant-a", "admin-1", "admin");
  const aExport = await call(w, "GET", `/v1/students/${STUDENT}/export`, { token: aAdmin });
  assert.equal(aExport.status, 200, aExport.body);
  assert.match(aExport.body, /concern_flagged/);
  assert.doesNotMatch(aExport.body, /tenant-b|tenantId/);
  const cExport = await call(w, "GET", `/v1/students/${STUDENT}/export`, { token: await as("tenant-c", "admin-3", "admin") });
  assert.doesNotMatch(cExport.body, /concern_flagged/);

  // Erasure in A removes A's concern edge; B's is byte-for-byte unchanged.
  const bEdgeBefore = JSON.stringify(concernEdges().find((e) => e.tenantId === "tenant-b"));
  const opened = await call(w, "POST", `/v1/students/${STUDENT}/erasure-requests`, {
    token: await as("tenant-a", "counsellor-1", "counsellor"),
    body: { reason: "student_request" },
  });
  assert.equal(opened.status, 201, opened.body);
  const requestId = opened.json.requestId as string;
  // T-029: first + second confirmation by the counsellor, then the approver approves (which purges).
  const aCounsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const first = await call(w, "POST", `/v1/erasure-requests/${requestId}/confirm`, { token: aCounsellor });
  assert.equal(first.status, 200, first.body);
  const second = await call(w, "POST", `/v1/erasure-requests/${requestId}/reconfirm`, {
    token: aCounsellor,
    body: { confirmToken: first.json.confirmToken },
  });
  assert.equal(second.status, 202, second.body);
  const approved = await call(w, "POST", `/v1/erasure-requests/${requestId}/approve`, { token: await as("tenant-a", "approver-1", "approver") });
  assert.equal(approved.status, 200, approved.body);
  const after = concernEdges();
  assert.deepEqual(after.map((e) => e.tenantId), ["tenant-b"]);
  assert.equal(JSON.stringify(after[0]), bEdgeBefore);
});

test("T-034 api: the first erasure confirmation enqueues one erasure.requested webhook event, carrying the request's own reason/requestedAt (read back via getErasureRequest, the last point studentId is still clear)", async () => {
  const outbox = new InMemoryWebhookOutbox();
  const w = world({ webhooks: { outboxForTenant: () => outbox, destinationUrl: "http://client.invalid/hook" } });
  await scribeToApproval(w, "tenant-a");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const opened = await call(w, "POST", `/v1/students/${STUDENT}/erasure-requests`, { token: counsellor, body: { reason: "guardian_request" } });
  assert.equal(opened.status, 201, opened.body);
  const requestId = opened.json.requestId as string;

  const before = await outbox.list();
  assert.equal(before.length, 0, "requestErasure alone does not enqueue -- only the confirm step does");

  const first = await call(w, "POST", `/v1/erasure-requests/${requestId}/confirm`, { token: counsellor });
  assert.equal(first.status, 200, first.body);

  const records = await outbox.list();
  assert.equal(records.length, 1);
  const event = records[0]!.event as WebhookEvent & { type: "erasure.requested" };
  assert.equal(event.type, "erasure.requested");
  assert.equal(event.tenantId, "tenant-a");
  assert.equal(event.data.requestId, requestId);
  assert.equal(event.data.studentId, STUDENT);
  assert.equal(event.data.reason, "guardian_request");
  assert.equal(records[0]!.destinationUrl, "http://client.invalid/hook");
});

test("T-029 api: request -> confirm -> reconfirm (token) -> approver approves -> purged; no single call purges; self-approval, a wrong token and student-as-actor are refused", async () => {
  const w = world();
  await scribeToApproval(w, "tenant-a");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const admin = await as("tenant-a", "admin-1", "admin");
  const approverSame = await as("tenant-a", "counsellor-1", "approver");
  const approver = await as("tenant-a", "approver-1", "approver");

  const asStudent = await call(w, "POST", `/v1/students/${STUDENT}/erasure-requests`, {
    token: await as("tenant-a", STUDENT.toUpperCase(), "counsellor"),
    body: { reason: "student_request" },
  });
  assert.equal(asStudent.status, 400);
  assert.deepEqual(asStudent.json, { error: "actor_is_student" });

  const opened = await call(w, "POST", `/v1/students/${STUDENT}/erasure-requests`, { token: counsellor, body: { reason: "guardian_request" } });
  assert.equal(opened.status, 201, opened.body);
  const requestId = opened.json.requestId as string;
  const dup = await call(w, "POST", `/v1/students/${STUDENT}/erasure-requests`, { token: counsellor, body: { reason: "guardian_request" } });
  assert.equal(dup.status, 409);
  const studentData = () => JSON.stringify(["facts", "sessions", "session_transcripts"].map((n) => w.fakeDb.collection<{ _id: string }>(n).all()));
  const before = studentData();

  const early = await call(w, "POST", `/v1/erasure-requests/${requestId}/execute`, { token: admin });
  assert.equal(early.status, 409);
  assert.deepEqual(early.json, { error: "erasure_not_confirmed" });

  // SC-028: one confirmation purges nothing.
  const first = await call(w, "POST", `/v1/erasure-requests/${requestId}/confirm`, { token: counsellor });
  assert.equal(first.status, 200, first.body);
  assert.equal(first.json.status, "confirmed");
  assert.equal(typeof first.json.confirmToken, "string");
  assert.deepEqual((await call(w, "POST", `/v1/erasure-requests/${requestId}/execute`, { token: admin })).json, { error: "erasure_not_confirmed" });
  const wrong = await call(w, "POST", `/v1/erasure-requests/${requestId}/reconfirm`, { token: counsellor, body: { confirmToken: "not-the-token" } });
  assert.equal(wrong.status, 403);
  assert.deepEqual(wrong.json, { error: "confirm_token_invalid" });
  const otherActor = await call(w, "POST", `/v1/erasure-requests/${requestId}/reconfirm`, { token: admin, body: { confirmToken: first.json.confirmToken } });
  assert.equal(otherActor.status, 403, "only the first confirmer may reconfirm");

  // SC-029: two confirmations, no approver -> nothing purged; the outbox holds the approval request.
  const second = await call(w, "POST", `/v1/erasure-requests/${requestId}/reconfirm`, { token: counsellor, body: { confirmToken: first.json.confirmToken } });
  assert.equal(second.status, 202, second.body);
  assert.equal(second.json.status, "awaiting_approval");
  const notYet = await call(w, "POST", `/v1/erasure-requests/${requestId}/execute`, { token: admin });
  assert.equal(notYet.status, 409);
  assert.deepEqual(notYet.json, { error: "erasure_not_approved" });
  assert.equal(studentData(), before, "nothing purged before approval");
  const outbox = w.fakeDb.collection<Record<string, unknown> & { _id: string }>(COLLECTION_NAMES.email_outbox).all();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]!.to, "approver@synthetic.test");
  assert.doesNotMatch(JSON.stringify(outbox), new RegExp(STUDENT));

  const self = await call(w, "POST", `/v1/erasure-requests/${requestId}/approve`, { token: approverSame });
  assert.equal(self.status, 403);
  assert.deepEqual(self.json, { error: "self_approve_refused" });
  assert.equal(studentData(), before);

  // SC-030: the approver approves -> the purge runs and returns the counts-only receipt.
  const done = await call(w, "POST", `/v1/erasure-requests/${requestId}/approve`, { token: approver });
  assert.equal(done.status, 200, done.body);
  assert.equal(done.json.status, "completed");
  assert.doesNotMatch(done.body, new RegExp(STUDENT));

  const gone = await call(w, "GET", `/v1/students/${STUDENT}/sessions/${SESSION}/approval`, { token: counsellor });
  assert.equal(gone.status, 404);
  const exported = await call(w, "GET", `/v1/students/${STUDENT}/export`, { token: admin });
  assert.doesNotMatch(exported.body, /Canada/);
  for (const name of ["facts", "sessions", "session_transcripts", "scribe_checkpoints", "scribe_checkpoint_writes"]) {
    assert.equal(w.fakeDb.collection<{ _id: string }>(name).size(), 0, `${name} not erased`);
  }
});

test("T-029 api: the approver REJECTS -> 200 rejected, nothing purged; a later approve / execute is refused", async () => {
  const w = world();
  await scribeToApproval(w, "tenant-a");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const approver = await as("tenant-a", "approver-1", "approver");
  const requestId = (await call(w, "POST", `/v1/students/${STUDENT}/erasure-requests`, { token: counsellor, body: { reason: "student_request" } })).json
    .requestId as string;
  const first = await call(w, "POST", `/v1/erasure-requests/${requestId}/confirm`, { token: counsellor });
  await call(w, "POST", `/v1/erasure-requests/${requestId}/reconfirm`, { token: counsellor, body: { confirmToken: first.json.confirmToken } });
  const before = JSON.stringify(["facts", "sessions", "session_transcripts"].map((n) => w.fakeDb.collection<{ _id: string }>(n).all()));
  const rejected = await call(w, "POST", `/v1/erasure-requests/${requestId}/reject`, { token: approver });
  assert.equal(rejected.status, 200, rejected.body);
  assert.deepEqual(rejected.json, { requestId, status: "rejected" });
  assert.equal(JSON.stringify(["facts", "sessions", "session_transcripts"].map((n) => w.fakeDb.collection<{ _id: string }>(n).all())), before);
  assert.equal((await call(w, "POST", `/v1/erasure-requests/${requestId}/approve`, { token: approver })).status, 409);
  assert.equal((await call(w, "POST", `/v1/erasure-requests/${requestId}/execute`, { token: await as("tenant-a", "admin-1", "admin") })).status, 409);
});

test("T-029 api: autoDelete=true -> the reconfirm itself purges (200, autoDeleted); an unconfigured workflow is 503 erasure_not_configured and writes nothing", async () => {
  const auto = world({ erasureConfig: () => ({ auditHmacKey: TEST_ERASURE_CONFIG.auditHmacKey, autoDelete: true }) });
  await scribeToApproval(auto, "tenant-a");
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const requestId = (await call(auto, "POST", `/v1/students/${STUDENT}/erasure-requests`, { token: counsellor, body: { reason: "student_request" } })).json
    .requestId as string;
  const first = await call(auto, "POST", `/v1/erasure-requests/${requestId}/confirm`, { token: counsellor });
  const done = await call(auto, "POST", `/v1/erasure-requests/${requestId}/reconfirm`, { token: counsellor, body: { confirmToken: first.json.confirmToken } });
  assert.equal(done.status, 200, done.body);
  assert.equal(done.json.status, "completed");
  assert.equal(done.json.autoDeleted, true);
  assert.equal(auto.fakeDb.collection<{ _id: string }>(COLLECTION_NAMES.email_outbox).size(), 0);
  assert.equal(auto.fakeDb.collection<{ _id: string }>("facts").size(), 0);

  const bare = world({ erasureConfig: undefined });
  await scribeToApproval(bare, "tenant-a");
  const id2 = (await call(bare, "POST", `/v1/students/${STUDENT}/erasure-requests`, { token: counsellor, body: { reason: "student_request" } })).json
    .requestId as string;
  const f2 = await call(bare, "POST", `/v1/erasure-requests/${id2}/confirm`, { token: counsellor });
  const before = rawAll(bare.fakeDb);
  const res = await call(bare, "POST", `/v1/erasure-requests/${id2}/reconfirm`, { token: counsellor, body: { confirmToken: f2.json.confirmToken } });
  assert.equal(res.status, 503);
  assert.deepEqual(res.json, { error: "erasure_not_configured" });
  assert.deepEqual(rawAll(bare.fakeDb), before, "nothing written without a config");
  const keyless = world({ erasureConfig: () => ({ ...TEST_ERASURE_CONFIG, auditHmacKey: "" }) });
  await scribeToApproval(keyless, "tenant-a");
  const id3 = (await call(keyless, "POST", `/v1/students/${STUDENT}/erasure-requests`, { token: counsellor, body: { reason: "student_request" } })).json
    .requestId as string;
  const f3 = await call(keyless, "POST", `/v1/erasure-requests/${id3}/confirm`, { token: counsellor });
  const r3 = await call(keyless, "POST", `/v1/erasure-requests/${id3}/reconfirm`, { token: counsellor, body: { confirmToken: f3.json.confirmToken } });
  assert.equal(r3.status, 503, "a missing audit key is a config error, never an unkeyed fallback");
});

test("T-025 api: an unexpected error is a 500 with a fixed body, logged by error label only", async () => {
  const w = world({
    graphForTenant: () => {
      throw new Error("detail with student-synthetic-1 and SECRET");
    },
  });
  await seedConsent(w, "tenant-a");
  const res = await call(w, "POST", `/v1/students/${STUDENT}/sessions/${SESSION}/scribe`, {
    token: await as("tenant-a", "counsellor-1", "counsellor"),
    body: START_BODY,
  });
  assert.equal(res.status, 500);
  assert.equal(res.body, '{"error":"internal"}');
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0]!.route, "startScribe");
  assert.equal(w.logs[0]!.error, "Error");
  assert.doesNotMatch(JSON.stringify(w.logs), /SECRET|student-synthetic/);
});

test("T-025 api: a consent-less profile read is 403 consent_required", async () => {
  const w = world();
  const counsellor = await as("tenant-a", "counsellor-1", "counsellor");
  const res = await call(w, "GET", `/v1/students/${STUDENT}/profile?purpose=application_filling`, { token: counsellor });
  assert.equal(res.status, 403);
  assert.deepEqual(res.json, { error: "consent_required" });
});

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

test("T-025 api: the OpenAPI document is public and matches the route table (method, path, roles) in both directions", async () => {
  const w = world();
  const res = await call(w, "GET", "/v1/openapi.json");
  assert.equal(res.status, 200);
  assert.equal(res.json.openapi, "3.1.0");
  const doc = new Set<string>();
  for (const [path, ops] of Object.entries(OPENAPI_DOCUMENT.paths)) {
    for (const [method, op] of Object.entries(ops as Record<string, { "x-roles": readonly string[] }>)) {
      doc.add(`${method.toUpperCase()} ${path} [${[...op["x-roles"]].join(",")}]`);
    }
  }
  const table = new Set(API_ROUTES.map((r) => `${r.method} ${r.path} [${r.roles === "public" ? "" : r.roles.join(",")}]`));
  assert.deepEqual([...doc].sort(), [...table].sort());
  assert.deepEqual(w.calls, { db: [], graph: [] });
});

// ---------------------------------------------------------------------------
// node:http adapter and startApi (loopback 127.0.0.1 only)
// ---------------------------------------------------------------------------

test("T-025 api: the node:http adapter serves on loopback, answers 401 and refuses a body over 1 MiB with 413", async () => {
  const w = world();
  const server = createApiServer(w.handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    const base = `http://127.0.0.1:${port}`;
    const doc = await fetch(`${base}/v1/openapi.json`);
    assert.equal(doc.status, 200);
    assert.equal(doc.headers.get("cache-control"), "no-store");
    const anon = await fetch(`${base}/v1/students/${STUDENT}/export`);
    assert.equal(anon.status, 401);
    const big = await fetch(`${base}/v1/students/${STUDENT}/sessions/${SESSION}/scribe`, {
      method: "POST",
      headers: { authorization: `Bearer ${await as("tenant-a", "c1", "counsellor")}`, "content-type": "application/json" },
      body: "x".repeat(1024 * 1024 + 10),
    });
    assert.equal(big.status, 413);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("T-025 api: startApi serves HTTP only when asked, on virtual_counsellor only, and stop() closes the server", async () => {
  const fake = createFakeMongoClient();
  const api = await startApi(
    { MONGODB_URL: "mongodb://fake-host/ignored" },
    { clientFactory: () => fake.client, http: { port: 0, verifier, provider: mockProvider(), skillsDir: SKILLS_DIR } },
  );
  try {
    assert.ok(api.port && api.port > 0);
    const res = await fetch(`http://127.0.0.1:${api.port}/v1/openapi.json`);
    assert.equal(res.status, 200);
    assert.deepEqual([...new Set(fake.dbCalls)], ["virtual_counsellor"]);
  } finally {
    await api.stop();
  }
  await assert.rejects(fetch(`http://127.0.0.1:${api.port}/v1/openapi.json`));
});

test("T-025 api: startApi with http refuses a missing JWT configuration before connecting", async () => {
  const fake = createFakeMongoClient();
  let connected = 0;
  (fake.client as unknown as { connect: () => Promise<void> }).connect = async () => {
    connected += 1;
  };
  await assert.rejects(
    startApi({ MONGODB_URL: "mongodb://fake-host/ignored" }, { clientFactory: () => fake.client, http: { port: 0, provider: mockProvider() } }),
    /VC_JWT_ISSUER/,
  );
  assert.equal(connected, 0);
});

test("T046 verified JWT edit provenance is identical in raw KG API profile and approved webhook", async () => {
  const outbox = new InMemoryWebhookOutbox();
  const w = world({ webhooks: { outboxForTenant: () => outbox, destinationUrl: "http://client.invalid/hook" } });
  await scribeToApproval(w, "tenant-a");
  const token = await as("tenant-a", " actual-jwt-counsellor ", "counsellor");
  const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;
  const seen = await call(w, "GET", `${base}/approval`, { token });
  const original = seen.json.request.facts.find((f: AnyDoc) => f.key === "targetCountry");
  const body = { action: "per_fact", facts: [{ key: "targetCountry", decision: "edit", value: "Japan" }, { key: "budget_inr_per_year", decision: "approve" }], summary: "withhold" };
  const decided = await call(w, "POST", `${base}/approval`, { token, body });
  assert.equal(decided.status, 200, decided.body);
  const raw = w.fakeDb.collection<any>("facts").all().find((f) => f.tenantId === "tenant-a" && f.key === "targetCountry" && f.active)!;
  assert.equal(raw.source.type, "counsellor-edit"); assert.equal(raw.source.counsellorId, " actual-jwt-counsellor "); assert.deepEqual(raw.source.editedFrom, original.source);
  const claim = w.fakeDb.collection<any>("scribe_resolutions").all()[0]!; assert.deepEqual(claim.approvalMetadata, { counsellorId: " actual-jwt-counsellor ", editedAt: raw.source.editedAt });
  const profile = await call(w, "GET", `/v1/students/${STUDENT}/profile?purpose=profile_synthesis`, { token });
  assert.equal(profile.status, 200); assert.ok(profile.body.includes(JSON.stringify(raw.source.counsellorId))); assert.match(profile.body, /counsellor-edit/); assert.match(profile.body, /actual-jwt-counsellor/);
  const events = await outbox.list(); const event = events.find((r) => (r.event as any).data.fact.key === "targetCountry")!.event as any;
  assert.deepEqual(event.data.fact.source, raw.source); assert.equal(event.data.fact.value, "Japan");
  const snapshot = JSON.stringify(w.fakeDb.collection<any>("facts").all());
  const replay = await call(w, "POST", `${base}/approval`, { token: await as("tenant-a", "different-caller", "counsellor"), body });
  assert.equal(replay.json.kind, "already_resolved"); assert.equal(JSON.stringify(w.fakeDb.collection<any>("facts").all()), snapshot); assert.equal((await outbox.list()).length, events.length);
});

test("T046 forged body actor time and nested provenance refuse before actual claim or write", async () => {
  const w = world(); await scribeToApproval(w, "tenant-a");
  const token = await as("tenant-a", "verified-not-body", "counsellor"); const base = `/v1/students/${STUDENT}/sessions/${SESSION}`;
  for (const body of [{ action: "approve", counsellorId: "FORGED_BODY", editedAt: "2026-09-30T00:00:00.000Z" }, { action: "per_fact", facts: [{ key: "targetCountry", decision: "edit", value: "Japan", source: { type: "profile", id: "FORGED_SOURCE" } }, { key: "budget_inr_per_year", decision: "approve" }], summary: "withhold" }]) {
    assert.equal((await call(w, "POST", `${base}/approval`, { token, body })).status, 400);
    assert.equal(w.fakeDb.collection<any>("facts").size(), 0); assert.equal(w.fakeDb.collection<any>("scribe_resolutions").size(), 0);
  }
});