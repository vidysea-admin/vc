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
 *   - facts:    UNIQUE partial index on { studentId, key } where `validTo` is
 *               unset — at most one active fact per (studentId, key)
 *               (ISS-019). This is what makes a concurrent-writer race a real
 *               Mongo duplicate-key error (code 11000) instead of silently
 *               producing two open facts; src/facts.ts's applyApprovedDiff
 *               handles that error deterministically (see its docstring).
 *   - consents: { studentId } — fast lookup for requireConsent().
 *   - edges:    relies on Mongo's built-in unique _id index for idempotent
 *               link() upserts, PLUS { "from.kind", "from.id" } and
 *               { "to.kind", "to.id" } (ISS-021) so a lookup of "everything
 *               sourced from X" or "everything pointing at Y" isn't a full
 *               collection scan.
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

    // ISS-019: unique among docs where validTo is unset — at most one open
    // fact per (studentId, key). See the module docstring for why.
    await db.collection(COLLECTION_NAMES.facts).createIndex(
      { studentId: 1, key: 1 },
      {
        name: "facts_studentId_key_active_unique",
        unique: true,
        partialFilterExpression: { validTo: { $exists: false } },
      },
    );

    await db.collection(COLLECTION_NAMES.consents).createIndex({ studentId: 1 }, { name: "consents_studentId" });

    // ISS-021: edges had no from/to index.
    await db
      .collection(COLLECTION_NAMES.edges)
      .createIndex({ "from.kind": 1, "from.id": 1 }, { name: "edges_from" });
    await db
      .collection(COLLECTION_NAMES.edges)
      .createIndex({ "to.kind": 1, "to.id": 1 }, { name: "edges_to" });

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
