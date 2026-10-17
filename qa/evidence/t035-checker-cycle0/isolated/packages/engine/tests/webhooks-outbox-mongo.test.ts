/**
 * T-034 (B21 signed webhooks, D-021): the Mongo-backed WebhookOutbox, over a fake tenant-scoped Db
 * (B8 — no real network or database). Mirrors webhooks-outbox.test.ts's in-memory assertions plus
 * the tenant-scoping and drift-guard properties specific to the Mongo implementation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDb } from "@vc/db/testing";
import { COLLECTION_NAMES, TenantScopeError, tenantScopedDb } from "@vc/db";
import { MongoWebhookOutbox, WEBHOOK_OUTBOX_COLLECTION } from "../src/webhooks/outbox.js";
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
