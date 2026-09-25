/**
 * Runtime checkpointer for the scribe graph (H1/D-002): LangGraph's MongoDBSaver, bound to the
 * engine's one database (B12). Never used by tests (B8); tests use MemorySaver.
 *
 * MongoDBSaver opens the database on the client itself (by `dbName`), and with `dbName` omitted the driver would use the
 * URI's default database. So the name is always passed explicitly as VC_DB_NAME
 * ("virtual_counsellor"), and the collections are the engine's own (full CRUD inside that database,
 * D-009). Call `await saver.setup()` once at startup to create its indexes.
 *
 * DPDP (B15 / T-011): checkpoints hold the session transcript and extracted facts. Erasure must also
 * delete this student's documents in these two collections, found by thread_id
 * (scribeThreadId(sessionId) for each of the student's sessions).
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
