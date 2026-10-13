/**
 * T-034 (B21 signed webhooks, D-021): drainWebhookOutbox, the delivery worker that drains a
 * WebhookOutbox through deliverWebhookEvent's existing signing + retry/backoff path. Against a REAL
 * in-process fake receiver (node:http), never a real network call (B8/B13) — same pattern as
 * webhooks-delivery.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { drainWebhookOutbox } from "../src/webhooks/delivery.js";
import { InMemoryWebhookOutbox } from "../src/webhooks/outbox.js";
import type { OutboxRecordStatus, WebhookOutbox } from "../src/webhooks/outbox.js";
import type { WebhookEvent } from "../src/webhooks/schemas.js";

const SECRET = "test-secret-do-not-use-in-prod";

async function startFakeReceiver(handle: (callIndex: number, received: { body: string; headers: import("node:http").IncomingHttpHeaders }) => { status: number }): Promise<{ url: string; server: Server; callCount: () => number }> {
  let count = 0;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const { status } = handle(count, { body: Buffer.concat(chunks).toString("utf8"), headers: req.headers });
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

test("T054 C3/C4: pending/explicit-failed selectors and legacy adapter safety retain signing, idempotency and terminal records", async () => {
  const received: { body: string; headers: import("node:http").IncomingHttpHeaders }[] = [];
  const receiver = await startFakeReceiver((_index, request) => {
    received.push(request);
    return { status: 200 };
  });
  try {
    for (const ignoresSelector of [false, true]) {
      for (const includeFailed of [false, true]) {
        const stored = new InMemoryWebhookOutbox();
        for (const status of ["pending", "failed", "delivered", "dead"] as const) {
          const id = `evt-${status}`;
          await stored.enqueue({ id, event: makeEvent(id), destinationUrl: receiver.url });
          await stored.update(id, { status, attempts: 4, lastStatus: 418, lastError: "preserved" });
        }
        const before = await stored.list();
        const selectors: (readonly OutboxRecordStatus[] | undefined)[] = [];
        const adapter: WebhookOutbox = {
          enqueue: (input) => stored.enqueue(input), get: (id) => stored.get(id), update: (id, patch) => stored.update(id, patch),
          list: (statuses?: readonly OutboxRecordStatus[]) => {
            selectors.push(statuses);
            return ignoresSelector ? stored.list() : stored.list(statuses);
          },
        };
        const offset = received.length;
        const now = 1791885600000;
        const results = await drainWebhookOutbox(adapter, { secret: SECRET, includeFailed, nowMs: () => now });
        const expectedIds = includeFailed ? ["evt-pending", "evt-failed"] : ["evt-pending"];
        assert.deepEqual(selectors, [includeFailed ? ["pending", "failed"] : ["pending"]], "drain must make one selected list request");
        assert.equal(results.length, expectedIds.length);
        assert.ok(results.every((result) => result.delivered));
        const requests = received.slice(offset);
        assert.deepEqual(requests.map((request) => request.headers["x-vc-event-id"]), expectedIds);
        for (const request of requests) {
          const id = request.headers["x-vc-event-id"] as string;
          assert.equal(request.body, JSON.stringify(makeEvent(id)), "receiver must see the stored event bytes");
          assert.equal(request.headers["x-vc-timestamp"], String(now));
          assert.equal(request.headers["x-vc-signature"], createHmac("sha256", SECRET).update(`${now}.${request.body}`).digest("hex"));
          const after = (await stored.get(id))!;
          assert.equal(after.status, "delivered");
          assert.equal(after.attempts, 1);
          assert.equal(after.lastStatus, 200);
          assert.equal(after.destinationUrl, receiver.url);
          assert.equal(after.createdAt, before.find((record) => record.id === id)!.createdAt);
        }
        for (const record of before.filter((record) => !expectedIds.includes(record.id))) assert.deepEqual(await stored.get(record.id), record, "unselected rows remain byte-identical");
      }
    }
    const empty = new InMemoryWebhookOutbox();
    const count = receiver.callCount();
    assert.deepEqual(await drainWebhookOutbox(empty, { secret: SECRET, includeFailed: true }), []);
    assert.equal(receiver.callCount(), count, "empty backlog cannot send");
  } finally {
    await stopFakeReceiver(receiver.server);
  }
});
