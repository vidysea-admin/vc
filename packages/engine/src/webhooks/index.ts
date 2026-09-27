/**
 * B21 signed webhooks (D-021): barrel export for the event envelope, HMAC signing/verification,
 * delivery-with-retry, the pluggable outbox interface (in-memory, T-027, and Mongo-backed, T-034),
 * the fact-approved / erasure-requested emission-hook builders (T-034), and the recoverable emit-gap
 * ledger for a readback discrepancy or an enqueue failure (T-042, ISS-085). See schemas.ts,
 * signing.ts, delivery.ts, outbox.ts and gaps.ts for the design notes. The concern-flagged emission
 * hook remains a typed TODO (ISS-t-034-concern-hook): its call site is in packages/engine/src/scribe,
 * which T-012 is actively changing in parallel.
 */
export * from "./schemas.js";
export * from "./signing.js";
export * from "./outbox.js";
export * from "./delivery.js";
export * from "./gaps.js";
