#!/usr/bin/env tsx
/**
 * LIVE DB init script for `virtual_counsellor` on the production Mongo server
 * (contract B12, D-008/D-009, qa/gates/mongo-host.md).
 *
 * THIS SCRIPT IS WRITTEN BUT NOT RUN BY T-003. It connects to a real server —
 * running it is an explicit, separate, human-invoked action. See
 * packages/db/README.md for the documented command.
 *
 * It creates the engine's collections (if missing) and a small set of
 * indexes:
 *   - facts:    { studentId, key, validTo } — fast lookup of a student's
 *               active fact for a given key (validTo unset = active).
 *   - consents: { studentId } — fast lookup for requireConsent().
 *   - edges:    relies on Mongo's built-in unique _id index; link() already
 *               derives a deterministic _id, so no extra index is created.
 *
 * It never calls db.dropDatabase() (D-009: that stays human-gated) and never
 * touches any database other than virtual_counsellor (getVcDb enforces this).
 */
import { connectFromEnv } from "../src/client.js";
import { COLLECTION_NAMES } from "../src/collections.js";

async function ensureCollection(db: import("mongodb").Db, name: string): Promise<void> {
  try {
    await db.createCollection(name);
  } catch (err) {
    const codeName = (err as { codeName?: string } | undefined)?.codeName;
    if (codeName !== "NamespaceExists") throw err;
  }
}

async function main(): Promise<void> {
  const { client, db } = connectFromEnv(process.env);
  await client.connect();
  try {
    for (const name of Object.values(COLLECTION_NAMES)) {
      await ensureCollection(db, name);
    }

    await db
      .collection(COLLECTION_NAMES.facts)
      .createIndex({ studentId: 1, key: 1, validTo: 1 }, { name: "facts_studentId_key_validTo" });

    await db.collection(COLLECTION_NAMES.consents).createIndex({ studentId: 1 }, { name: "consents_studentId" });

    // eslint-disable-next-line no-console
    console.log(`db-init: "${COLLECTION_NAMES.facts}", "${COLLECTION_NAMES.consents}" and sibling collections ready in virtual_counsellor`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("db-init failed:", err);
  process.exit(1);
});
