/**
 * The `edges` collection (ARCHITECTURE.md H3): a generic {from, to, rel} graph
 * edge, e.g. fact --sourced_from--> transcript_turn, student --has--> fact.
 */
import type { Collection } from "mongodb";

export interface EdgeRef {
  kind: string;
  id: string;
}

export interface EdgeDoc {
  _id: string;
  from: EdgeRef;
  to: EdgeRef;
  rel: string;
  createdAt: string;
}

export type Edge = EdgeDoc;

/**
 * Deterministic id for an edge, so `link()` is idempotent: calling it twice
 * for the same (from, to, rel) writes exactly one document.
 */
export function deriveEdgeId(from: EdgeRef, to: EdgeRef, rel: string): string {
  return `${from.kind}:${from.id}->${rel}->${to.kind}:${to.id}`;
}

/**
 * Upserts an edge document keyed by its derived _id. A second call with the
 * same (from, to, rel) is a no-op against the stored document (createdAt is
 * only set on the first insert, via $setOnInsert).
 */
export async function link(edges: Collection<EdgeDoc>, from: EdgeRef, to: EdgeRef, rel: string): Promise<EdgeDoc> {
  const _id = deriveEdgeId(from, to, rel);
  const createdAt = new Date().toISOString();
  await edges.updateOne(
    { _id },
    { $setOnInsert: { _id, from, to, rel, createdAt } },
    { upsert: true },
  );
  const stored = await edges.findOne({ _id });
  return stored ?? { _id, from, to, rel, createdAt };
}
