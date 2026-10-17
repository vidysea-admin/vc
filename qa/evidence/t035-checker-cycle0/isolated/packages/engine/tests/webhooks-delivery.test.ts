/**
 * T-027 (B21 signed webhooks, D-021, core only): delivery against a REAL in-process fake receiver
 * (node:http), never a real network call (B8/B13) — same "real stub server, not a mocked fetch"
 * pattern as packages/providers/tests/failover.test.ts (B14 — outcome, not construction).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import {
  deliverWebhookEvent,
  computeWebhookBackoffMs,
  isRetryableDeliveryStatus,
  DELIVERY_DEFAULT_BASE_DELAY_MS,
  DELIVERY_DEFAULT_MAX_DELAY_MS,
} from "../src/webhooks/delivery.js";
import { verifyWebhookSignature, WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER, WEBHOOK_EVENT_ID_HEADER } from "../src/webhooks/signing.js";
import { InMemoryWebhookOutbox } from "../src/webhooks/outbox.js";
import type { WebhookEvent } from "../src/webhooks/schemas.js";

const SECRET = "test-secret-do-not-use-in-prod";

interface ReceivedRequest {
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** Starts a local fake receiver; `handle` decides the response for each request in sequence. */
async function startFakeReceiver(
  handle: (req: ReceivedRequest, callIndex: number) => { status: number },
): Promise<{ url: string; server: Server; requests: ReceivedRequest[] }> {
  const requests: ReceivedRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const received: ReceivedRequest = { headers: req.headers, body: Buffer.concat(chunks).toString("utf-8") };
      const callIndex = requests.length;
      requests.push(received);
      const { status } = handle(received, callIndex);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ received: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake receiver has no port");
  return { url: `http://127.0.0.1:${address.port}/webhooks`, server, requests };
}

function stop(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function makeEvent(id = "evt-1"): WebhookEvent {
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

/** No-op sleep so retry tests run in milliseconds, not real backoff time. */
const noSleep = async (_ms: number): Promise<void> => {};

test("computeWebhookBackoffMs: bounded by maxDelayMs and grows with attempt (full jitter)", () => {
  // random() = 1 -> the maximum possible delay for that attempt, exposing the cap/growth clearly.
  const alwaysMax = () => 1;
  assert.equal(computeWebhookBackoffMs(1, 100, 10_000, alwaysMax), 100); // 100 * 2^0
  assert.equal(computeWebhookBackoffMs(2, 100, 10_000, alwaysMax), 200); // 100 * 2^1
  assert.equal(computeWebhookBackoffMs(3, 100, 10_000, alwaysMax), 400); // 100 * 2^2
  assert.equal(computeWebhookBackoffMs(10, 100, 500, alwaysMax), 500); // capped at maxDelayMs
});

test("isRetryableDeliveryStatus: 5xx and 408/429 retryable; every other 4xx is not", () => {
  assert.equal(isRetryableDeliveryStatus(500), true);
  assert.equal(isRetryableDeliveryStatus(503), true);
  assert.equal(isRetryableDeliveryStatus(408), true);
  assert.equal(isRetryableDeliveryStatus(429), true);
  assert.equal(isRetryableDeliveryStatus(400), false);
  assert.equal(isRetryableDeliveryStatus(401), false);
  assert.equal(isRetryableDeliveryStatus(403), false);
  assert.equal(isRetryableDeliveryStatus(404), false);
  assert.equal(isRetryableDeliveryStatus(422), false);
});

test("a 2xx on the first attempt delivers, no retry, exactly one request received", async (t) => {
  const receiver = await startFakeReceiver(() => ({ status: 200 }));
  t.after(() => stop(receiver.server));

  const outbox = new InMemoryWebhookOutbox();
  const result = await deliverWebhookEvent(makeEvent(), receiver.url, { secret: SECRET, sleep: noSleep }, outbox);

  assert.deepEqual(result, { delivered: true, attempts: 1, status: 200 });
  assert.equal(receiver.requests.length, 1);
  const record = await outbox.get("evt-1");
  assert.equal(record?.status, "delivered");
});

for (const status of [201, 204]) {
  test(`a ${status} response also counts as delivered (any 2xx means delivered)`, async (t) => {
    const receiver = await startFakeReceiver(() => ({ status }));
    t.after(() => stop(receiver.server));
    const result = await deliverWebhookEvent(makeEvent(), receiver.url, { secret: SECRET, sleep: noSleep });
    assert.equal(result.delivered, true);
  });
}

test("a non-retryable 4xx (400) stops immediately, no retry", async (t) => {
  const receiver = await startFakeReceiver(() => ({ status: 400 }));
  t.after(() => stop(receiver.server));

  const outbox = new InMemoryWebhookOutbox();
  const result = await deliverWebhookEvent(
    makeEvent(),
    receiver.url,
    { secret: SECRET, sleep: noSleep, maxAttempts: 5 },
    outbox,
  );

  assert.deepEqual(result, { delivered: false, attempts: 1, status: 400, error: "http_400" });
  assert.equal(receiver.requests.length, 1);
  const record = await outbox.get("evt-1");
  assert.equal(record?.status, "failed");
});

test("a 429 (retryable 4xx) is retried and a later 2xx succeeds", async (t) => {
  const receiver = await startFakeReceiver((_req, i) => ({ status: i === 0 ? 429 : 200 }));
  t.after(() => stop(receiver.server));

  const result = await deliverWebhookEvent(makeEvent(), receiver.url, { secret: SECRET, sleep: noSleep, maxAttempts: 5 });

  assert.deepEqual(result, { delivered: true, attempts: 2, status: 200 });
  assert.equal(receiver.requests.length, 2);
});

test("a 408 (retryable 4xx) is retried and a later 2xx succeeds", async (t) => {
  const receiver = await startFakeReceiver((_req, i) => ({ status: i === 0 ? 408 : 200 }));
  t.after(() => stop(receiver.server));

  const result = await deliverWebhookEvent(makeEvent(), receiver.url, { secret: SECRET, sleep: noSleep, maxAttempts: 5 });

  assert.deepEqual(result, { delivered: true, attempts: 2, status: 200 });
});

test("repeated 503s are retried until success within the attempt budget", async (t) => {
  const receiver = await startFakeReceiver((_req, i) => ({ status: i < 2 ? 503 : 200 }));
  t.after(() => stop(receiver.server));

  const result = await deliverWebhookEvent(makeEvent(), receiver.url, { secret: SECRET, sleep: noSleep, maxAttempts: 5 });

  assert.deepEqual(result, { delivered: true, attempts: 3, status: 200 });
  assert.equal(receiver.requests.length, 3);
});

test("exhausting maxAttempts on persistent 500s ends delivered:false with attempts === maxAttempts, outbox marked dead", async (t) => {
  const receiver = await startFakeReceiver(() => ({ status: 500 }));
  t.after(() => stop(receiver.server));

  const outbox = new InMemoryWebhookOutbox();
  const result = await deliverWebhookEvent(
    makeEvent(),
    receiver.url,
    { secret: SECRET, sleep: noSleep, maxAttempts: 4 },
    outbox,
  );

  assert.equal(result.delivered, false);
  assert.equal(result.attempts, 4);
  assert.equal(receiver.requests.length, 4);
  const record = await outbox.get("evt-1");
  assert.equal(record?.status, "dead");
  assert.equal(record?.attempts, 4);
});

test("a network error (connection refused — no receiver listening) is retried like a 5xx", async () => {
  // Nothing is listening on this port: every attempt is a real ECONNREFUSED, not a mocked error.
  const deadUrl = "http://127.0.0.1:1/webhooks";
  const result = await deliverWebhookEvent(makeEvent(), deadUrl, { secret: SECRET, sleep: noSleep, maxAttempts: 2 });
  assert.equal(result.delivered, false);
  assert.equal(result.attempts, 2);
});

test("idempotency: the raw body and X-VC-Event-Id are byte-identical across every retry attempt", async (t) => {
  const receiver = await startFakeReceiver((_req, i) => ({ status: i < 3 ? 500 : 200 }));
  t.after(() => stop(receiver.server));

  await deliverWebhookEvent(makeEvent("evt-idempotent"), receiver.url, { secret: SECRET, sleep: noSleep, maxAttempts: 5 });

  assert.equal(receiver.requests.length, 4);
  const bodies = receiver.requests.map((r) => r.body);
  const eventIds = receiver.requests.map((r) => r.headers[WEBHOOK_EVENT_ID_HEADER.toLowerCase()]);
  assert.ok(bodies.every((b) => b === bodies[0]), "every attempt must send the exact same raw body");
  assert.ok(eventIds.every((id) => id === "evt-idempotent"), "every attempt must send the same idempotency key");
});

test("the timestamp/signature are refreshed per attempt, and each attempt's headers independently verify against its own timestamp", async (t) => {
  const receiver = await startFakeReceiver((_req, i) => ({ status: i < 2 ? 500 : 200 }));
  t.after(() => stop(receiver.server));

  let tick = 0;
  const nowMs = () => {
    tick += 1;
    // Simulate real elapsed time between attempts (bigger than the default sleep would allow us to
    // observe with fake/no sleep) so a naive "sign once, reuse forever" implementation would show a
    // stale first timestamp on later attempts.
    return 1_700_000_000_000 + tick * 60_000;
  };

  await deliverWebhookEvent(makeEvent("evt-refresh"), receiver.url, { secret: SECRET, sleep: noSleep, maxAttempts: 5, nowMs });

  assert.equal(receiver.requests.length, 3);
  const timestamps = receiver.requests.map((r) => r.headers[WEBHOOK_TIMESTAMP_HEADER.toLowerCase()] as string);
  // Distinct timestamps prove the signature was recomputed, not reused, on every attempt.
  assert.equal(new Set(timestamps).size, 3);

  for (const req of receiver.requests) {
    const verify = verifyWebhookSignature({
      rawBody: req.body,
      signature: req.headers[WEBHOOK_SIGNATURE_HEADER.toLowerCase()] as string,
      timestamp: req.headers[WEBHOOK_TIMESTAMP_HEADER.toLowerCase()] as string,
      secret: SECRET,
      nowMs: Number(req.headers[WEBHOOK_TIMESTAMP_HEADER.toLowerCase()] as string), // "arrives immediately" relative to its own timestamp
    });
    assert.deepEqual(verify, { ok: true });
  }
});

test("backoff is genuinely applied between attempts (recorded via an injectable sleep spy, deterministic jitter)", async (t) => {
  const receiver = await startFakeReceiver((_req, i) => ({ status: i < 2 ? 500 : 200 }));
  t.after(() => stop(receiver.server));

  const delays: number[] = [];
  const spySleep = async (ms: number) => {
    delays.push(ms);
  };
  const alwaysMax = () => 1; // deterministic: full-jitter upper bound every time

  await deliverWebhookEvent(makeEvent("evt-backoff"), receiver.url, {
    secret: SECRET,
    sleep: spySleep,
    random: alwaysMax,
    maxAttempts: 5,
  });

  // 2 failures -> 2 backoff sleeps before the 3rd (successful) attempt; no sleep after success.
  assert.deepEqual(delays, [
    computeWebhookBackoffMs(1, DELIVERY_DEFAULT_BASE_DELAY_MS, DELIVERY_DEFAULT_MAX_DELAY_MS, alwaysMax),
    computeWebhookBackoffMs(2, DELIVERY_DEFAULT_BASE_DELAY_MS, DELIVERY_DEFAULT_MAX_DELAY_MS, alwaysMax),
  ]);
});
