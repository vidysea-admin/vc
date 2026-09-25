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

export interface LinkOptions {
  /** mongodb@6 per-operation timeout (CSOT), e.g. a fence-aware writer's remaining deadline (D-016). */
  timeoutMS?: number;
  /** Called when THIS call inserted the edge (an upsert), not when it already existed (ISS-t-011-c2-rev-3). */
  onCreated?: (edgeId: string) => void;
}

/**
 * Upserts an edge document keyed by its derived _id. A second call with the
 * same (from, to, rel) is a no-op against the stored document (createdAt is
 * only set on the first insert, via $setOnInsert). `onCreated` tells a
 * fence-aware caller which edges it created, so its undo never deletes an edge
 * that existed before it (D-016).
 */
export async function link(
  edges: Collection<EdgeDoc>,
  from: EdgeRef,
  to: EdgeRef,
  rel: string,
  options: LinkOptions = {},
): Promise<EdgeDoc> {
  const _id = deriveEdgeId(from, to, rel);
  const createdAt = new Date().toISOString();
  const opOptions = options.timeoutMS === undefined ? {} : { timeoutMS: options.timeoutMS };
  const res = await edges.updateOne(
    { _id },
    { $setOnInsert: { _id, from, to, rel, createdAt } },
    { upsert: true, ...opOptions },
  );
  if ((res.upsertedCount ?? 0) > 0 || (res.upsertedId !== null && res.upsertedId !== undefined)) options.onCreated?.(_id);
  const stored = await edges.findOne({ _id }, opOptions);
  return stored ?? { _id, from, to, rel, createdAt };
}
