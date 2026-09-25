/**
 * Runtime checkpointer for the scribe graph (H1/D-002): LangGraph's MongoDBSaver, bound to the
 * engine's one database (B12). Never used by tests (B8); tests use MemorySaver.
 *
 * MongoDBSaver opens the database on the client itself (by `dbName`), and with `dbName` omitted the driver would use the
 * URI's default database. So the name is always passed explicitly as VC_DB_NAME
 * ("virtual_counsellor"), and the collections are the engine's own (full CRUD inside that database,
 * D-009). Runtime startup uses initScribeCheckpointer, which also runs the saver's setup() (its
 * indexes; db-init's INDEX_PLAN mirrors them exactly, so either order is a no-op for the other).
 *
 * DPDP (B15 / T-011): checkpoints hold the session transcript and extracted facts. Erasure deletes
 * this student's documents in these two collections by thread_id: scribeThreadId(sessionId) for each
 * of the student's sessions, every thread the scribe recorded on the session row before its first
 * checkpoint (T-016 `scribeThreadIds`), and every claimed thread.
 */
import type { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { VC_DB_NAME } from "@vc/db";

export const SCRIBE_CHECKPOINT_COLLECTIONS = {
  checkpoints: "scribe_checkpoints",
  writes: "scribe_checkpoint_writes",
} as const;

export function createScribeCheckpointer(client: MongoClient): MongoDBSaver {
  return new MongoDBSaver({
    client,
    dbName: VC_DB_NAME,
    checkpointCollectionName: SCRIBE_CHECKPOINT_COLLECTIONS.checkpoints,
    checkpointWritesCollectionName: SCRIBE_CHECKPOINT_COLLECTIONS.writes,
  });
}

/**
 * T-016 / ISS-t-007-rev-6: the runtime entry point. Builds the saver AND awaits its setup() (the
 * indexes on scribe_checkpoints / scribe_checkpoint_writes). MongoDBSaver.setup() does not throw:
 * it returns the rejected index builds as an array. This turns a non-empty array into a thrown
 * AggregateError, so a startup whose checkpoint indexes failed never serves traffic unnoticed.
 * Connects nothing by itself beyond the index commands (B8: tests pass the offline fake client).
 */
export async function initScribeCheckpointer(client: MongoClient): Promise<MongoDBSaver> {
  const saver = createScribeCheckpointer(client);
  const errors = await saver.setup();
  if (errors.length > 0) {
    const detail = errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
    throw new AggregateError(errors, `initScribeCheckpointer: MongoDBSaver.setup() failed: ${detail}`);
  }
  return saver;
}
