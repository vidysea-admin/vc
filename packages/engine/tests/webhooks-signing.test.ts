/**
 * T-027 (B21 signed webhooks, D-021, core only): HMAC-SHA256 signing + receiver-side verification,
 * replay window, constant-time compare. Hostile-variant coverage (B7-style discipline: missing,
 * stale, future-dated, tampered).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSignedWebhookHeaders,
  verifyWebhookSignature,
  signWebhookPayload,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_EVENT_ID_HEADER,
  DEFAULT_REPLAY_TOLERANCE_MS,
} from "../src/webhooks/signing.js";

const SECRET = "test-secret-do-not-use-in-prod";
const RAW_BODY = JSON.stringify({ id: "evt-1", type: "erasure.requested" });

test("a freshly signed payload verifies ok", () => {
  const now = Date.now();
  const headers = buildSignedWebhookHeaders(RAW_BODY, "evt-1", SECRET, now);
  assert.equal(headers[WEBHOOK_EVENT_ID_HEADER], "evt-1");
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature: headers[WEBHOOK_SIGNATURE_HEADER],
    timestamp: headers[WEBHOOK_TIMESTAMP_HEADER],
    secret: SECRET,
    nowMs: now + 1000, // a small, realistic delivery delay
  });
  assert.deepEqual(result, { ok: true });
});

test("a missing signature is rejected", () => {
  const now = Date.now();
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature: undefined,
    timestamp: String(now),
    secret: SECRET,
  });
  assert.deepEqual(result, { ok: false, reason: "missing_signature" });
});

test("a missing timestamp is rejected", () => {
  const now = Date.now();
  const signature = signWebhookPayload(RAW_BODY, now, SECRET);
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature,
    timestamp: undefined,
    secret: SECRET,
  });
  assert.deepEqual(result, { ok: false, reason: "missing_timestamp" });
});

test("a non-numeric timestamp is rejected as invalid, not crashed on", () => {
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature: "deadbeef",
    timestamp: "not-a-number",
    secret: SECRET,
  });
  assert.deepEqual(result, { ok: false, reason: "invalid_timestamp" });
});

test("ISS-t-027-rev-1: a non-canonical timestamp ('123.0', a decimal that Number() still parses as an integer) is rejected as invalid", () => {
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature: "deadbeef",
    timestamp: "123.0",
    secret: SECRET,
  });
  assert.deepEqual(result, { ok: false, reason: "invalid_timestamp" });
});

test("ISS-t-027-rev-1: exponent notation ('1e12', also Number.isInteger-true) is rejected as invalid", () => {
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature: "deadbeef",
    timestamp: "1e12",
    secret: SECRET,
  });
  assert.deepEqual(result, { ok: false, reason: "invalid_timestamp" });
});

test("ISS-t-027-rev-1: a leading '+' or whitespace is rejected as invalid (only bare digits are canonical)", () => {
  assert.deepEqual(
    verifyWebhookSignature({ rawBody: RAW_BODY, signature: "deadbeef", timestamp: "+123", secret: SECRET }),
    { ok: false, reason: "invalid_timestamp" },
  );
  assert.deepEqual(
    verifyWebhookSignature({ rawBody: RAW_BODY, signature: "deadbeef", timestamp: " 123", secret: SECRET }),
    { ok: false, reason: "invalid_timestamp" },
  );
});

test("a stale timestamp (older than the replay window) is rejected", () => {
  const now = Date.now();
  const staleTimestamp = now - DEFAULT_REPLAY_TOLERANCE_MS - 1000;
  const signature = signWebhookPayload(RAW_BODY, staleTimestamp, SECRET);
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature,
    timestamp: String(staleTimestamp),
    secret: SECRET,
    nowMs: now,
  });
  assert.deepEqual(result, { ok: false, reason: "stale" });
});

test("a future-dated timestamp (beyond the replay window) is rejected", () => {
  const now = Date.now();
  const futureTimestamp = now + DEFAULT_REPLAY_TOLERANCE_MS + 1000;
  const signature = signWebhookPayload(RAW_BODY, futureTimestamp, SECRET);
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature,
    timestamp: String(futureTimestamp),
    secret: SECRET,
    nowMs: now,
  });
  assert.deepEqual(result, { ok: false, reason: "future_dated" });
});

test("a timestamp exactly at the tolerance boundary still verifies", () => {
  const now = Date.now();
  const boundaryTimestamp = now - DEFAULT_REPLAY_TOLERANCE_MS;
  const signature = signWebhookPayload(RAW_BODY, boundaryTimestamp, SECRET);
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature,
    timestamp: String(boundaryTimestamp),
    secret: SECRET,
    nowMs: now,
  });
  assert.deepEqual(result, { ok: true });
});

test("a tampered body (signature computed over different bytes) is rejected", () => {
  const now = Date.now();
  const headers = buildSignedWebhookHeaders(RAW_BODY, "evt-1", SECRET, now);
  const tamperedBody = JSON.stringify({ id: "evt-1", type: "erasure.requested", extra: "injected" });
  const result = verifyWebhookSignature({
    rawBody: tamperedBody,
    signature: headers[WEBHOOK_SIGNATURE_HEADER],
    timestamp: headers[WEBHOOK_TIMESTAMP_HEADER],
    secret: SECRET,
    nowMs: now,
  });
  assert.deepEqual(result, { ok: false, reason: "signature_mismatch" });
});

test("a tampered signature (one hex character flipped) is rejected", () => {
  const now = Date.now();
  const headers = buildSignedWebhookHeaders(RAW_BODY, "evt-1", SECRET, now);
  const sig = headers[WEBHOOK_SIGNATURE_HEADER];
  const flipped = (sig[0] === "0" ? "1" : "0") + sig.slice(1);
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature: flipped,
    timestamp: headers[WEBHOOK_TIMESTAMP_HEADER],
    secret: SECRET,
    nowMs: now,
  });
  assert.deepEqual(result, { ok: false, reason: "signature_mismatch" });
});

test("a signature of the wrong length is rejected without throwing", () => {
  const now = Date.now();
  assert.doesNotThrow(() => {
    const result = verifyWebhookSignature({
      rawBody: RAW_BODY,
      signature: "short",
      timestamp: String(now),
      secret: SECRET,
      nowMs: now,
    });
    assert.deepEqual(result, { ok: false, reason: "signature_mismatch" });
  });
});

test("a signature signed with the wrong secret is rejected", () => {
  const now = Date.now();
  const signature = signWebhookPayload(RAW_BODY, now, "a-different-secret");
  const result = verifyWebhookSignature({
    rawBody: RAW_BODY,
    signature,
    timestamp: String(now),
    secret: SECRET,
    nowMs: now,
  });
  assert.deepEqual(result, { ok: false, reason: "signature_mismatch" });
});
