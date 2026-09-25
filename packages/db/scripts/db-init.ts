#!/usr/bin/env tsx
/**
 * LIVE DB init script for `virtual_counsellor` on the production Mongo server
 * (contract B12, D-008/D-009, qa/gates/mongo-host.md).
 *
 * THIS SCRIPT IS WRITTEN BUT NOT RUN BY T-003/T-003b. It connects to a real
 * server — running it is an explicit, separate, human-invoked action. See
 * packages/db/README.md for the documented command.
 *
 * `INDEX_PLAN` below is a plain data array (no Mongo, no side effects) so
 * offline tests (tests/db-init.test.ts, ISS-027) can import and introspect it
 * without connecting to anything (contract B8). `main()` only runs when this
 * file is executed directly (the entrypoint check at the bottom) — importing
 * it for `INDEX_PLAN` never triggers a connection attempt.
 *
 * The plan creates the engine's collections (if missing) and this index set:
 *   - facts:    UNIQUE partial index on { studentId, key } where `validTo` is
 *               unset — at most one active fact per (studentId, key)
 *               (ISS-019). This is what makes a concurrent-writer race a real
 *               Mongo duplicate-key error (code 11000) instead of silently
 *               producing two open facts; src/facts.ts's applyApprovedDiff
 *               handles that error deterministically (see its docstring).
 *               PLUS a plain (non-partial) { studentId } index (ISS-027) —
 *               the unique partial index above only covers OPEN facts, so a
 *               query across a student's full fact history (including
 *               superseded ones) needs its own, unrestricted index.
 *               NO index on { studentId, key, contentHash } (D-012): no query
 *               filters on `contentHash`. applyApprovedDiff reads the ACTIVE
 *               fact by { studentId, key, validTo unset } (served by the
 *               unique partial index above) and compares its contentHash in
 *               memory, so such an index would only cost writes. Add it if a
 *               future reader ever queries history by content.
 *   - sessions, decisions, students: plain { studentId } index each
 *               (ISS-027) — every studentId-bearing collection gets a lookup
 *               index; consents already had one.
 *   - consents: { studentId } — fast lookup for requireConsent().
 *   - edges:    relies on Mongo's built-in unique _id index for idempotent
 *               link() upserts, PLUS { "from.kind", "from.id" } and
 *               { "to.kind", "to.id" } (ISS-021) so a lookup of "everything
 *               sourced from X" or "everything pointing at Y" isn't a full
 *               collection scan.
 *               ERASURE NOTE (B15, for T-011): edge docs carry no studentId.
 *               Erasing a student's edges resolves in TWO hops: first collect
 *               the student's fact _ids (facts by studentId, full history)
 *               and session ids (sessions by studentId), then delete edges
 *               whose from.id or to.id is one of those ids, plus the
 *               student --has--> edges ({ "from.kind": "student",
 *               "from.id": studentId }). The edges_from / edges_to indexes
 *               below serve both hops.
 *
 * It never calls db.dropDatabase() (D-009: that stays human-gated) and never
 * touches any database other than virtual_counsellor (getVcDb enforces this).
 */
import { fileURLToPath } from "node:url";
import { connectFromEnv } from "../src/client.js";
import { COLLECTION_NAMES } from "../src/collections.js";

export interface IndexSpec {
  collection: string;
  keys: Record<string, 1 | -1>;
  name: string;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

/**
 * The full index plan as data, so it can be introspected offline
 * (tests/db-init.test.ts, ISS-027) and executed for real by `main()` below —
 * a single source of truth for both.
 */
export const INDEX_PLAN: IndexSpec[] = [
  // ISS-019: unique among docs where validTo is unset — at most one open
  // fact per (studentId, key). See the module docstring for why.
  {
    collection: COLLECTION_NAMES.facts,
    keys: { studentId: 1, key: 1 },
    name: "facts_studentId_key_active_unique",
    unique: true,
    partialFilterExpression: { validTo: { $exists: false } },
  },
  // ISS-027: plain studentId indexes on every studentId-bearing collection
  // (consents already had one).
  { collection: COLLECTION_NAMES.facts, keys: { studentId: 1 }, name: "facts_studentId" },
  { collection: COLLECTION_NAMES.sessions, keys: { studentId: 1 }, name: "sessions_studentId" },
  { collection: COLLECTION_NAMES.decisions, keys: { studentId: 1 }, name: "decisions_studentId" },
  { collection: COLLECTION_NAMES.students, keys: { studentId: 1 }, name: "students_studentId" },
  { collection: COLLECTION_NAMES.consents, keys: { studentId: 1 }, name: "consents_studentId" },
  // ISS-021: edges had no from/to index.
  { collection: COLLECTION_NAMES.edges, keys: { "from.kind": 1, "from.id": 1 }, name: "edges_from" },
  { collection: COLLECTION_NAMES.edges, keys: { "to.kind": 1, "to.id": 1 }, name: "edges_to" },
];

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

    for (const spec of INDEX_PLAN) {
      await db.collection(spec.collection).createIndex(spec.keys, {
        name: spec.name,
        unique: spec.unique,
        partialFilterExpression: spec.partialFilterExpression,
      });
    }

    // eslint-disable-next-line no-console
    console.log(`db-init: "${COLLECTION_NAMES.facts}", "${COLLECTION_NAMES.consents}" and sibling collections ready in virtual_counsellor`);
  } finally {
    await client.close();
  }
}

// Only run against a real server when this file is executed directly (e.g.
// `pnpm db:init`) — never as a side effect of importing it, so offline tests
// can read `INDEX_PLAN` without connecting to anything (contract B8).
const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("db-init failed:", err);
    process.exit(1);
  });
}
