/**
 * T-027 (B21 signed webhooks, D-021, core only): the in-memory WebhookOutbox implementation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryWebhookOutbox } from "../src/webhooks/outbox.js";
import type { OutboxRecordStatus } from "../src/webhooks/outbox.js";
import type { WebhookEvent } from "../src/webhooks/schemas.js";

function makeEvent(id: string): WebhookEvent {
  return {
    id,
    type: "erasure.requested",
    occurredAt: "2026-09-26T10:00:00.000Z",
    tenantId: "tenant-pathlynks",
    data: {
      requestId: "erase-1",
      studentId: "student-1",
      reason: "student_request",
      requestedAt: "2026-09-26T10:10:00.000Z",
    },
  };
}

test("enqueue creates a pending record with zero attempts", async () => {
  const outbox = new InMemoryWebhookOutbox();
  const record = await outbox.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: "http://x/hook" });
  assert.equal(record.id, "evt-1");
  assert.equal(record.status, "pending");
  assert.equal(record.attempts, 0);
  assert.equal(record.destinationUrl, "http://x/hook");
});

test("enqueue is idempotent by id: a second enqueue never creates a second row or resets bookkeeping", async () => {
  const outbox = new InMemoryWebhookOutbox();
  await outbox.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: "http://x/hook" });
  await outbox.update("evt-1", { status: "delivered", attempts: 3, lastStatus: 200 });

  const secondEnqueue = await outbox.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: "http://x/hook" });
  assert.equal(secondEnqueue.status, "delivered");
  assert.equal(secondEnqueue.attempts, 3);

  const all = await outbox.list();
  assert.equal(all.length, 1);
});

test("get returns undefined for an unknown id", async () => {
  const outbox = new InMemoryWebhookOutbox();
  const record = await outbox.get("does-not-exist");
  assert.equal(record, undefined);
});

test("update patches only the given fields and preserves id/event/destinationUrl/createdAt", async () => {
  const outbox = new InMemoryWebhookOutbox();
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
  const outbox = new InMemoryWebhookOutbox();
  await assert.rejects(() => outbox.update("does-not-exist", { status: "failed" }));
});

test("list returns every enqueued record", async () => {
  const outbox = new InMemoryWebhookOutbox();
  await outbox.enqueue({ id: "evt-a", event: makeEvent("evt-a"), destinationUrl: "http://x/hook" });
  await outbox.enqueue({ id: "evt-b", event: makeEvent("evt-b"), destinationUrl: "http://x/hook" });
  const all = await outbox.list();
  assert.deepEqual(
    all.map((r) => r.id).sort(),
    ["evt-a", "evt-b"],
  );
});

test("T054 C1: explicit status selectors preserve exact records and no-argument listing", async () => {
  const outbox = new InMemoryWebhookOutbox();
  const statuses = ["pending", "failed", "delivered", "dead"] as const;
  for (const status of statuses) {
    const id = `evt-${status}`;
    await outbox.enqueue({ id, event: makeEvent(id), destinationUrl: `http://x/${status}` });
    await outbox.update(id, { status, attempts: status === "pending" ? 0 : 3, lastError: "preserved" });
  }
  const before = JSON.stringify(await outbox.list());
  const records = await outbox.list();
  for (const selector of [["pending"], ["failed"], ["pending", "failed"], [], statuses] as readonly (readonly OutboxRecordStatus[])[]) {
    const selected = await outbox.list(selector);
    assert.deepEqual(selected, records.filter((record) => selector.includes(record.status)));
    assert.deepEqual(selected.map((record) => record.id), selector.length === 0 ? [] : statuses.filter((status) => selector.includes(status)).map((status) => `evt-${status}`));
  }
  assert.equal(JSON.stringify(await outbox.list()), before, "selectors must preserve record/event bytes and bookkeeping");
});
