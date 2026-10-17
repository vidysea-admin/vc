/**
 * T-034 (B21 signed webhooks, D-021): drainWebhookOutbox, the delivery worker that drains a
 * WebhookOutbox through deliverWebhookEvent's existing signing + retry/backoff path. Against a REAL
 * in-process fake receiver (node:http), never a real network call (B8/B13) — same pattern as
 * webhooks-delivery.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { drainWebhookOutbox } from "../src/webhooks/delivery.js";
import { InMemoryWebhookOutbox } from "../src/webhooks/outbox.js";
import type { WebhookEvent } from "../src/webhooks/schemas.js";

const SECRET = "test-secret-do-not-use-in-prod";

async function startFakeReceiver(handle: (callIndex: number) => { status: number }): Promise<{ url: string; server: Server; callCount: () => number }> {
  let count = 0;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const { status } = handle(count);
      count += 1;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: status < 300 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}/hook`, server, callCount: () => count };
}

function stopFakeReceiver(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function makeEvent(id: string): WebhookEvent {
  return {
    id,
    type: "erasure.requested",
    occurredAt: "2026-09-27T10:00:00.000Z",
    tenantId: "tenant-pathlynks",
    data: { requestId: id, studentId: "student-1", reason: "student_request", requestedAt: "2026-09-27T10:00:00.000Z" },
  };
}

test("drainWebhookOutbox delivers every pending record and leaves it delivered", async () => {
  const receiver = await startFakeReceiver(() => ({ status: 200 }));
  try {
    const outbox = new InMemoryWebhookOutbox();
    await outbox.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: receiver.url });
    await outbox.enqueue({ id: "evt-2", event: makeEvent("evt-2"), destinationUrl: receiver.url });

    const results = await drainWebhookOutbox(outbox, { secret: SECRET });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.delivered));
    assert.equal(receiver.callCount(), 2);

    const all = await outbox.list();
    assert.ok(all.every((r) => r.status === "delivered"));
  } finally {
    await stopFakeReceiver(receiver.server);
  }
});

test("drainWebhookOutbox never touches an already-delivered or dead record", async () => {
  const receiver = await startFakeReceiver(() => ({ status: 200 }));
  try {
    const outbox = new InMemoryWebhookOutbox();
    await outbox.enqueue({ id: "evt-delivered", event: makeEvent("evt-delivered"), destinationUrl: receiver.url });
    await outbox.update("evt-delivered", { status: "delivered", attempts: 1, lastStatus: 200 });
    await outbox.enqueue({ id: "evt-dead", event: makeEvent("evt-dead"), destinationUrl: receiver.url });
    await outbox.update("evt-dead", { status: "dead", attempts: 6 });

    const results = await drainWebhookOutbox(outbox, { secret: SECRET });
    assert.equal(results.length, 0);
    assert.equal(receiver.callCount(), 0);
  } finally {
    await stopFakeReceiver(receiver.server);
  }
});

test("drainWebhookOutbox retries a `failed` record only when includeFailed is true", async () => {
  const receiver = await startFakeReceiver(() => ({ status: 200 }));
  try {
    const outbox = new InMemoryWebhookOutbox();
    await outbox.enqueue({ id: "evt-failed", event: makeEvent("evt-failed"), destinationUrl: receiver.url });
    await outbox.update("evt-failed", { status: "failed", attempts: 1, lastStatus: 400 });

    const skipped = await drainWebhookOutbox(outbox, { secret: SECRET });
    assert.equal(skipped.length, 0);
    assert.equal(receiver.callCount(), 0);

    const retried = await drainWebhookOutbox(outbox, { secret: SECRET, includeFailed: true });
    assert.equal(retried.length, 1);
    assert.equal(retried[0]!.delivered, true);
    assert.equal(receiver.callCount(), 1);
  } finally {
    await stopFakeReceiver(receiver.server);
  }
});

test("RED-proof: a broken destination status (500, never healed) leaves the record NOT delivered after a full drain", async () => {
  const receiver = await startFakeReceiver(() => ({ status: 500 }));
  try {
    const outbox = new InMemoryWebhookOutbox();
    await outbox.enqueue({ id: "evt-1", event: makeEvent("evt-1"), destinationUrl: receiver.url });

    const results = await drainWebhookOutbox(outbox, { secret: SECRET, maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} });
    assert.equal(results.length, 1);
    assert.equal(results[0]!.delivered, false);
    assert.equal((await outbox.get("evt-1"))!.status, "dead");
  } finally {
    await stopFakeReceiver(receiver.server);
  }
});
