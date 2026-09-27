/**
 * B21 signed webhooks (D-021), CORE ONLY (T-027): a pluggable outbox interface. This unit ships
 * only an in-memory implementation, for tests. The Mongo-backed outbox collection lands after
 * T-025 (explicitly NOT in this unit's scope). Any implementation only needs to store what
 * delivery.ts's `deliverWebhookEvent` reads back: the event (never re-serialized, so a Mongo
 * implementation must round-trip it byte-identical too) and delivery bookkeeping keyed by the
 * event's own idempotency key (`event.id`).
 */
import type { WebhookEvent } from "./schemas.js";

export type OutboxRecordStatus = "pending" | "delivered" | "failed" | "dead";

export interface OutboxRecord {
  /** Always equal to `event.id` — the idempotency key (B21). */
  id: string;
  event: WebhookEvent;
  destinationUrl: string;
  status: OutboxRecordStatus;
  attempts: number;
  lastStatus?: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export type OutboxRecordInput = Pick<OutboxRecord, "id" | "event" | "destinationUrl">;

export type OutboxRecordPatch = Partial<
  Pick<OutboxRecord, "status" | "attempts" | "lastStatus" | "lastError">
>;

/** A pluggable delivery ledger. `enqueue` is idempotent by `id`: enqueuing the same id twice never
 * creates a second row or resets an in-flight record's bookkeeping — it returns the existing row. */
export interface WebhookOutbox {
  enqueue(record: OutboxRecordInput): Promise<OutboxRecord>;
  get(id: string): Promise<OutboxRecord | undefined>;
  update(id: string, patch: OutboxRecordPatch): Promise<OutboxRecord>;
  list(): Promise<OutboxRecord[]>;
}

/** In-memory WebhookOutbox for tests (B8/B13 — no real network, no real DB). */
export class InMemoryWebhookOutbox implements WebhookOutbox {
  private readonly records = new Map<string, OutboxRecord>();

  async enqueue(input: OutboxRecordInput): Promise<OutboxRecord> {
    const existing = this.records.get(input.id);
    if (existing) return existing;
    const now = new Date().toISOString();
    const record: OutboxRecord = {
      ...input,
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(input.id, record);
    return record;
  }

  async get(id: string): Promise<OutboxRecord | undefined> {
    return this.records.get(id);
  }

  async update(id: string, patch: OutboxRecordPatch): Promise<OutboxRecord> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`InMemoryWebhookOutbox.update: no record for id "${id}"`);
    const updated: OutboxRecord = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    return updated;
  }

  async list(): Promise<OutboxRecord[]> {
    return Array.from(this.records.values());
  }
}
