/**
 * T-034 (B21 signed webhooks, D-021): the Mongo-backed WebhookOutbox, over a fake tenant-scoped Db
 * (B8 — no real network or database). Mirrors webhooks-outbox.test.ts's in-memory assertions plus
 * the tenant-scoping and drift-guard properties specific to the Mongo implementation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDb } from "@vc/db/testing";
import { COLLECTION_NAMES, TenantScopeError, tenantScopedDb } from "@vc/db";
import {
  InMemoryWebhookOutbox,
  MongoWebhookOutbox,
  WEBHOOK_OUTBOX_COLLECTION,
  WEBHOOK_OUTBOX_RETENTION_MS,
  purgeSettledWebhookOutbox,
} from "../src/webhooks/outbox.js";
import type { OutboxRecordStatus } from "../src/webhooks/outbox.js";
import { drainWebhookOutbox } from "../src/webhooks/delivery.js";
import type { WebhookEvent } from "../src/webhooks/schemas.js";

function makeEvent(id: string, studentId = "student-1"): WebhookEvent {
  return {
    id,
    type: "erasure.requested",
    occurredAt: "2026-09-27T10:00:00.000Z",
    tenantId: "tenant-pathlynks",
    data: {
      requestId: "erase-1",
      studentId,
      reason: "student_request",
      requestedAt: "2026-09-27T10:10:00.000Z",
    },
  };
}

function outboxFor(tenantId: string) {
  const { db } = createFakeDb();
  return { outbox: new MongoWebhookOutbox(tenantScopedDb(db, tenantId)), db };
}

test("drift guard: the collection name here matches packages/db COLLECTION_NAMES.webhook_outbox", () => {
  assert.equal(WEBHOOK_OUTBOX_COLLECTION, COLLECTION_NAMES.webhook_outbox);
});

test("constructor refuses an unscoped Db", () => {
  const { db } = createFakeDb();
  assert.throws(() => new MongoWebhookOutbox(db), TenantScopeError);
});

test("enqueue creates a pending record with zero attempts", async () => {
  const { outbox } = outboxFor("tenant-a");
  const record = await outbox.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: "http://x/hook" });
  assert.equal(record.id, "evt-1");
  assert.equal(record.status, "pending");
  assert.equal(record.attempts, 0);
  assert.equal(record.destinationUrl, "http://x/hook");
  assert.deepEqual(record.event, makeEvent("evt-1"));
});

test("enqueue is idempotent by id: a second enqueue never creates a second row or resets bookkeeping", async () => {
  const { outbox } = outboxFor("tenant-a");
  await outbox.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: "http://x/hook" });
  await outbox.update("evt-1", { status: "delivered", attempts: 3, lastStatus: 200 });

  const secondEnqueue = await outbox.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: "http://x/hook" });
  assert.equal(secondEnqueue.status, "delivered");
  assert.equal(secondEnqueue.attempts, 3);

  const all = await outbox.list();
  assert.equal(all.length, 1);
});

test("get returns undefined for an unknown id", async () => {
  const { outbox } = outboxFor("tenant-a");
  assert.equal(await outbox.get("does-not-exist"), undefined);
});

test("update patches only the given fields and preserves id/event/destinationUrl/createdAt", async () => {
  const { outbox } = outboxFor("tenant-a");
  const before = await outbox.enqueue({ id: "evt-2", event: makeEvent("evt-2"), destinationUrl: "http://x/hook" });
  await new Promise((r) => setTimeout(r, 2));
  const after = await outbox.update("evt-2", { status: "failed", attempts: 1, lastError: "http_400" });

  assert.equal(after.id, before.id);
  assert.equal(after.destinationUrl, before.destinationUrl);
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(after.status, "failed");
  assert.equal(after.attempts, 1);
  assert.equal(after.lastError, "http_400");
  assert.ok(after.updatedAt >= before.updatedAt);
});

test("update on an unknown id throws", async () => {
  const { outbox } = outboxFor("tenant-a");
  await assert.rejects(() => outbox.update("does-not-exist", { status: "failed" }));
});

test("list returns every enqueued record for the tenant", async () => {
  const { outbox } = outboxFor("tenant-a");
  await outbox.enqueue({ id: "evt-a", event: makeEvent("evt-a"), destinationUrl: "http://x/hook" });
  await outbox.enqueue({ id: "evt-b", event: makeEvent("evt-b"), destinationUrl: "http://x/hook" });
  const all = await outbox.list();
  assert.deepEqual(
    all.map((r) => r.id).sort(),
    ["evt-a", "evt-b"],
  );
});

test("B21 tenancy: tenant A's outbox never sees tenant B's records, on the SAME underlying Db", async () => {
  const { db } = createFakeDb();
  const outboxA = new MongoWebhookOutbox(tenantScopedDb(db, "tenant-a"));
  const outboxB = new MongoWebhookOutbox(tenantScopedDb(db, "tenant-b"));

  await outboxA.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: "http://a/hook" });
  await outboxB.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: "http://b/hook" });

  const aList = await outboxA.list();
  const bList = await outboxB.list();
  assert.equal(aList.length, 1);
  assert.equal(bList.length, 1);
  assert.equal(aList[0]!.destinationUrl, "http://a/hook");
  assert.equal(bList[0]!.destinationUrl, "http://b/hook");

  // Tenant A can not read or update tenant B's record via its own scoped outbox.
  assert.equal(await outboxA.get("evt-1").then((r) => r?.destinationUrl), "http://a/hook");
  await outboxA.update("evt-1", { status: "delivered" });
  assert.equal((await outboxB.get("evt-1"))!.status, "pending", "tenant A's update must not reach tenant B's row");
});

test("ISS-t-027-rev-3: every stored document carries a top-level tenantId (not only nested in event.tenantId)", async () => {
  const { db, outbox } = outboxFor("tenant-a");
  await outbox.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: "http://x/hook" });
  const raw = await (db as unknown as { collection(name: string): { findOne(f: object): Promise<{ tenantId?: string } | null> } })
    .collection(WEBHOOK_OUTBOX_COLLECTION)
    .findOne({});
  assert.equal(raw?.tenantId, "tenant-a");
});

test("T054 C2/C4: raw Mongo status and tenant predicate precede materialization; selectors match memory without changing raw rows", async () => {
  const { db } = createFakeDb();
  const outbox = new MongoWebhookOutbox(tenantScopedDb(db, "tenant-a"));
  const other = new MongoWebhookOutbox(tenantScopedDb(db, "tenant-b"));
  const memory = new InMemoryWebhookOutbox();
  const statuses = ["pending", "failed", "delivered", "dead"] as const;
  for (const status of statuses) {
    const id = `evt-${status}`;
    const input = { id, event: makeEvent(id), destinationUrl: `http://x/${status}` };
    for (const adapter of [outbox, memory, other]) {
      await adapter.enqueue(input);
      await adapter.update(id, { status, attempts: 3, lastStatus: 400, lastError: "keep" });
    }
  }
  const raw = db.collection(WEBHOOK_OUTBOX_COLLECTION);
  const originalFind = raw.find.bind(raw);
  const rawBefore = JSON.stringify(await originalFind({}).toArray());
  const publicBefore = JSON.stringify(await outbox.list());
  let expected: readonly OutboxRecordStatus[] | undefined;
  let materializations = 0;
  const queries: unknown[] = [];
  raw.find = ((...args: Parameters<typeof raw.find>) => {
    queries.push(args[0]);
    const cursor = originalFind(...args);
    const originalToArray = cursor.toArray.bind(cursor);
    cursor.toArray = async () => {
      const rows = await originalToArray();
      materializations += 1;
      const wanted = expected ?? statuses;
      assert.equal(rows.length, wanted.length, "raw cursor must materialize only the requested tenant/status rows");
      assert.deepEqual(rows.map((row) => row._id), statuses.filter((status) => wanted.includes(status)).map((status) => `tenant-a:evt-${status}`));
      assert.ok(rows.every((row) => row.tenantId === "tenant-a" && wanted.includes(row.status as OutboxRecordStatus)));
      return rows;
    };
    return cursor;
  }) as typeof raw.find;
  try {
    for (const selector of [["pending"], ["failed"], ["pending", "failed"], [], statuses, undefined] as const) {
      expected = selector;
      const selected = await outbox.list(selector);
      assert.deepEqual(queries.at(-1), selector === undefined ? { tenantId: "tenant-a" } : { status: { $in: [...selector] }, tenantId: "tenant-a" });
      const inMemory = await memory.list(selector);
      assert.deepEqual(selected.map(({ createdAt: _c, updatedAt: _u, ...record }) => record), inMemory.map(({ createdAt: _c, updatedAt: _u, ...record }) => record));
    }
    assert.equal(materializations, 6, "one cursor per list, without a second historical read");
    assert.equal(JSON.stringify(await originalFind({}).toArray()), rawBefore);
    expected = ["pending"];
    const result = await drainWebhookOutbox(outbox, { secret: "synthetic-t054", fetchImpl: async () => new Response("ok", { status: 200 }) });
    assert.deepEqual(queries.at(-1), { status: { $in: ["pending"] }, tenantId: "tenant-a" });
    assert.equal(materializations, 7, "drain must select once before delivering");
    assert.equal(result.length, 1);
    assert.equal((await outbox.get("evt-pending"))!.status, "delivered");
    for (const status of ["failed", "delivered", "dead"] as const) assert.equal((await outbox.get(`evt-${status}`))!.status, status);
    assert.equal((await other.get("evt-pending"))!.status, "pending");
    assert.equal(JSON.stringify((await outbox.get("evt-pending"))!.event), JSON.stringify(makeEvent("evt-pending")));
  } finally {
    raw.find = originalFind;
  }
  assert.equal(JSON.stringify(await outbox.list()).includes("tenant-b"), false);
  assert.ok(publicBefore.includes('"status":"pending"'));
});

// ---------------------------------------------------------------------------
// w1-erasure-outbox E2 (ISS-t-034-de-1): delivered / dead rows are purged after a retention window
// ---------------------------------------------------------------------------

test("w1-erasure-outbox E2: WEBHOOK_OUTBOX_RETENTION_MS is a named constant, default 30 days", () => {
  assert.equal(WEBHOOK_OUTBOX_RETENTION_MS, 30 * 24 * 3600 * 1000);
});

test("w1-erasure-outbox E2 (Mongo): delivered/dead rows older than the window are purged; pending and failed rows are kept however old; recent delivered rows are kept; tenant B is untouched", async () => {
  const { db } = createFakeDb();
  const scopedA = tenantScopedDb(db, "tenant-a");
  const outbox = new MongoWebhookOutbox(scopedA);
  const other = new MongoWebhookOutbox(tenantScopedDb(db, "tenant-b"));
  const now = new Date("2026-10-25T00:00:00.000Z");
  const old = new Date(now.getTime() - WEBHOOK_OUTBOX_RETENTION_MS - 60_000).toISOString();
  const recent = new Date(now.getTime() - WEBHOOK_OUTBOX_RETENTION_MS + 60_000).toISOString();
  const rows: Array<[string, OutboxRecordStatus, string]> = [
    ["old-delivered", "delivered", old],
    ["old-dead", "dead", old],
    ["old-pending", "pending", old],
    ["old-failed", "failed", old],
    ["recent-delivered", "delivered", recent],
    ["recent-dead", "dead", recent],
  ];
  for (const [id, status, updatedAt] of rows) {
    await outbox.enqueue({ id, event: makeEvent(id), destinationUrl: "http://x/hook" });
    await outbox.update(id, { status });
    await scopedA.collection(WEBHOOK_OUTBOX_COLLECTION).updateOne({ _id: id }, { $set: { updatedAt } });
  }
  await other.enqueue({ id: "old-delivered", event: makeEvent("old-delivered"), destinationUrl: "http://b/hook" });
  await other.update("old-delivered", { status: "delivered" });
  await tenantScopedDb(db, "tenant-b").collection(WEBHOOK_OUTBOX_COLLECTION).updateOne({ _id: "old-delivered" }, { $set: { updatedAt: old } });

  const purged = await purgeSettledWebhookOutbox(outbox, { now });
  assert.equal(purged, 2);
  assert.deepEqual((await outbox.list()).map((r) => r.id).sort(), ["old-failed", "old-pending", "recent-dead", "recent-delivered"]);
  assert.equal((await other.list()).length, 1, "another tenant's old delivered row is not touched by this tenant's purge");
  // The drain scan no longer carries the purged history.
  assert.deepEqual((await outbox.list(["pending", "failed"])).map((r) => r.id).sort(), ["old-failed", "old-pending"]);
});

test("w1-erasure-outbox E2 (memory): the same purge on the in-memory outbox keeps pending/failed, drops settled rows past the window; retentionMs is overridable", async () => {
  const outbox = new InMemoryWebhookOutbox();
  for (const status of ["pending", "failed", "delivered", "dead"] as const) {
    await outbox.enqueue({ id: `evt-${status}`, event: makeEvent(`evt-${status}`), destinationUrl: "http://x/hook" });
    await outbox.update(`evt-${status}`, { status });
  }
  // Inside the window nothing goes.
  assert.equal(await purgeSettledWebhookOutbox(outbox, { now: new Date() }), 0);
  assert.equal((await outbox.list()).length, 4);
  // A shorter window, with a clock past it: only the settled rows go.
  const later = new Date(Date.now() + 10_000);
  assert.equal(await purgeSettledWebhookOutbox(outbox, { now: later, retentionMs: 1_000 }), 2);
  assert.deepEqual((await outbox.list()).map((r) => r.id).sort(), ["evt-failed", "evt-pending"]);
});
