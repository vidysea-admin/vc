/**
 * B21 signed webhooks (D-021): delivery with retry, exponential backoff and full jitter, a maximum
 * attempt count, and a byte-identical idempotency key + body across every retry (T-027). T-034 adds
 * `drainWebhookOutbox`, the worker that drains a WebhookOutbox through this same path. No real
 * network in tests (B8/B13) — a local in-process fake receiver stands in for the client endpoint
 * (Pathlynks in production).
 */
import { buildSignedWebhookHeaders } from "./signing.js";
import type { WebhookEvent } from "./schemas.js";
import type { WebhookOutbox } from "./outbox.js";

export const DELIVERY_DEFAULT_MAX_ATTEMPTS = 6;
export const DELIVERY_DEFAULT_BASE_DELAY_MS = 500;
export const DELIVERY_DEFAULT_MAX_DELAY_MS = 30_000;

/**
 * Full-jitter exponential backoff (AWS "Exponential Backoff And Jitter"): a uniformly random delay
 * in `[0, min(maxDelayMs, baseDelayMs * 2^(attempt-1))]`. `attempt` is 1-based (the attempt number
 * that just failed). Same formula as the provider failover chain's `computeBackoffMs`
 * (packages/providers/src/index.ts) — kept as its own copy here since packages/engine does not
 * depend on packages/providers for this unit's scope, and the two retry policies are independently
 * tunable. `random` is injectable so tests can make the jitter deterministic.
 */
export function computeWebhookBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(random() * cap);
}

/** A 4xx that must still be retried — a transient, client-visible condition, not a real rejection. */
const RETRYABLE_4XX_STATUSES: ReadonlySet<number> = new Set([408, 429]);

/** true for any 5xx, or a 4xx in the small retryable allowlist (408, 429). Every other 4xx (400,
 * 401, 403, 404, 422, ...) is a real rejection and must NOT be retried. */
export function isRetryableDeliveryStatus(status: number): boolean {
  if (status >= 500) return true;
  return RETRYABLE_4XX_STATUSES.has(status);
}

export interface DeliverWebhookOptions {
  /** The signing secret (VC_WEBHOOK_SECRET's value — read by the caller from env, never by this
   * module directly, so this file never touches `process.env` itself). */
  secret: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable HTTP client (defaults to the global `fetch`) so tests hit an in-process fake
   * receiver instead of a real network endpoint. */
  fetchImpl?: typeof fetch;
  /** Injectable sleep so tests don't wait on real backoff delays. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  nowMs?: () => number;
}

export type DeliveryResult =
  | { delivered: true; attempts: number; status: number }
  | { delivered: false; attempts: number; status?: number; error: string };

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delivers one event to `destinationUrl`. Retries on a network/fetch error and on any retryable
 * status (`isRetryableDeliveryStatus`); stops immediately, no retry, on any other non-2xx status.
 * A 2xx response means delivered.
 *
 * The idempotency key (`X-VC-Event-Id`, always `event.id`) and the raw request body are computed
 * ONCE, outside the retry loop, and reused byte-identical on every attempt — the receiver sees the
 * exact same bytes and the exact same event id no matter how many attempts it took. Only the
 * timestamp (and therefore the signature, which is derived from timestamp + body) is refreshed on
 * every attempt, so a delivery that takes several backoff cycles to succeed never fails the
 * receiver's own replay-window check (verifyWebhookSignature) against a now-stale first timestamp.
 *
 * When `outbox` is given, it is enqueued once up front and updated after every attempt (and once
 * more at the end) so a caller can inspect delivery state without threading it through by hand.
 */
export async function deliverWebhookEvent(
  event: WebhookEvent,
  destinationUrl: string,
  options: DeliverWebhookOptions,
  outbox?: WebhookOutbox,
): Promise<DeliveryResult> {
  const maxAttempts = options.maxAttempts ?? DELIVERY_DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DELIVERY_DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DELIVERY_DEFAULT_MAX_DELAY_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const now = options.nowMs ?? Date.now;
  const { secret } = options;

  // Computed ONCE: byte-identical across every attempt (see docstring above).
  const rawBody = JSON.stringify(event);

  if (outbox) await outbox.enqueue({ id: event.id, event, destinationUrl });

  let lastError = "";
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const headers = buildSignedWebhookHeaders(rawBody, event.id, secret, now());

    try {
      const response = await fetchImpl(destinationUrl, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: rawBody,
      });

      if (response.ok) {
        if (outbox) {
          await outbox.update(event.id, { status: "delivered", attempts: attempt, lastStatus: response.status });
        }
        return { delivered: true, attempts: attempt, status: response.status };
      }

      lastStatus = response.status;
      lastError = `http_${response.status}`;

      if (!isRetryableDeliveryStatus(response.status)) {
        if (outbox) {
          await outbox.update(event.id, { status: "failed", attempts: attempt, lastStatus: response.status, lastError });
        }
        return { delivered: false, attempts: attempt, status: response.status, error: lastError };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (outbox) await outbox.update(event.id, { status: "pending", attempts: attempt, lastStatus, lastError });

    if (attempt < maxAttempts) {
      const backoffMs = computeWebhookBackoffMs(attempt, baseDelayMs, maxDelayMs, random);
      await sleep(backoffMs);
    }
  }

  if (outbox) await outbox.update(event.id, { status: "dead", attempts: maxAttempts, lastStatus, lastError });
  return { delivered: false, attempts: maxAttempts, status: lastStatus, error: lastError };
}

/**
 * T-034: the delivery worker. Drains every `pending` (and, on an explicit retry sweep, `failed`)
 * record currently in `outbox` by calling `deliverWebhookEvent` for each one's own event and
 * `destinationUrl` — the SAME retry/backoff/signing path a fresh call gets, so a record that was
 * left mid-retry by a crashed process picks up exactly where deliverWebhookEvent's own bookkeeping
 * left it (its `attempts` counter is per-call, not cumulative across drains — see the Open gaps
 * note in the unit manifest about a future max-lifetime-attempts cap).
 *
 * `options.includeFailed` (default false) also retries records the LAST drain marked `failed` (a
 * non-retryable status like 400/401/404) — off by default because those are real rejections, not
 * transient ones, and blindly re-sending them would just burn attempts. `dead` records (exhausted
 * their own maxAttempts) are never retried by this function; picking them back up is a deliberate,
 * separate operator action (not built by this unit).
 *
 * Never touches the real network in a test: `options.fetchImpl` (threaded straight through to
 * `deliverWebhookEvent`) is the seam a test replaces with an in-process fake receiver (B8/B13).
 */
export async function drainWebhookOutbox(
  outbox: WebhookOutbox,
  options: DeliverWebhookOptions & { includeFailed?: boolean },
): Promise<DeliveryResult[]> {
  const wanted: ReadonlySet<string> = options.includeFailed ? new Set(["pending", "failed"]) : new Set(["pending"]);
  const { fetchImpl, sleep, random, nowMs, maxAttempts, baseDelayMs, maxDelayMs, secret } = options;
  const deliverOptions: DeliverWebhookOptions = { secret, maxAttempts, baseDelayMs, maxDelayMs, fetchImpl, sleep, random, nowMs };
  const all = await outbox.list();
  const due = all.filter((record) => wanted.has(record.status));
  const results: DeliveryResult[] = [];
  for (const record of due) {
    results.push(await deliverWebhookEvent(record.event, record.destinationUrl, deliverOptions, outbox));
  }
  return results;
}
