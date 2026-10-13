/**
 * B21 signed webhooks (D-021), CORE ONLY (T-027): HMAC-SHA256 signing of the exact raw delivery
 * body, plus receiver-side verification with a bounded replay window and a constant-time compare.
 * The secret's NAME (never a value) is recorded in .env.example as VC_WEBHOOK_SECRET (B11 — secrets
 * are read only from .env, and this module never hardcodes or logs one).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_HEADER = "X-VC-Signature";
export const WEBHOOK_TIMESTAMP_HEADER = "X-VC-Timestamp";
export const WEBHOOK_EVENT_ID_HEADER = "X-VC-Event-Id";

/** Default replay tolerance either side of "now". A signature older or newer than this is
 * rejected even if it is otherwise byte-correct. */
export const DEFAULT_REPLAY_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * HMAC-SHA256 over `${timestampMs}.${rawBody}`, hex-encoded. `rawBody` must be the EXACT bytes the
 * receiver reads off the wire (never re-serialized on either side), so signer and verifier compute
 * over identical input.
 */
export function signWebhookPayload(rawBody: string, timestampMs: number, secret: string): string {
  return createHmac("sha256", secret).update(`${timestampMs}.${rawBody}`).digest("hex");
}

export type SignedWebhookHeaders = {
  [WEBHOOK_SIGNATURE_HEADER]: string;
  [WEBHOOK_TIMESTAMP_HEADER]: string;
  [WEBHOOK_EVENT_ID_HEADER]: string;
};

/** Builds the three headers one delivery attempt sends alongside `rawBody`. The timestamp (and
 * therefore the signature) is meant to be recomputed fresh on every retry attempt — see
 * delivery.ts — while `rawBody` and `eventId` stay byte-identical across all attempts. */
export function buildSignedWebhookHeaders(
  rawBody: string,
  eventId: string,
  secret: string,
  nowMs: number = Date.now(),
): SignedWebhookHeaders {
  return {
    [WEBHOOK_SIGNATURE_HEADER]: signWebhookPayload(rawBody, nowMs, secret),
    [WEBHOOK_TIMESTAMP_HEADER]: String(nowMs),
    [WEBHOOK_EVENT_ID_HEADER]: eventId,
  };
}

export type WebhookVerifyFailureReason =
  | "missing_signature"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "stale"
  | "future_dated"
  | "signature_mismatch";

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: WebhookVerifyFailureReason };

export interface VerifyWebhookSignatureParams {
  rawBody: string;
  signature: string | undefined | null;
  timestamp: string | undefined | null;
  secret: string;
  toleranceMs?: number;
  nowMs?: number;
}

/**
 * Receiver-side verification. Never throws — every malformed or hostile header combination returns
 * a typed `{ ok: false, reason }` instead of a crash. Rejects: a missing signature or timestamp, a
 * timestamp that doesn't parse, a stale timestamp (older than `toleranceMs`), a future-dated
 * timestamp (newer than `toleranceMs`), and a tampered signature (constant-time compare).
 */
export function verifyWebhookSignature(params: VerifyWebhookSignatureParams): WebhookVerifyResult {
  const {
    rawBody,
    signature,
    timestamp,
    secret,
    toleranceMs = DEFAULT_REPLAY_TOLERANCE_MS,
    nowMs = Date.now(),
  } = params;

  if (!signature) return { ok: false, reason: "missing_signature" };
  if (!timestamp) return { ok: false, reason: "missing_timestamp" };

  // ISS-t-027-rev-1: `Number("123.0")` and `Number("1e12")` both pass the old finite+integer check
  // (`Number.isInteger` is true for 123 and for 1e12, since both ARE mathematical integers once
  // coerced) even though neither is a canonical integer literal. Not exploitable — the HMAC is over
  // this parsed numeric value either way, so no signature could be forged this way — but a stray
  // decimal point or exponent should never be treated as a well-formed timestamp header. Requiring
  // an all-digit string before coercion rejects both, and everything else non-numeric, up front.
  if (!/^\d+$/.test(timestamp)) return { ok: false, reason: "invalid_timestamp" };
  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || !Number.isInteger(timestampMs)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const skewMs = nowMs - timestampMs;
  if (skewMs > toleranceMs) return { ok: false, reason: "stale" };
  if (skewMs < -toleranceMs) return { ok: false, reason: "future_dated" };

  const expected = signWebhookPayload(rawBody, timestampMs, secret);
  if (!constantTimeEqual(expected, signature)) return { ok: false, reason: "signature_mismatch" };

  return { ok: true };
}

/**
 * Constant-time string compare. Unequal lengths are treated as unequal WITHOUT calling
 * `timingSafeEqual` (which throws on unequal-length buffers) — the length check leaks only the
 * length, never a byte, and a genuine HMAC-SHA256 hex digest always has a fixed 64-character
 * length, so this early-return branch only ever fires for an already-tampered/malformed value.
 */
function constantTimeEqual(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected, "utf-8");
  const actualBuf = Buffer.from(actual, "utf-8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
